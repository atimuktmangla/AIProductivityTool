import { getConfig } from "../../backend/config/env.js";
import { atlassianGet } from "../client/atlassianFetch.js";
import { makeTtlCache, makeKeyedTtlCache } from "../cache/ttlCache.js";
import type {
  BitbucketUser,
  BitbucketPagedResponse,
  RawCommit,
  RawPullRequest,
  RawActivity,
  RawDiffStat,
  RepoTarget,
} from "../../types/index.js";

export async function pingBitbucket(): Promise<void> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  await atlassianGet(
    bitbucketBaseUrl,
    bitbucketToken,
    "/rest/api/1.0/application-properties",
  );
}

const PAGE_SIZE = 100;
const FIVE_MIN = 5 * 60 * 1000;
const TWO_MIN = 2 * 60 * 1000;

const usersCache = makeTtlCache<BitbucketUser[]>(FIVE_MIN);
const projectKeysCache = makeTtlCache<string[]>(FIVE_MIN);
const repoSlugCache = makeKeyedTtlCache<string[]>(FIVE_MIN);
const activityCache = makeKeyedTtlCache<boolean>(TWO_MIN);

// ─── Admin API ───────────────────────────────────────────────────────────────

export async function getUserDisplayName(slug: string): Promise<string> {
  const users = await getAllUsers();
  return users.find((u) => u.name === slug)?.displayName ?? slug;
}

export async function getAllUsers(): Promise<BitbucketUser[]> {
  return usersCache(async () => {
    const { bitbucketBaseUrl, bitbucketToken } = getConfig();
    const users: BitbucketUser[] = [];
    let start = 0;

    do {
      const page = await atlassianGet<BitbucketPagedResponse<BitbucketUser>>(
        bitbucketBaseUrl,
        bitbucketToken,
        "/rest/api/1.0/admin/users",
        { limit: 1000, start },
      );
      users.push(...page.values);
      if (page.isLastPage) break;
      start = page.nextPageStart ?? start + page.values.length;
    } while (true);

    return users;
  });
}

// ─── Project / Repo discovery ─────────────────────────────────────────────────

interface RawProject {
  key: string;
  name: string;
}
interface RawRepo {
  slug: string;
  name: string;
  project: { key: string };
}

/**
 * Always fetches ALL project keys from the Bitbucket API.
 * Used by the UI /projects endpoint so the picker shows every available project
 * regardless of what BITBUCKET_PROJECT_KEYS is set to in env.
 */
export async function getAllProjectKeys(): Promise<string[]> {
  return projectKeysCache(async () => {
    const { bitbucketBaseUrl, bitbucketToken } = getConfig();
    const keys: string[] = [];
    let start = 0;

    do {
      const page = await atlassianGet<BitbucketPagedResponse<RawProject>>(
        bitbucketBaseUrl,
        bitbucketToken,
        "/rest/api/1.0/projects",
        { limit: PAGE_SIZE, start },
      );
      for (const p of page.values) keys.push(p.key);
      if (page.isLastPage) break;
      start = page.nextPageStart ?? start + page.values.length;
    } while (true);

    return keys;
  });
}

/**
 * Returns project keys for the resolution logic only.
 * Respects BITBUCKET_PROJECT_KEYS env var — if set, returns those without an API call.
 * Falls back to getAllProjectKeys() when env is empty (Tier 3 full scan).
 */
export async function getProjectKeys(): Promise<string[]> {
  const { bitbucketProjectKeys } = getConfig();
  if (bitbucketProjectKeys.length > 0) return bitbucketProjectKeys;
  return getAllProjectKeys();
}

/** Public wrapper used by the /repos API route. */
export async function getReposInProjectPublic(
  projectKey: string,
): Promise<string[]> {
  return getReposInProject(projectKey);
}

async function getReposInProject(projectKey: string): Promise<string[]> {
  return repoSlugCache(projectKey, async () => {
    const { bitbucketBaseUrl, bitbucketToken } = getConfig();
    const slugs: string[] = [];
    let start = 0;

    do {
      const page = await atlassianGet<BitbucketPagedResponse<RawRepo>>(
        bitbucketBaseUrl,
        bitbucketToken,
        `/rest/api/1.0/projects/${projectKey}/repos`,
        { limit: PAGE_SIZE, start },
      );
      for (const r of page.values) slugs.push(r.slug);
      if (page.isLastPage) break;
      start = page.nextPageStart ?? start + page.values.length;
    } while (true);

    return slugs;
  });
}

