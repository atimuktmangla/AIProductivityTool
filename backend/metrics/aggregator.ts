import { getConfig } from '../config/env.js';
import { searchIssuesForDeveloper, getIssuesByKeys, resetFallbackEngaged, mergeIssuesByKey } from '../../databaselayer/services/jiraService.js';
import { getCachedIssuesForDeveloper } from '../../databaselayer/cache/jiraSearchCache.js';
import {
  getReposInProjectPublic,
  getUserDisplayName,
} from '../../databaselayer/services/bitbucketService.js';
import {
  getCachedMergedPRsByAuthor,
  getCachedPRDetails,
  getCachedReposForUser,
  getCachedFilteredReposForUser,
} from '../../databaselayer/cache/bitbucketCache.js';
import { getCachedOpenPRsByAuthor } from '../../databaselayer/cache/openPrCache.js';
import { getCachedReviewedPRsByUser } from '../../databaselayer/cache/reviewedPrCache.js';
import { concurrentMap } from '../util/concurrentMap.js';
import {
  computeCycleTimeHrs,
  computePickupDelayHrs,
  computeReviewLifecycleHrs,
} from './cycleTime.js';
import { computeReviewDepth } from './reviewDepth.js';
import { classifyWorkType } from './workType.js';
import { computeCodeQuality, type PRQualityInput } from './codeQuality.js';
import { computeSpecMetrics, aggregateSpecMetrics } from './specMetrics.js';
import { getCachedIssueChangelog } from '../../databaselayer/cache/jiraChangelogCache.js';
import type {
  AggregatedDeveloperMetric,
  DashboardQueryPayload,
  MetricsResult,
  PRSummary,
  RawPullRequest,
  RawActivity,
  RawDiffStat,
  RawJiraIssue,
  RepoTarget,
  SpecDrivenMetrics,
} from '../../types/index.js';

const JIRA_KEY_RE = /([A-Z]+-\d+)/g;

interface PRBundle {
  pr:          RawPullRequest;
  activities:  RawActivity[];
  diff:        RawDiffStat;
  commitCount: number;
}

export async function aggregateMetrics(
  payload: DashboardQueryPayload,
): Promise<MetricsResult> {
  const { metricsConcurrency } = getConfig();

  // Resolve repos once for Tier 1/2 (same list for all developers).
  // Returns null for Tier 3 — each developer resolves their own repos via profile API.
  const sharedRepos = await resolveSharedRepos(payload);

  // For Tier 2: narrow the shared repo list per developer using their Bitbucket profile.
  // profile/recent/repos is a single cheap call that tells us which repos a dev actually
  // touched — avoids scanning all 90 repos when a dev only worked in 5.
  // Pre-fetch all profiles in parallel before the main fan-out.
  const devRepos = await resolvePerDeveloperRepos(
    payload.developerIds,
    sharedRepos,
    payload.startDate,
    payload.endDate,
    payload.repoTargets,
    payload.projectKeys,
  );

  const current = await concurrentMap(
    payload.developerIds,
    metricsConcurrency,
    (devId) => aggregateForDeveloper(devId, payload.startDate, payload.endDate, devRepos[devId]),
  );

  if (payload.compareStartDate && payload.compareEndDate) {
    const prevRepos = await resolvePerDeveloperRepos(
      payload.developerIds,
      sharedRepos,
      payload.compareStartDate,
      payload.compareEndDate,
      payload.repoTargets,
      payload.projectKeys,
    );
    const previous = await concurrentMap(
      payload.developerIds,
      metricsConcurrency,
      (devId) => aggregateForDeveloper(devId, payload.compareStartDate!, payload.compareEndDate!, prevRepos[devId]),
    );
    return { current, previous };
  }

  return { current };
}

/**
 * For each developer, resolves the actual repos to scan:
 * - Tier 1 (explicit pairs): same list for everyone — no profile lookup needed.
 * - Tier 2 (project keys): intersect the full project repo list with the developer's
 *   profile/recent/repos — reduces 90 repos down to the handful the dev actually touched.
 *   Falls back to the full list only if the profile API returns nothing.
 * - Tier 3 (nothing configured): delegates to getReposWorkedByUser per developer.
 */
