import type { AggregatedDeveloperMetric } from '../../types/index.js';

interface EvalResult {
  passed: boolean;
  warnings: string[];
}

// Sanity-check thresholds — flag anomalies that likely indicate data quality issues.
const MAX_REASONABLE_CYCLE_HRS    = 2000;  // ~83 calendar days of working hours
const MAX_REASONABLE_COMMITS      = 10_000;
const MAX_REASONABLE_LINES        = 500_000;
const MAX_REASONABLE_REVIEW_DEPTH = 200;

// Runs output-quality assertions on the aggregated metrics.
// Does NOT throw — returns warnings for the caller to log or surface.
export function validateMetrics(results: AggregatedDeveloperMetric[]): EvalResult {
  const warnings: string[] = [];

  for (const r of results) {
    const id = r.developerId;

    if (!Number.isFinite(r.cycleTimeHrs) || r.cycleTimeHrs < 0) {
      warnings.push(`${id}: cycleTimeHrs is invalid (${r.cycleTimeHrs})`);
    }
    if (r.cycleTimeHrs > MAX_REASONABLE_CYCLE_HRS) {
      warnings.push(`${id}: cycleTimeHrs unusually high (${r.cycleTimeHrs} hrs) — possible data quality issue`);
    }
    if (r.pickupDelayHrs > r.cycleTimeHrs && r.cycleTimeHrs > 0) {
      warnings.push(`${id}: pickupDelayHrs (${r.pickupDelayHrs}) > cycleTimeHrs (${r.cycleTimeHrs}) — check PR timestamps`);
    }
    if (r.totalCommits > MAX_REASONABLE_COMMITS) {
      warnings.push(`${id}: totalCommits unusually high (${r.totalCommits})`);
    }
    if (r.linesChanged.added + r.linesChanged.deleted > MAX_REASONABLE_LINES) {
      warnings.push(`${id}: linesChanged unusually high (${r.linesChanged.added + r.linesChanged.deleted})`);
    }
    if (r.reviewDepth > MAX_REASONABLE_REVIEW_DEPTH) {
      warnings.push(`${id}: reviewDepth unusually high (${r.reviewDepth})`);
    }
    const wtTotal = r.workType.features + r.workType.bugs + r.workType.infraOrDebt;
    if (wtTotal < 0) {
      warnings.push(`${id}: negative workType totals — data corruption`);
    }
    if (!Number.isFinite(r.codeQuality.score) || r.codeQuality.score < 0 || r.codeQuality.score > 100) {
      warnings.push(`${id}: codeQuality.score out of range (${r.codeQuality.score})`);
    }
    if (r.codeQuality.bugRatio < 0 || r.codeQuality.bugRatio > 1) {
      warnings.push(`${id}: codeQuality.bugRatio out of range (${r.codeQuality.bugRatio})`);
    }
  }

  if (warnings.length > 0) {
    console.warn('[evals] Metric validation warnings:', warnings);
  }

  return { passed: warnings.length === 0, warnings };
}
