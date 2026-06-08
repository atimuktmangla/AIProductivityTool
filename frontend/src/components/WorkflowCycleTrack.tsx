import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { AggregatedDeveloperMetric } from '../types/index.js';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';

const TOOLTIP = (
  <>
    <h4>Workflow Cycle Track</h4>
    <p>Breaks total PR cycle time into three sequential stages so you can see exactly where time is lost.</p>
    <ul>
      <li><strong>Pickup Speed</strong> — working hours from PR creation to the first reviewer action (comment, review, or approval). Target: ≤ 4 hrs (green), 4–8 hrs (amber), &gt; 8 hrs (red).</li>
      <li><strong>Review Quality</strong> — working hours from the first reviewer comment to merge. Measures how long the review conversation takes. Target: ≤ 8 hrs (green), 8–16 hrs (amber), &gt; 16 hrs (red).</li>
      <li><strong>Total Cycle Time</strong> — end-to-end working hours from PR creation to merge, adjusted for weekends and ~2.75 leave days/month. Target: ≤ 24 hrs (green), 24–40 hrs (amber), &gt; 40 hrs (red).</li>
    </ul>
    <p>The bar chart compares the three stages side-by-side when multiple developers are selected.</p>
    <p className="tip-source">Source: Bitbucket PR activities (created/comment/merge timestamps)</p>
  </>
);

interface WorkflowCycleTrackProps {
  data:      AggregatedDeveloperMetric[];
  isLoading: boolean;
}

// Team performance benchmarks (hours). Colour indicates how actual compares.
const BENCHMARKS = {
  pickupDelayHrs:     { good: 4,  warn: 8  },
  reviewLifecycleHrs: { good: 8,  warn: 16 },
  cycleTimeHrs:       { good: 24, warn: 40 },
};

type BenchmarkKey = keyof typeof BENCHMARKS;

function ratingColor(value: number, key: BenchmarkKey): string {
  const { good, warn } = BENCHMARKS[key];
  if (value <= good) return '#4fc87f';
  if (value <= warn) return '#f7b24f';
  return '#f74f4f';
}

function ratingLabel(value: number, key: BenchmarkKey): string {
  const { good, warn } = BENCHMARKS[key];
  if (value === 0) return '—';
  if (value <= good) return 'On track';
  if (value <= warn) return 'Needs attention';
  return 'At risk';
}

const fmt = (v: number) => (v === 0 ? '—' : `${v.toFixed(1)} hrs`);

export function WorkflowCycleTrack({ data, isLoading }: WorkflowCycleTrackProps) {
  if (isLoading) {
    return (
      <section className="workflow-cycle-track">
        <h2 className="section-title">Workflow Cycle Track <WidgetTooltip content={TOOLTIP} /></h2>
        <Skeleton width="100%" height="200px" />
      </section>
    );
  }

  const avg = (fn: (d: AggregatedDeveloperMetric) => number): number =>
    data.length ? data.reduce((s, d) => s + fn(d), 0) / data.length : 0;

  const stages: { key: BenchmarkKey; label: string; detail: string; value: number }[] = [
    {
      key:    'pickupDelayHrs',
      label:  'Pickup Speed',
      detail: 'PR created → first review',
      value:  avg((d) => d.pickupDelayHrs),
    },
    {
      key:    'reviewLifecycleHrs',
      label:  'Review Quality',
      detail: 'First comment → merge',
      value:  avg((d) => d.reviewLifecycleHrs),
    },
    {
      key:    'cycleTimeHrs',
      label:  'Total Cycle Time',
      detail: 'Creation → merge (leave-adjusted)',
      value:  avg((d) => d.cycleTimeHrs),
    },
  ];

  const chartData = stages.map((s) => ({ name: s.label, hours: parseFloat(s.value.toFixed(2)) }));

  return (
    <section className="workflow-cycle-track">
      <h2 className="section-title">Workflow Cycle Track <WidgetTooltip content={TOOLTIP} /></h2>

      <div className="wf-track">
        {stages.map((stage) => (
          <div key={stage.key} className="wf-stage">
            <span className="wf-stage__label">{stage.label}</span>
            <span className="wf-stage__value" style={{ color: ratingColor(stage.value, stage.key) }}>
              {fmt(stage.value)}
            </span>
            <span className="wf-stage__detail">{stage.detail}</span>
            <span
              className="wf-stage__rating"
              style={{ color: ratingColor(stage.value, stage.key) }}
            >
              {ratingLabel(stage.value, stage.key)}
            </span>
          </div>
        ))}
      </div>

      {data.length > 1 && (
        <div className="wf-barchart">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis dataKey="name" tick={{ fill: '#8b8fa8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b8fa8', fontSize: 11 }} unit=" h" />
              <Tooltip
                formatter={(v) => [`${v} hrs`]}
                contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e4ed' }}
              />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={ratingColor(stages[i].value, stages[i].key)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