/**
 * Tier 3: fetch repos the user has recently accessed via their Bitbucket profile.
 * Calls GET /rest/api/1.0/profile/recent/repos?username={slug}
 * Exported so the aggregator can use it to narrow a Tier-2 candidate list per developer.
 */
export async function getReposByUserProfile(
  userSlug: string,
): Promise<RepoTarget[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  try {
    const page = await atlassianGet<BitbucketPagedResponse<RawRepo>>(
      bitbucketBaseUrl,
      bitbucketToken,
      "/rest/api/1.0/profile/recent/repos",
      { username: userSlug, limit: 50 },
    );
    return page.values.map((r) => ({
      projectKey: r.project.key,
      repoSlug: r.slug,
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves the repos to scan for a given developer using a strict 3-tier priority:
 *
 * TIER 1 — Explicit PROJECT/repo pairs (env or UI chips):
 *   ENV:  BITBUCKET_PROJECTS=SS/react-Test,SS/core
 *   UI:   uiRepoTargets provided  →  use them directly, no API calls
 *
 * TIER 2 — Project keys only (env or UI pills, no specific repos):
 *   ENV:  BITBUCKET_PROJECT_KEYS=SS,DOSC,PRZ3
 *   UI:   uiProjectKeys provided  →  list all repos, filter by user activity
 *
 * TIER 3 — Nothing provided:
 *   Call /profile/recent/repos for the user  →  repos they recently accessed
 *   If that returns nothing, fall back to full project scan.
 */
export async function getReposWorkedByUser(
  authorSlug: string,
  startDate: string,
  endDate: string,
  uiRepoTargets?: RepoTarget[],
  uiProjectKeys?: string[],
): Promise<RepoTarget[]> {
  const { repoTargets: envTargets, bitbucketProjectKeys: envProjectKeys } =
    getConfig();

  // ── TIER 1 ───────────────────────────────────────────────────────────────────
  if (uiRepoTargets && uiRepoTargets.length > 0) return uiRepoTargets;
  if (envTargets.length > 0) return envTargets;

  // ── TIER 2 ───────────────────────────────────────────────────────────────────
  const projectKeys =
    uiProjectKeys && uiProjectKeys.length > 0 ? uiProjectKeys : envProjectKeys;

  if (projectKeys.length > 0) {
    // Fast path: profile/recent/repos returns the user's repos in 1 call.
    // Intersect with the requested project keys — no full repo enumeration needed.
    const projectKeySet = new Set(projectKeys);
    const profileRepos = await getReposByUserProfile(authorSlug);
    const matching = profileRepos.filter((r) =>
      projectKeySet.has(r.projectKey),
    );
    if (matching.length > 0) return matching;

    // Fallback for new users / accounts with no profile history.
    const repoLists = await Promise.all(projectKeys.map(getReposInProject));
    const candidates: RepoTarget[] = projectKeys.flatMap((key, i) =>
      repoLists[i].map((slug) => ({ projectKey: key, repoSlug: slug })),
    );
    return filterByUserActivity(candidates, authorSlug, startDate, endDate);
  }

  // ── TIER 3 ───────────────────────────────────────────────────────────────────
  // Use profile repos to derive which projects the user is active in, then enumerate
  // all repos in those projects and filter by actual authored activity. Returning profile
  // repos directly is wrong — the profile API reflects UI access (reviewer visits), not
  // code authorship, and misses repos where the user authored PRs without browsing them.
  const profileRepos = await getReposByUserProfile(authorSlug);
  const tier3Keys =
    profileRepos.length > 0
      ? [...new Set(profileRepos.map((r) => r.projectKey))]
      : await getProjectKeys();

  const repoLists = await Promise.all(tier3Keys.map(getReposInProject));
  const candidates: RepoTarget[] = tier3Keys.flatMap((key, i) =>
    repoLists[i].map((slug) => ({ projectKey: key, repoSlug: slug })),
  );
  return filterByUserActivity(candidates, authorSlug, startDate, endDate);
}

/** Keeps only repos where the user has a merged PR in the date range.
 *  Commit scanning is intentionally omitted — all metrics are PR-based,
 *  so a repo with no authored PRs has nothing to aggregate. The PR check
 *  uses author=slug so Bitbucket pre-filters server-side: 1 API call per
 *  repo, typically resolved in a single page (~300ms).
 */
export async function filterByUserActivity(
  candidates: RepoTarget[],
  authorSlug: string,
  startDate: string,
  endDate: string,
): Promise<RepoTarget[]> {
  const sinceMs = new Date(startDate).getTime();
  const untilMs = new Date(endDate + "T23:59:59Z").getTime();

  const checks = await Promise.all(
    candidates.map(
      async ({ projectKey, repoSlug }): Promise<RepoTarget | null> => {
        const hasPR = await userHasMergedPR(
          projectKey,
          repoSlug,
          authorSlug,
          sinceMs,
          untilMs,
        );
        return hasPR ? { projectKey, repoSlug } : null;
      },
    ),
  );

  return checks.filter((t): t is RepoTarget => t !== null);
}

/** Returns true if the user has at least one commit in the repo within the ms range. */
/** Returns true if the user has at least one merged PR in the repo within the ms range. */
async function userHasMergedPR(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
  sinceMs: number,
  untilMs: number,
): Promise<boolean> {
  const cacheKey = `pr:${authorSlug}:${projectKey}:${repoSlug}:${sinceMs}:${untilMs}`;
  return activityCache(cacheKey, async () => {
    const { bitbucketBaseUrl, bitbucketToken } = getConfig();
    let start = 0;
    try {
      do {
        const page = await atlassianGet<BitbucketPagedResponse<RawPullRequest>>(
          bitbucketBaseUrl,
          bitbucketToken,
          `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`,
          { state: "MERGED", author: authorSlug, limit: PAGE_SIZE, start },
        );
        for (const pr of page.values) {
          if (pr.author.user.name !== authorSlug) continue;
          if (!pr.closedDate) continue;
          if (pr.closedDate < sinceMs) continue;
          if (pr.closedDate <= untilMs) return true;
        }
        const lastUpdated = page.values.at(-1)?.updatedDate ?? 0;
        if (page.isLastPage || lastUpdated < sinceMs) break;
        start = page.nextPageStart ?? start + page.values.length;
      } while (true);
    } catch {
      return false;
    }
    return false;
  });
}

// ─── Commits ─────────────────────────────────────────────────────────────────

// NOTE: Bitbucket Server /commits does not accept date strings for since/until —
// those params expect commit SHAs. Date filtering is done in-memory on authorTimestamp.
export async function getCommitsByAuthor(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
  startDate: string,
  endDate: string,
): Promise<RawCommit[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/commits`;

  const sinceMs = new Date(startDate).getTime();
  const untilMs = new Date(endDate + "T23:59:59Z").getTime();

  const commits: RawCommit[] = [];
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawCommit>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      // Do NOT pass `author` param — Bitbucket Server matches it against the git
      // commit author name/email string, not the user slug. Passing the slug causes
      // Bitbucket to return ALL commits (no match = no filter), but the stop-early
      // logic then terminates on the first page where the target author has no commits,
      // silently returning zero. Filter in-memory instead.
      { limit: PAGE_SIZE, start },
    );

    let stopEarly = false;
    for (const commit of page.values) {
      if (
        commit.author.name !== authorSlug &&
        (commit.author as any).slug !== authorSlug
      )
        continue;
      if (commit.authorTimestamp < sinceMs) {
        stopEarly = true;
        break;
      }
      if (commit.authorTimestamp <= untilMs) {
        commits.push(commit);
      }
    }

    // Stop paging once the oldest commit on this page predates the window.
    // Commits are newest-first, so nothing on subsequent pages can be in range.
    const oldestOnPage = page.values.at(-1)?.authorTimestamp ?? sinceMs;
    if (stopEarly || page.isLastPage || oldestOnPage < sinceMs) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return commits;
}

// ─── Pull Requests ───────────────────────────────────────────────────────────

export async function getOpenPullRequestsByAuthor(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
): Promise<RawPullRequest[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`;

  const prs: RawPullRequest[] = [];
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawPullRequest>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      { state: "OPEN", author: authorSlug, limit: PAGE_SIZE, start },
    );

    prs.push(...page.values);
    if (page.isLastPage) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return prs;
}

export async function getMergedPullRequestsByAuthor(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
  startDate?: string, // ISO date string — stop paging once PRs are older than this
): Promise<RawPullRequest[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`;
  const sinceMs = startDate ? new Date(startDate).getTime() : 0;

  const prs: RawPullRequest[] = [];
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawPullRequest>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      { state: "MERGED", author: authorSlug, limit: PAGE_SIZE, start },
    );

    let foundOnPage = 0;
    for (const pr of page.values) {
      if (pr.author.user.name !== authorSlug) continue;
      if (sinceMs > 0 && pr.createdDate < sinceMs) continue;
      prs.push(pr);
      foundOnPage++;
    }

    // PRs are sorted newest-first by updatedDate.
    const lastUpdated = page.values.at(-1)?.updatedDate ?? 0;
    if (page.isLastPage || (sinceMs > 0 && lastUpdated < sinceMs)) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return prs;
}

/**
 * Returns merged PRs where the user participated as a reviewer or merger (role=PARTICIPANT).
 * PARTICIPANT covers: explicitly-added reviewers, commenters, approvers, and the person who clicked Merge.
 * Uses the Bitbucket Server role filter so no activity fetching is required.
 */
export async function getMergedPRsParticipatedByUser(
  projectKey: string,
  repoSlug: string,
  reviewerSlug: string,
  startDate: string,
): Promise<RawPullRequest[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`;
  const sinceMs = new Date(startDate).getTime();

  const prs: RawPullRequest[] = [];
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawPullRequest>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      {
        state: "MERGED",
        role: "PARTICIPANT",
        username: reviewerSlug,
        limit: PAGE_SIZE,
        start,
      },
    );

    for (const pr of page.values) {
      if (pr.author.user.name === reviewerSlug) continue; // exclude own PRs
      if ((pr.closedDate ?? 0) < sinceMs) continue;
      prs.push(pr);
    }

    const lastUpdated = page.values.at(-1)?.updatedDate ?? 0;
    if (page.isLastPage || lastUpdated < sinceMs) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return prs;
}

export async function getPRActivities(
  projectKey: string,
  repoSlug: string,
  prId: number,
): Promise<RawActivity[]> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests/${prId}/activities`;

  const activities: RawActivity[] = [];
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawActivity>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      { limit: PAGE_SIZE, start },
    );

    activities.push(...page.values);
    if (page.isLastPage) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return activities;
}

export async function getPRCommitCount(
  projectKey: string,
  repoSlug: string,
  prId: number,
): Promise<number> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();
  const base = `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests/${prId}/commits`;

  let count = 0;
  let start = 0;

  do {
    const page = await atlassianGet<BitbucketPagedResponse<RawCommit>>(
      bitbucketBaseUrl,
      bitbucketToken,
      base,
      { limit: PAGE_SIZE, start },
    );
    count += page.values.length;
    if (page.isLastPage) break;
    start = page.nextPageStart ?? start + page.values.length;
  } while (true);

  return count;
}

// Files whose line counts should not penalise PR size: lock files, compiled
// outputs, minified assets, and auto-generated sources.
const GENERATED_FILE_RE =
  /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|[^/]+\.lock)$|[/.]min\.[jt]sx?$|[/.]min\.css$|\/(?:dist|build|out|target|\.next|\.nuxt|vendor)\//i;

export async function getPRDiffStat(
  projectKey: string,
  repoSlug: string,
  prId: number,
): Promise<RawDiffStat> {
  const { bitbucketBaseUrl, bitbucketToken } = getConfig();

  interface FilePath {
    toString: string;
  }
  interface DiffResponse {
    diffs: Array<{
      source?: FilePath | null;
      destination?: FilePath | null;
      hunks: Array<{ segments: Array<{ type: string; lines: unknown[] }> }>;
    }>;
  }

  const data = await atlassianGet<DiffResponse>(
    bitbucketBaseUrl,
    bitbucketToken,
    `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests/${prId}/diff`,
    { withComments: false },
  );

  let linesAdded = 0;
  let linesRemoved = 0;

  for (const diff of data.diffs ?? []) {
    const filePath = (diff.destination ?? diff.source)?.toString ?? "";
    if (GENERATED_FILE_RE.test(filePath)) continue;

    for (const hunk of diff.hunks ?? []) {
      for (const segment of hunk.segments ?? []) {
        if (segment.type === "ADDED") linesAdded += segment.lines.length;
        if (segment.type === "REMOVED") linesRemoved += segment.lines.length;
      }
    }
  }

  return { linesAdded, linesRemoved };
}
