import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts';
import type { AggregatedDeveloperMetric } from '../types/index.js';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';

const TOOLTIP = (
  <>
    <h4>Code Quality Score</h4>
    <p>A 0–100 composite from four equal-weighted signals (25% each).</p>
    <ul>
      <li><strong>Critical / Security (25%)</strong> — Jira issues resolved, with a 2.5× multiplier for BlackDuck, CVE, customer-reported, or RCA tickets. Rewards high-risk firefighting instead of penalising it.</li>
      <li><strong>Approval rate (25%)</strong> — % of PRs approved by a human within 24 h. Rubber-stamp approvals (under 5 min, zero comments) count as 50%.</li>
      <li><strong>PR focus (25%)</strong> — Sigmoid decay on avg PR size: ≤ 200 lines ≈ 100, 500 lines = 50, ≥ 800 lines ≈ 0. A 1-line security fix scores the same as a clean 200-line feature.</li>
      <li><strong>Low rework (25%)</strong> — Exponential penalty on RESCOPED events per PR. 0 rescopes = 100; penalty doubles every extra rescope.</li>
    </ul>
    <p>Thresholds: ≥ 75 = Good (green), 50–74 = Fair (amber), &lt; 50 = Needs work (red).</p>
    <p className="tip-source">Source: Jira issue types + Bitbucket PR activity events</p>
  </>
);

interface CodeQualityPanelProps {
  data:      AggregatedDeveloperMetric[];
  isLoading: boolean;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#4fc87f';
  if (score >= 50) return '#f7b24f';
  return '#f74f4f';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs work';
}

/** Circular arc gauge rendered via SVG. */
function ScoreGauge({ score }: { score: number }) {
  const r = 36;
  const cx = 52;
  const cy = 52;
  const circumference = Math.PI * r; // half-circle arc
  const fill = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <svg width="104" height="60" viewBox="0 0 104 60" aria-label={`Quality score ${score}`}>
      {/* track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#2a2d3a"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* fill */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${fill} ${circumference}`}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize="18" fontWeight="700">
        {score}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#8b8fa8" fontSize="9">
        / 100
      </text>
    </svg>
  );
}

export function CodeQualityPanel({ data, isLoading }: CodeQualityPanelProps) {
  if (isLoading) {
    return (
      <section className="code-quality-panel">
        <h2 className="section-title">Code Quality Score <WidgetTooltip content={TOOLTIP} /></h2>
        <Skeleton width="100%" height="240px" />
      </section>
    );
  }

  if (data.length === 0) return null;

  // ── Team average for radar ───────────────────────────────────────────────────
  const avg = (fn: (d: AggregatedDeveloperMetric) => number) =>
    Math.round(data.reduce((s, d) => s + fn(d), 0) / data.length);

  // Nullable variant: excludes developers where the signal is null (no data)
  const avgNullable = (fn: (d: AggregatedDeveloperMetric) => number | null): number | null => {
    const values = data.map(fn).filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  };

  const teamScore          = avg((d) => d.codeQuality.score);
  const teamCriticalScore  = avgNullable((d) => d.codeQuality.criticalScore);
  const teamApprovalScore  = avgNullable((d) => d.codeQuality.approvalScore);
  const teamPrFocusScore   = avgNullable((d) => d.codeQuality.prFocusScore);
  const teamReworkScore    = avg((d) => Math.round(100 * Math.pow(2, -d.codeQuality.reworkRate)));

  const radarData = [
    { axis: 'Critical / Security', value: teamCriticalScore ?? 0 },
    { axis: 'Approval rate',       value: teamApprovalScore ?? 0 },
    { axis: 'PR focus',            value: teamPrFocusScore  ?? 0 },
    { axis: 'Low rework',          value: teamReworkScore        },
  ];

  // ── Per-developer bar chart data ─────────────────────────────────────────────
  const barData = [...data]
    .sort((a, b) => b.codeQuality.score - a.codeQuality.score)
    .map((d) => ({ name: d.name.split(' ')[0], score: d.codeQuality.score }));

  return (
    <section className="code-quality-panel">
      <h2 className="section-title">Code Quality Score <WidgetTooltip content={TOOLTIP} /></h2>

      <div className="cq-body">
        {/* Team gauge */}
        <div className="cq-gauge-card">
          <span className="cq-gauge-card__label">Team average</span>
          <ScoreGauge score={teamScore} />
          <span className="cq-gauge-card__rating" style={{ color: scoreColor(teamScore) }}>
            {scoreLabel(teamScore)}
          </span>
          <div className="cq-sub-scores">
            <SubScore label="Critical / Security" value={teamCriticalScore} />
            <SubScore label="Approval rate"       value={teamApprovalScore} />
            <SubScore label="PR focus"            value={teamPrFocusScore}  />
            <SubScore label="Low rework"          value={teamReworkScore}   />
          </div>
        </div>

        {/* Radar */}
        <div className="cq-radar">
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="#2a2d3a" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#8b8fa8', fontSize: 11 }} />
              <Radar
                dataKey="value"
                stroke="#4f8ef7"
                fill="#4f8ef7"
                fillOpacity={0.25}
              />
              <Tooltip
                formatter={(v) => [`${v}`, 'Score']}
                contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e4ed' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Per-developer bars — only shown when >1 developer */}
        {data.length > 1 && (
          <div className="cq-bars">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8b8fa8', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#8b8fa8', fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v} / 100`]}
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e4ed' }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.name} fill={scoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="cq-sub-score">
      <span className="cq-sub-score__label">{label}</span>
      <div className="cq-sub-score__track">
        {value !== null && (
          <div
            className="cq-sub-score__fill"
            style={{ width: `${value}%`, background: scoreColor(value) }}
          />
        )}
      </div>
      <span className="cq-sub-score__value" style={{ color: value !== null ? scoreColor(value) : '#8b8fa8' }}>
        {value !== null ? value : 'N/A'}
      </span>
    </div>
  );
}
