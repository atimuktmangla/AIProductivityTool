import type { AggregatedDeveloperMetric, PRSummary } from '../../types/index.js';

function dedupePrs(prs: PRSummary[]): PRSummary[] {
  const map = new Map<number, PRSummary>();
  for (const pr of prs) map.set(pr.id, pr);
  return [...map.values()];
}

/**
 * Merges a gap slice (newer window segment) into a cached rolling metric.
 */
export function mergeDeveloperMetrics(
  base: AggregatedDeveloperMetric,
  gap: AggregatedDeveloperMetric,
): AggregatedDeveloperMetric {
  const prs = dedupePrs([...base.prs, ...gap.prs]);
  const n = prs.length;

  const avg = (field: keyof Pick<PRSummary, 'cycleTimeHrs' | 'pickupDelayHrs' | 'reviewDepth'>): number => {
    if (n === 0) return 0;
    const sum = prs.reduce((s, p) => s + p[field], 0);
    return Math.round((sum / n) * 100) / 100;
  };

  const totalLines = {
    added:   base.linesChanged.added + gap.linesChanged.added,
    deleted: base.linesChanged.deleted + gap.linesChanged.deleted,
  };

  const workType = {
    features:    base.workType.features + gap.workType.features,
    bugs:        base.workType.bugs + gap.workType.bugs,
    infraOrDebt: base.workType.infraOrDebt + gap.workType.infraOrDebt,
  };

  let specMetrics = base.specMetrics;
  if (base.specMetrics && gap.specMetrics) {
    specMetrics = {
      specDefinitionTimeHrs:  (base.specMetrics.specDefinitionTimeHrs + gap.specMetrics.specDefinitionTimeHrs) / 2,
      implementationTimeHrs:  (base.specMetrics.implementationTimeHrs + gap.specMetrics.implementationTimeHrs) / 2,
      verificationTimeHrs:    (base.specMetrics.verificationTimeHrs + gap.specMetrics.verificationTimeHrs) / 2,
      clarificationDelayHrs:  (base.specMetrics.clarificationDelayHrs + gap.specMetrics.clarificationDelayHrs) / 2,
      specRegressions:        base.specMetrics.specRegressions + gap.specMetrics.specRegressions,
      postMergeReworkCommits: base.specMetrics.postMergeReworkCommits + gap.specMetrics.postMergeReworkCommits,
      firstPassYield:         base.specMetrics.firstPassYield && gap.specMetrics.firstPassYield,
      specAdherenceScore:     Math.round((base.specMetrics.specAdherenceScore + gap.specMetrics.specAdherenceScore) / 2),
    };
  } else if (gap.specMetrics) {
    specMetrics = gap.specMetrics;
  }

  return {
    developerId: base.developerId,
    name: gap.name || base.name,
    totalCommits: base.totalCommits + gap.totalCommits,
    totalPRs: prs.length,
    prsReviewed: base.prsReviewed + gap.prsReviewed,
    linesChanged: totalLines,
    cycleTimeHrs: avg('cycleTimeHrs'),
    pickupDelayHrs: avg('pickupDelayHrs'),
    reviewLifecycleHrs: gap.reviewLifecycleHrs,
    reviewDepth: avg('reviewDepth'),
    avgPrSizeLines: n > 0
      ? Math.round(prs.reduce((s, p) => s + p.linesAdded + p.linesRemoved, 0) / n)
      : 0,
    openPrsOverThreshold: Math.max(base.openPrsOverThreshold, gap.openPrsOverThreshold),
    workType,
    codeQuality: gap.codeQuality.score >= base.codeQuality.score ? gap.codeQuality : base.codeQuality,
    ...(specMetrics !== undefined && { specMetrics }),
    prs,
  };
}
