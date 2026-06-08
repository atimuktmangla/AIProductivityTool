import type { AggregatedDeveloperMetric } from '../../types/index.js';
import { getConfig } from '../../backend/config/env.js';
import { callLlm } from '../providers/llmProvider.js';

export interface TeamInsights {
  topContributor:    string;
  bottleneck:        'pickup' | 'review' | 'none';
  bottleneckDetail:  string;
  workTypeImbalance: boolean;
  workTypeDetail:    string;
  teamHealthScore:   number;   // 0–100
  summary:           string;
  aiGenerated:       boolean;  // true when summary was written by LLM
  aiProvider?:       string;   // which provider produced it
}

export async function generateInsightsSummary(
  data: AggregatedDeveloperMetric[],
): Promise<TeamInsights> {
  if (data.length === 0) {
    return {
      topContributor:    '—',
      bottleneck:        'none',
      bottleneckDetail:  'No data.',
      workTypeImbalance: false,
      workTypeDetail:    'No data.',
      teamHealthScore:   0,
      summary:           'No metrics available for the selected window.',
      aiGenerated:       false,
    };
  }

  const base = computeBaseInsights(data);
  const { aiInsightsEnabled, aiProvider, aiApiKey } = getConfig();

  if (aiInsightsEnabled && aiApiKey) {
    try {
      const aiSummary = await callLlm(aiProvider, aiApiKey, buildPrompt(data, base));
      return { ...base, summary: aiSummary, aiGenerated: true, aiProvider };
    } catch (err) {
      // Fall back to rule-based summary silently — don't fail the whole report
      console.warn(`[insights] ${aiProvider} call failed — using rule-based summary:`, err instanceof Error ? err.message : err);
    }
  }

  return { ...base, aiGenerated: false };
}

// ── Rule-based computations (always run, used as LLM context too) ────────────

function computeBaseInsights(data: AggregatedDeveloperMetric[]): TeamInsights {
  const topContributor = [...data].sort((a, b) => b.totalCommits - a.totalCommits)[0].name;

  const avgPickup = avg(data.map((d) => d.pickupDelayHrs));
  const avgReview = avg(data.map((d) => d.reviewLifecycleHrs));
  const avgCycle  = avg(data.map((d) => d.cycleTimeHrs));

  let bottleneck: TeamInsights['bottleneck'] = 'none';
  let bottleneckDetail = 'Workflow looks healthy.';
  if (avgPickup > 8) {
    bottleneck = 'pickup';
    bottleneckDetail = `Average pickup delay is ${avgPickup.toFixed(1)} hrs (>8 h threshold). PRs are waiting too long for a first review.`;
  } else if (avgReview > 16) {
    bottleneck = 'review';
    bottleneckDetail = `Average review lifecycle is ${avgReview.toFixed(1)} hrs (>16 h threshold). Reviews are taking too long to complete.`;
  }

  const totalFeatures = sum(data.map((d) => d.workType.features));
  const totalBugs     = sum(data.map((d) => d.workType.bugs));
  const totalInfra    = sum(data.map((d) => d.workType.infraOrDebt));
  const grandTotal    = totalFeatures + totalBugs + totalInfra;
  const bugPct        = grandTotal > 0 ? (totalBugs / grandTotal) * 100 : 0;
  const workTypeImbalance = bugPct > 40;
  const workTypeDetail = grandTotal === 0
    ? 'No Jira issues linked.'
    : `Features ${pct(totalFeatures, grandTotal)}% · Bugs ${pct(totalBugs, grandTotal)}% · Infra/Debt ${pct(totalInfra, grandTotal)}%.` +
      (workTypeImbalance ? ' High bug ratio — consider allocating capacity to quality initiatives.' : '');

  let score = 100;
  if (avgCycle  > 40) score -= 30; else if (avgCycle  > 24) score -= 15;
  if (avgPickup > 8)  score -= 20; else if (avgPickup > 4)  score -= 10;
  if (avgReview > 16) score -= 20; else if (avgReview > 8)  score -= 10;
  if (workTypeImbalance) score -= 15;
  const teamHealthScore = Math.max(0, score);

  const summary =
    `Team health score: ${teamHealthScore}/100. ` +
    `Top contributor: ${topContributor}. ` +
    (bottleneck !== 'none' ? `Bottleneck: ${bottleneckDetail} ` : 'No cycle bottleneck detected. ') +
    workTypeDetail;

  return {
    topContributor, bottleneck, bottleneckDetail,
    workTypeImbalance, workTypeDetail, teamHealthScore,
    summary, aiGenerated: false,
  };
}

function buildPrompt(data: AggregatedDeveloperMetric[], base: TeamInsights): string {
  const devSummaries = data.map((d) => {
    let line =
      `- ${d.name}: ${d.totalCommits} commits, ${d.totalPRs} PRs, ` +
      `cycle ${d.cycleTimeHrs.toFixed(1)}h, pickup ${d.pickupDelayHrs.toFixed(1)}h, ` +
      `quality score ${d.codeQuality.score}/100, ` +
      `bugs ${d.workType.bugs} / features ${d.workType.features} / infra ${d.workType.infraOrDebt}`;
    if (d.specMetrics) {
      line +=
        `, spec adherence ${d.specMetrics.specAdherenceScore}/100` +
        `, regressions ${d.specMetrics.specRegressions}` +
        `, clarification delay ${d.specMetrics.clarificationDelayHrs.toFixed(1)}h` +
        `, FPY ${d.specMetrics.firstPassYield ? 'PASS' : 'FAIL'}`;
    }
    return line;
  }).join('\n');

  const hasSpecData = data.some((d) => d.specMetrics !== undefined);
  const specSection = hasSpecData
    ? `\nSpec-driven summary: ${buildSpecSummary(data)}`
    : '';

  return `You are an engineering manager assistant. Write a concise 3–4 sentence narrative summary of the following team metrics report. Focus on actionable observations. Do not use bullet points — write in plain prose. Do not repeat raw numbers already obvious from a dashboard. Point out the most important thing to act on.

Team health score: ${base.teamHealthScore}/100
Bottleneck: ${base.bottleneckDetail}
Work type: ${base.workTypeDetail}${specSection}

Per-developer breakdown:
${devSummaries}

Write the summary now:`;
}

function buildSpecSummary(data: AggregatedDeveloperMetric[]): string {
  const withSpec = data.filter((d) => d.specMetrics);
  if (withSpec.length === 0) return 'No spec data.';

  const avgAdherence = withSpec.reduce((s, d) => s + d.specMetrics!.specAdherenceScore, 0) / withSpec.length;
  const totalRegressions = withSpec.reduce((s, d) => s + d.specMetrics!.specRegressions, 0);
  const avgClarDelay = withSpec.reduce((s, d) => s + d.specMetrics!.clarificationDelayHrs, 0) / withSpec.length;
  const fpyCount = withSpec.filter((d) => d.specMetrics!.firstPassYield).length;

  return (
    `Avg spec adherence ${Math.round(avgAdherence)}/100. ` +
    `Total spec regressions ${totalRegressions}. ` +
    `Avg clarification delay ${avgClarDelay.toFixed(1)}h. ` +
    `${fpyCount}/${withSpec.length} developers achieved first-pass yield.`
  );
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