async function resolvePerDeveloperRepos(
  devIds: string[],
  sharedRepos: RepoTarget[] | null,
  startDate: string,
  endDate: string,
  uiRepoTargets?: RepoTarget[],
  uiProjectKeys?: string[],
): Promise<Record<string, RepoTarget[]>> {
  const { repoTargets: envTargets } = getConfig();

  // Tier 1: explicit repo list — identical for all devs, no profile lookup needed
  if ((uiRepoTargets && uiRepoTargets.length > 0) || envTargets.length > 0) {
    const repos = uiRepoTargets?.length ? uiRepoTargets : envTargets;
    return Object.fromEntries(devIds.map((id) => [id, repos]));
  }

  // Tier 2: project keys — filter the full shared repo list by actual authored activity
  // (commits or merged PRs) per developer. Profile API is unreliable here because it only
  // returns repos the user accessed via the UI, missing repos where they authored PRs without
  // browsing them recently (e.g. a user who authors PRs without viewing repos in the Bitbucket UI).
  if (sharedRepos && sharedRepos.length > 0) {
    const filtered = await Promise.all(
      devIds.map((id) => getCachedFilteredReposForUser(id, sharedRepos, startDate, endDate)),
    );
    return Object.fromEntries(devIds.map((id, i) => [id, filtered[i]]));
  }

  // Tier 3: fully per-developer — cached per-month to avoid O(repos × users) API storm
  const repoLists = await Promise.all(
    devIds.map((id) => getCachedReposForUser(id, startDate, endDate)),
  );
  return Object.fromEntries(devIds.map((id, i) => [id, repoLists[i]]));
}

/**
 * Resolves repos that are identical for all developers (Tier 1 / Tier 2).
 * Returns null when resolution is user-specific (Tier 3) — callers fall back to getReposWorkedByUser.
 */
async function resolveSharedRepos(payload: DashboardQueryPayload): Promise<RepoTarget[] | null> {
  const { repoTargets: envTargets, bitbucketProjectKeys: envProjectKeys } = getConfig();

  // Tier 1: explicit repo pairs from UI chips or env — identical for all devs
  if (payload.repoTargets && payload.repoTargets.length > 0) return payload.repoTargets;
  if (envTargets.length > 0) return envTargets;

  // Tier 2: project keys provided — enumerate repos once, share across devs
  const projectKeys = payload.projectKeys?.length ? payload.projectKeys : envProjectKeys;
  if (projectKeys.length > 0) {
    const repoLists = await Promise.all(projectKeys.map(getReposInProjectPublic));
    return projectKeys.flatMap((key, i) =>
      repoLists[i].map((slug): RepoTarget => ({ projectKey: key, repoSlug: slug })),
    );
  }

  // Tier 3: user-specific — must resolve per developer
  return null;
}

