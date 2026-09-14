import type { TeamInsights } from '../types/index.js';

interface InsightsPanelProps {
  insights: TeamInsights;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  openai:    'GPT-4o mini (OpenAI)',
  gemini:    'Gemini 2.0 Flash (Google)',
};

const HEALTH_COLOR = (score: number) =>
  score >= 75 ? '#4fc87f' : score >= 50 ? '#f7b24f' : '#f74f4f';

const HEALTH_LABEL = (score: number) =>
  score >= 75 ? 'Healthy' : score >= 50 ? 'Fair' : 'At risk';

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const {
    summary, teamHealthScore, bottleneck, bottleneckDetail,
    workTypeImbalance, workTypeDetail, aiGenerated, aiProvider,
  } = insights;

  const color = HEALTH_COLOR(teamHealthScore);

  return (
    <section className="insights-panel">
      <div className="insights-panel__header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          Team Insights
        </h2>
        <div className="insights-panel__badges">
          <span
            className="insights-panel__health-badge"
            style={{ background: `${color}22`, color, border: `1px solid ${color}` }}
          >
            Health {teamHealthScore}/100 — {HEALTH_LABEL(teamHealthScore)}
          </span>
          {aiGenerated && aiProvider && (
            <span className="insights-panel__ai-badge">
              ✦ {PROVIDER_LABEL[aiProvider] ?? aiProvider}
            </span>
          )}
        </div>
      </div>

      <p className="insights-panel__summary">{summary}</p>

      <div className="insights-panel__signals">
        {bottleneck !== 'none' && (
          <div className="insights-signal insights-signal--warn">
            <span className="insights-signal__icon">⚠</span>
            <span>{bottleneckDetail}</span>
          </div>
        )}
        {workTypeImbalance && (
          <div className="insights-signal insights-signal--warn">
            <span className="insights-signal__icon">⚠</span>
            <span>{workTypeDetail}</span>
          </div>
        )}
        {bottleneck === 'none' && !workTypeImbalance && (
          <div className="insights-signal insights-signal--ok">
            <span className="insights-signal__icon">✓</span>
            <span>No workflow bottlenecks or work-type imbalances detected.</span>
          </div>
        )}
      </div>
    </section>
  );
}
