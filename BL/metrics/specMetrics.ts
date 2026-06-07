import { computeCycleTimeHrs } from './cycleTime.js';
import { getConfig } from '../config/env.js';
import type { JiraIssueWithChangelog, JiraChangelogEntry, SpecDrivenMetrics } from '../../types/index.js';

// Spec-churn commit message keywords: pushes after PR merge that signal the
// implementation had to be revised to match the original specification.
const SPEC_CHURN_RE = /\b(fix spec|per feedback|scoping change|spec fix|clarif|revert spec|spec update|per review)\b/i;

interface TransitionWindow {
  fromStatus: string;
  toStatus: string;
  enteredAt: number; // epoch ms
  exitedAt: number;  // epoch ms — equals the next transition's timestamp
}

function statusTransitions(histories: JiraChangelogEntry[]): TransitionWindow[] {
  const sorted = [...histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  const windows: TransitionWindow[] = [];
  let prevStatus = '';
  let prevMs = 0;

  for (const h of sorted) {
    for (const item of h.items) {
      if (item.field !== 'status') continue;
      const enteredAt = new Date(h.created).getTime();
      if (prevStatus && prevMs) {
        windows.push({
          fromStatus: prevStatus,
          toStatus:   item.toString ?? '',
          enteredAt:  prevMs,
          exitedAt:   enteredAt,
        });
      }
      prevStatus = item.toString ?? '';
      prevMs     = enteredAt;
    }
  }

  return windows;
}

function firstTransitionToMs(histories: JiraChangelogEntry[], targetStatus: string): number | null {
  const needle = targetStatus.toLowerCase();
  const sorted = [...histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );
  for (const h of sorted) {
    for (const item of h.items) {
      if (item.field === 'status' && item.toString?.toLowerCase() === needle) {
        return new Date(h.created).getTime();
      }
    }
  }
  return null;
}

export function computeSpecMetrics(
  issue: JiraIssueWithChangelog,
  postMergeCommitMessages: string[],
): SpecDrivenMetrics {
  const cfg = getConfig();
  const approvedStatus      = cfg.specApprovedStatus.toLowerCase();
  const verificationStatus  = cfg.specVerificationStatus.toLowerCase();
  const doneStatus          = cfg.specDoneStatus.toLowerCase();
  const blockedStatus       = cfg.specBlockedStatus.toLowerCase();

  const histories = issue.changelog.histories;
  const createdMs = new Date(issue.fields.created).getTime();

  const specApprovedMs     = firstTransitionToMs(histories, approvedStatus);
  const verificationMs     = firstTransitionToMs(histories, verificationStatus);
  const doneMs             = issue.fields.resolutiondate
    ? new Date(issue.fields.resolutiondate).getTime()
    : firstTransitionToMs(histories, doneStatus);

  // Phase 1: ticket created → spec approved
  const specDefinitionTimeHrs = specApprovedMs
    ? computeCycleTimeHrs(createdMs, specApprovedMs)
    : 0;

  // Phase 2: spec approved (or creation if no approved transition) → PR merged
  // Implementation time is supplied by the caller (PR cycle time) when available;
  // here we approximate as spec approved → verification entry.
  const implStartMs = specApprovedMs ?? createdMs;
  const implementationTimeHrs = verificationMs
    ? computeCycleTimeHrs(implStartMs, verificationMs)
    : 0;

  // Phase 3: verification entry → done
  const verificationTimeHrs = verificationMs && doneMs
    ? computeCycleTimeHrs(verificationMs, doneMs)
    : 0;

  // Clarification delay: cumulative working hours in blocked status
  const windows = statusTransitions(histories);
  const clarificationDelayHrs = windows
    .filter((w) => w.fromStatus.toLowerCase() === blockedStatus)
    .reduce((sum, w) => sum + computeCycleTimeHrs(w.enteredAt, w.exitedAt), 0);

  // Spec regressions: verification → in-progress transitions
  const specRegressions = windows.filter(
    (w) =>
      w.fromStatus.toLowerCase() === verificationStatus &&
      !['done', doneStatus, verificationStatus].includes(w.toStatus.toLowerCase()),
  ).length;

  // Post-merge rework: commit messages after verification started that match churn keywords
  const postMergeReworkCommits = postMergeCommitMessages.filter((msg) =>
    SPEC_CHURN_RE.test(msg),
  ).length;

  const firstPassYield = specRegressions === 0 && postMergeReworkCommits === 0;

  // Spec adherence score: start at 100, exponential penalty per regression,
  // linear penalty per post-merge rework commit, clamp to [0, 100].
  const regressionPenalty = Math.round(100 * (1 - Math.pow(2, -specRegressions)));
  const churnPenalty      = Math.min(postMergeReworkCommits * 5, 40);
  const specAdherenceScore = Math.max(0, 100 - regressionPenalty - churnPenalty);

  return {
    specDefinitionTimeHrs:  Math.round(specDefinitionTimeHrs  * 100) / 100,
    implementationTimeHrs:  Math.round(implementationTimeHrs  * 100) / 100,
    verificationTimeHrs:    Math.round(verificationTimeHrs    * 100) / 100,
    clarificationDelayHrs:  Math.round(clarificationDelayHrs  * 100) / 100,
    specRegressions,
    postMergeReworkCommits,
    firstPassYield,
    specAdherenceScore,
  };
}

// Aggregates per-issue SpecDrivenMetrics into a single developer-level summary.
export function aggregateSpecMetrics(perIssue: SpecDrivenMetrics[]): SpecDrivenMetrics {
  if (perIssue.length === 0) {
    return {
      specDefinitionTimeHrs: 0,
      implementationTimeHrs: 0,
      verificationTimeHrs:   0,
      clarificationDelayHrs: 0,
      specRegressions:       0,
      postMergeReworkCommits: 0,
      firstPassYield:        true,
      specAdherenceScore:    100,
    };
  }

  const avg = (vals: number[]) =>
    Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;

  const totalRegressions      = perIssue.reduce((s, m) => s + m.specRegressions, 0);
  const totalPostMergeCommits = perIssue.reduce((s, m) => s + m.postMergeReworkCommits, 0);

  return {
    specDefinitionTimeHrs:  avg(perIssue.map((m) => m.specDefinitionTimeHrs)),
    implementationTimeHrs:  avg(perIssue.map((m) => m.implementationTimeHrs)),
    verificationTimeHrs:    avg(perIssue.map((m) => m.verificationTimeHrs)),
    clarificationDelayHrs:  avg(perIssue.map((m) => m.clarificationDelayHrs)),
    specRegressions:        totalRegressions,
    postMergeReworkCommits: totalPostMergeCommits,
    firstPassYield:         totalRegressions === 0 && totalPostMergeCommits === 0,
    specAdherenceScore:     Math.round(avg(perIssue.map((m) => m.specAdherenceScore))),
  };
}