async function aggregateForDeveloper(
  devId: string,
  startDate: string,
  endDate: string,
  repos: RepoTarget[],
): Promise<AggregatedDeveloperMetric> {
  resetFallbackEngaged();
  const { repoConcurrency, stalePrThresholdDays } = getConfig();
  const thresholdHrs = stalePrThresholdDays * 8;
  const nowMs = Date.now();

  // ── 1–4. Jira assignee issues + Merged PRs + Open PRs + Reviewed PRs — all in parallel ──
  const [prResults, openPrResults, assigneeIssues, reviewedPrResults] = await Promise.all([
    // 1. Merged PRs authored by dev — closed months served from JSON cache; delta sync for current month
    concurrentMap(
      repos,
      repoConcurrency,
      ({ projectKey, repoSlug }) =>
        getCachedMergedPRsByAuthor(projectKey, repoSlug, devId, startDate)
          .catch((): RawPullRequest[] => []),
    ),
    // 2. Open PRs authored by dev
    concurrentMap(
      repos,
      repoConcurrency,
      ({ projectKey, repoSlug }) =>
        getCachedOpenPRsByAuthor(projectKey, repoSlug, devId)
          .catch((): RawPullRequest[] => []),
    ),
    // 3. Jira assignee issues (delta monthly cache)
    getCachedIssuesForDeveloper(devId, startDate, endDate),
    // 4. Merged PRs where dev was a reviewer (delta cache)
    concurrentMap(
      repos,
      repoConcurrency,
      ({ projectKey, repoSlug }) =>
        getCachedReviewedPRsByUser(projectKey, repoSlug, devId, startDate)
          .catch((): RawPullRequest[] => []),
    ),
  ]);

  // ── 2. Jira keys from PR titles — extract ticket refs for commit-linked issues ─
  const jiraKeySet = new Set<string>();
  for (const pr of prResults.flat()) {
    const matches = pr.title.match(JIRA_KEY_RE) ?? [];
    for (const k of matches) jiraKeySet.add(k);
  }

  // ── 3. Commit-linked Jira issues — fetch now that we have keys ────────────────
  const commitLinkedIssues = await getIssuesByKeys([...jiraKeySet]);

  const allIssues = mergeIssuesByKey(commitLinkedIssues, assigneeIssues);
  const authoredPRs: RawPullRequest[] = prResults
    .flat()
    .filter((pr) => {
      if (pr.author.user.name !== devId) return false;
      if (!pr.closedDate) return false;
      const prDate = new Date(pr.createdDate).toISOString().slice(0, 10);
      return prDate >= startDate && prDate <= endDate;
    });

  // ── 5. Activities + diffs + commit counts per PR — write-once cache keyed by PR ID ──
  const prBundles: PRBundle[] = await concurrentMap(
    authoredPRs,
    repoConcurrency,
    async (pr): Promise<PRBundle> => {
      const projectKey = pr.fromRef.repository.project.key;
      const repoSlug   = pr.fromRef.repository.slug;
      const { activities, diff, commitCount } = await getCachedPRDetails(projectKey, repoSlug, pr)
        .catch((): { activities: RawActivity[]; diff: RawDiffStat; commitCount: number } => ({
          activities:  [],
          diff:        { linesAdded: 0, linesRemoved: 0 },
          commitCount: 0,
        }));
      return { pr, activities, diff, commitCount };
    },
  );

  // ── 5b. Stale open PRs ───────────────────────────────────────────────────────
  const openPrs = openPrResults.flat().filter((pr) => pr.author.user.name === devId);
  const openPrsOverThreshold = openPrs.filter((pr) => {
    const ageHrs = computeCycleTimeHrs(pr.createdDate, nowMs);
    return ageHrs >= thresholdHrs;
  }).length;

  // ── 6. Aggregate numeric dimensions ─────────────────────────────────────────
  const totalLines = { added: 0, deleted: 0 };
  let totalCycleTime       = 0;
  let totalPickupDelay     = 0;
  let totalReviewLifecycle = 0;
  let totalReviewDepth     = 0;
  let totalPrSizeLines     = 0;

  for (const { pr, activities, diff } of prBundles) {
    totalLines.added   += diff.linesAdded;
    totalLines.deleted += diff.linesRemoved;
    totalPrSizeLines   += diff.linesAdded + diff.linesRemoved;

    totalCycleTime       += computeCycleTimeHrs(pr.createdDate, pr.closedDate ?? null);
    totalPickupDelay     += computePickupDelayHrs(pr.createdDate, firstReviewerMs(activities, devId));
    totalReviewLifecycle += computeReviewLifecycleHrs(firstCommentMs(activities, devId), pr.closedDate ?? null);
    totalReviewDepth     += computeReviewDepth(activities, devId);
  }

  const n = prBundles.length;
  const avg = (v: number): number => n > 0 ? Math.round((v / n) * 100) / 100 : 0;

  // ── 7. Work-type classification ──────────────────────────────────────────────
  const workType = { features: 0, bugs: 0, infraOrDebt: 0 };
  for (const issue of allIssues) {
    workType[classifyWorkType(issue.fields.issuetype.name, issue.fields.labels ?? [])]++;
  }

  // ── 8. Code quality score ─────────────────────────────────────────────────────
  const prQualityInputs: PRQualityInput[] = prBundles.map(({ pr, activities, diff }) => ({
    activities,
    linesChanged: diff.linesAdded + diff.linesRemoved,
    createdDate:  pr.createdDate,
    closedDate:   pr.closedDate ?? Date.now(),
  }));
  const codeQuality = computeCodeQuality(allIssues, prQualityInputs, devId);

  // ── 9. Spec-driven metrics (opt-in via SPEC_METRICS_ENABLED) ────────────────
  const { specMetricsEnabled } = getConfig();
  let specMetrics: SpecDrivenMetrics | undefined;
  if (specMetricsEnabled && allIssues.length > 0) {
    // Build a set of post-merge commit messages keyed by issue key so we can
    // associate churn commits with the issue they were fixing.
    // Approximation: any commit message referencing the issue key after PR merge.
    const commitMsgsByIssue = new Map<string, string[]>();
    for (const { pr } of prBundles) {
      const keys = pr.title.match(JIRA_KEY_RE) ?? [];
      for (const k of keys) {
        if (!commitMsgsByIssue.has(k)) commitMsgsByIssue.set(k, []);
      }
    }

    const issueMetrics = await concurrentMap(
      allIssues,
      repoConcurrency,
      async (issue): Promise<SpecDrivenMetrics | null> => {
        const withChangelog = await getCachedIssueChangelog(issue.key);
        if (!withChangelog) return null;
        const msgs = commitMsgsByIssue.get(issue.key) ?? [];
        return computeSpecMetrics(withChangelog, msgs);
      },
    );

    specMetrics = aggregateSpecMetrics(issueMetrics.filter((m): m is SpecDrivenMetrics => m !== null));
  }

  // ── 11. Resolve display name ──────────────────────────────────────────────────
  // Use the Bitbucket user profile as the authoritative source to avoid git commit
  // author names (which can be bots or mismatched) polluting the display name.
  const displayName =
    prBundles[0]?.pr.author.user.displayName ??
    await getUserDisplayName(devId);

  // ── 12. Build per-PR summaries for the detail drawer ────────────────────────
  const prs: PRSummary[] = prBundles.map(({ pr, activities, diff }) => ({
    id:             pr.id,
    title:          pr.title,
    projectKey:     pr.fromRef.repository.project.key,
    repoSlug:       pr.fromRef.repository.slug,
    state:          pr.state as PRSummary['state'],
    createdDate:    pr.createdDate,
    closedDate:     pr.closedDate,
    linesAdded:     diff.linesAdded,
    linesRemoved:   diff.linesRemoved,
    cycleTimeHrs:   computeCycleTimeHrs(pr.createdDate, pr.closedDate ?? null),
    pickupDelayHrs: computePickupDelayHrs(pr.createdDate, firstReviewerMs(activities, devId)),
    reviewDepth:    computeReviewDepth(activities, devId),
    url:            pr.links.self[0]?.href ?? '',
  }));

  const prsReviewed = new Set(reviewedPrResults.flat().map((pr) => pr.id)).size;

  return {
    developerId:         devId,
    name:                displayName,
    totalCommits:        prBundles.reduce((s, b) => s + b.commitCount, 0),
    totalPRs:            prBundles.length,
    prsReviewed,
    linesChanged:        totalLines,
    cycleTimeHrs:        avg(totalCycleTime),
    pickupDelayHrs:      avg(totalPickupDelay),
    reviewLifecycleHrs:  avg(totalReviewLifecycle),
    reviewDepth:         avg(totalReviewDepth),
    avgPrSizeLines:      avg(totalPrSizeLines),
    openPrsOverThreshold,
    workType,
    codeQuality,
    ...(specMetrics !== undefined && { specMetrics }),
    prs,
  };
}

function firstReviewerMs(activities: RawActivity[], authorSlug: string): number | null {
  const BOT_RE = new RegExp(getConfig().botUserPattern, 'i');
  const REVIEWER_ACTIONS = new Set<RawActivity['action']>(['COMMENTED', 'REVIEWED', 'APPROVED']);
  const hit = activities
    .filter((a) => REVIEWER_ACTIONS.has(a.action) && a.user.name !== authorSlug && !BOT_RE.test(a.user.name))
    .sort((a, b) => a.createdDate - b.createdDate)[0];
  return hit?.createdDate ?? null;
}

function firstCommentMs(activities: RawActivity[], authorSlug: string): number | null {
  const BOT_RE = new RegExp(getConfig().botUserPattern, 'i');
  const hit = activities
    .filter((a) => a.action === 'COMMENTED' && a.user.name !== authorSlug && !BOT_RE.test(a.user.name))
    .sort((a, b) => a.createdDate - b.createdDate)[0];
  return hit?.createdDate ?? null;
}
