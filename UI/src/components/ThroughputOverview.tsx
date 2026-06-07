import type { AggregatedDeveloperMetric } from '../types/index.js';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';

const TOOLTIP = (
  <>
    <h4>Throughput Overview</h4>
    <p>Team-wide output summary for the selected date window.</p>
    <ul>
      <li><strong>Total Commits</strong> — count of all commits authored by the selected developers across the scoped repos. Delta shows change vs. the comparison period (if set).</li>
      <li><strong>Lines Added / Deleted</strong> — raw diff lines summed from every merged PR. High deletions relative to additions can indicate cleanup or refactoring sprints.</li>
      <li><strong>Avg Cycle Time</strong> — mean hours from PR creation to merge, counted only on Mon–Fri 09:00–17:00 and discounted for ~2.75 leave/holiday days per month. Lower is better.</li>
    </ul>
    <p className="tip-source">Source: Bitbucket commits + PR diffs</p>
  </>
);

interface ThroughputOverviewProps {
  data:          AggregatedDeveloperMetric[];
  previousData?: AggregatedDeveloperMetric[];
  isLoading:     boolean;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?:  string;
  delta?: number | null; // positive = improvement direction depends on metric
  deltaLabel?: string;
}

function Delta({ value, label }: { value: number; label?: string }) {
  const sign   = value > 0 ? '+' : '';
  const colour = value > 0 ? '#4fc87f' : '#f74f4f';
  return (
    <span style={{ fontSize: '0.75rem', color: colour, marginLeft: '0.4rem' }}>
      {sign}{label ?? value}
    </span>
  );
}

function StatCard({ label, value, sub, delta, deltaLabel }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">
        {value}
        {delta != null && delta !== 0 && <Delta value={delta} label={deltaLabel} />}
      </span>
      {sub && <span className="stat-card__sub">{sub}</span>}
    </div>
  );
}

function sum(data: AggregatedDeveloperMetric[], key: 'totalCommits'): number;
function sum(data: AggregatedDeveloperMetric[], key: 'linesAdded' | 'linesDeleted'): number;
function sum(data: AggregatedDeveloperMetric[], key: string): number {
  if (key === 'linesAdded')   return data.reduce((s, d) => s + d.linesChanged.added,   0);
  if (key === 'linesDeleted') return data.reduce((s, d) => s + d.linesChanged.deleted, 0);
  return data.reduce((s, d) => s + (d as unknown as Record<string, number>)[key], 0);
}

function avgCycle(data: AggregatedDeveloperMetric[]): number | null {
  if (data.length === 0) return null;
  return data.reduce((s, d) => s + d.cycleTimeHrs, 0) / data.length;
}

export function ThroughputOverview({ data, previousData, isLoading }: ThroughputOverviewProps) {
  if (isLoading) {
    return (
      <section className="throughput-overview">
        <h2 className="section-title">Throughput Overview <WidgetTooltip content={TOOLTIP} /></h2>
        <div className="throughput-overview__grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card">
              <Skeleton height="0.75rem" width="60%" />
              <Skeleton height="2rem"   width="40%" className="stat-card__value-skeleton" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const totalCommits = sum(data, 'totalCommits');
  const totalAdded   = sum(data, 'linesAdded');
  const totalDeleted = sum(data, 'linesDeleted');
  const cycle        = avgCycle(data);

  const prevCommits = previousData ? sum(previousData, 'totalCommits') : null;
  const prevAdded   = previousData ? sum(previousData, 'linesAdded')   : null;
  const prevCycle   = previousData ? avgCycle(previousData)            : null;

  const commitDelta = prevCommits != null ? totalCommits - prevCommits : null;
  const addedDelta  = prevAdded   != null ? totalAdded   - prevAdded   : null;
  // For cycle time: negative delta is good (faster = better) — flip sign for colour
  const cycleDeltaRaw = (cycle != null && prevCycle != null) ? cycle - prevCycle : null;
  const cycleDelta    = cycleDeltaRaw != null ? -cycleDeltaRaw : null; // invert so green = faster
  const cycleDeltaLabel = cycleDeltaRaw != null
    ? `${cycleDeltaRaw > 0 ? '+' : ''}${cycleDeltaRaw.toFixed(1)} hrs`
    : undefined;

  return (
    <section className="throughput-overview">
      <h2 className="section-title">Throughput Overview</h2>
      <div className="throughput-overview__grid">
        <StatCard label="Total Commits"  value={totalCommits} delta={commitDelta} />
        <StatCard label="Lines Added"    value={`+${totalAdded.toLocaleString()}`}  delta={addedDelta} />
        <StatCard label="Lines Deleted"  value={`-${totalDeleted.toLocaleString()}`} />
        <StatCard
          label="Avg Cycle Time"
          value={cycle != null ? `${cycle.toFixed(1)} hrs` : '—'}
          sub="leave-adjusted, Mon–Fri"
          delta={cycleDelta}
          deltaLabel={cycleDeltaLabel}
        />
      </div>
    </section>
  );
}
