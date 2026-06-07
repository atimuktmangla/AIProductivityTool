import type { CodeQualityScore, RawActivity, RawJiraIssue } from '../../types/index.js';
import { getConfig } from '../config/env.js';

export interface PRQualityInput {
  activities:   RawActivity[];
  linesChanged: number; // linesAdded + linesRemoved (excluding lockfiles — caller filters)
  createdDate:  number; // epoch ms
  closedDate:   number; // epoch ms (only merged PRs are scored)
}

// Jira label / issuetype patterns that warrant the 2.5× security/risk multiplier
const CRITICAL_LABEL_RE  = /blackduck|security|vulnerability|cve|cwe|rca|root.?cause|customer.?reported|production.?crash|critical.?defect|legacy.?debt/i;
const CRITICAL_TYPE_RE   = /security|vulnerability|incident|hotfix/i;

const RUBBER_STAMP_MS    = 5 * 60 * 1000;  // 5 minutes
const SLA_WINDOW_MS      = 24 * 60 * 60 * 1000; // 24 hours

// ── Signal 1: Critical / Security defect resolution (25%) ────────────────────
// Jira issues linked to the developer that are classified as high-risk are
// multiplied by 2.5× before normalisation. A developer who closed N ordinary
// issues and M critical ones scores as if they closed N + 2.5×M.
// Returns null when there are no Jira issues — signal is excluded from composite.
function computeCriticalResolutionScore(issues: RawJiraIssue[]): number | null {
  if (issues.length === 0) return null;

  let effectiveCount = 0;
  let criticalCount  = 0;
  for (const issue of issues) {
    const isCritical =
      CRITICAL_LABEL_RE.test((issue.fields.labels ?? []).join(' ')) ||
      CRITICAL_TYPE_RE.test(issue.fields.issuetype.name);

    const resolved = issue.fields.resolutiondate !== null;
    if (resolved) {
      effectiveCount += isCritical ? 2.5 : 1;
      if (isCritical) criticalCount++;
    }
  }

  // Effective resolution rate: treat each resolved critical as 2.5 regular fixes.
  // Denominator is ordinary count + 2.5 × critical count so a dev with only
  // critical work still achieves 100 when they resolve everything.
  const denominator = (issues.length - criticalCount) + criticalCount * 2.5;
  return Math.min(Math.round((effectiveCount / denominator) * 100), 100);
}

// ── Signal 2: Approval rate (25%) — gated by SLA + anti-rubber-stamp ─────────
// Full credit: PR approved by a human within 24 h AND the approver left ≥1 comment.
// 50% credit: approved within 24 h but approved in < 5 min with zero comments
//             (rubber-stamp pattern).
// Zero credit: not approved at all, or approved outside the 24 h SLA window.
// Returns null when there are no merged PRs — signal is excluded from composite.
function computeApprovalScore(prs: PRQualityInput[], authorSlug: string): number | null {
  const BOT_PATTERN = new RegExp(getConfig().botUserPattern, 'i');
  if (prs.length === 0) return null;

  let totalCredit = 0;

  for (const pr of prs) {
    const humanApproval = pr.activities.find(
      (a) =>
        a.action === 'APPROVED' &&
        a.user.name !== authorSlug &&
        !BOT_PATTERN.test(a.user.name),
    );
    if (!humanApproval) continue;

    const approvalElapsed = humanApproval.createdDate - pr.createdDate;
    if (approvalElapsed > SLA_WINDOW_MS) continue; // outside 24-h window

    const approverCommented = pr.activities.some(
      (a) =>
        a.action === 'COMMENTED' &&
        a.user.name === humanApproval.user.name &&
        !BOT_PATTERN.test(a.user.name),
    );
    const isRubberStamp = approvalElapsed < RUBBER_STAMP_MS && !approverCommented;

    totalCredit += isRubberStamp ? 0.5 : 1;
  }

  return Math.min(Math.round((totalCredit / prs.length) * 100), 100);
}

// ── Signal 3: PR focus — sigmoid decay S-curve (25%) ─────────────────────────
// Score = 100 / (1 + e^((lines - 500) / 100))
// ≤200 lines ≈ 100, 500 lines ≈ 50, ≥800 lines ≈ 0.
// Returns null when there are no merged PRs — signal is excluded from composite.
function sigmoidScore(lines: number): number {
  return Math.round(100 / (1 + Math.exp((lines - 500) / 100)));
}

function computePRFocusScore(prs: PRQualityInput[]): number | null {
  if (prs.length === 0) return null;
  const avgLines = prs.reduce((s, p) => s + p.linesChanged, 0) / prs.length;
  return sigmoidScore(avgLines);
}

// ── Signal 4: Low rework & stability — exponential ping-pong penalty (25%) ───
// Uses RESCOPED events as the proxy for backward status bounces
// (Jira ticket state transitions are not available; RESCOPED means commits were
// added/removed after review started, indicating scope was not settled upfront).
// Score = round(100 × 2^(-reworkRate)) — exponential decay, never zero.
// When no merged PRs exist, defaults to 100 (no evidence of rework).
function computeReworkScore(prs: PRQualityInput[]): { score: number; reworkRate: number } {
  if (prs.length === 0) return { score: 100, reworkRate: 0 };
  const totalRescoped = prs.reduce(
    (s, pr) => s + pr.activities.filter((a) => a.action === 'RESCOPED').length,
    0,
  );
  const reworkRate = totalRescoped / prs.length;
  const score = Math.round(100 * Math.pow(2, -reworkRate));
  return { score, reworkRate: Math.round(reworkRate * 100) / 100 };
}

// ── Composite ─────────────────────────────────────────────────────────────────
// Signals that return null (no data for the period) are excluded from the
// weighted average. The remaining signals are renormalized to sum to 1.0 so
// the composite always reflects only the dimensions that can actually be measured.
// Example: developer with no merged PRs — approvalScore and prFocusScore are null,
// so the composite is computed from criticalScore (25%) and reworkScore (25%),
// renormalized to 50%+50% = criticalScore×0.5 + reworkScore×0.5.
export function computeCodeQuality(
  issues: RawJiraIssue[],
  prs: PRQualityInput[],
  prAuthorSlug: string,
): CodeQualityScore {
  const bugCount      = issues.filter((i) => /bug|defect|hotfix|incident/i.test(i.fields.issuetype.name)).length;
  const bugRatio      = issues.length > 0 ? bugCount / issues.length : 0;

  const criticalScore  = computeCriticalResolutionScore(issues);
  const approvalScore  = computeApprovalScore(prs, prAuthorSlug);
  const prFocusScore   = computePRFocusScore(prs);
  const { score: reworkScore, reworkRate } = computeReworkScore(prs);

  // reworkScore always has data (defaults to 100 when no PRs), so always included.
  const signals: { value: number; weight: number }[] = [
    { value: reworkScore, weight: 0.25 },
  ];
  if (criticalScore !== null) signals.push({ value: criticalScore, weight: 0.25 });
  if (approvalScore !== null) signals.push({ value: approvalScore, weight: 0.25 });
  if (prFocusScore  !== null) signals.push({ value: prFocusScore,  weight: 0.25 });

  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const score = Math.round(
    signals.reduce((s, sig) => s + sig.value * (sig.weight / totalWeight), 0),
  );

  return {
    score,
    bugRatio:      Math.round(bugRatio * 1000) / 1000,
    criticalScore,
    approvalScore,
    prFocusScore,
    reworkRate,
  };
}
