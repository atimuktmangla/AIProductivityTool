import { useState, useCallback, type MouseEvent, type ReactNode } from 'react';
import type { AggregatedDeveloperMetric } from '../types/index.js';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';

const TOOLTIP = (
  <>
    <h4>Team Contributors</h4>
    <p>Per-developer breakdown of every metric. Click a row to open the detail drawer. Click a column header to sort.</p>
    <ul>
      <li><strong>Commits</strong> — total commits pushed to the scoped repos in the date range.</li>
      <li><strong>PRs reviewed</strong> — merged PRs authored by others where this developer participated as a reviewer.</li>
      <li><strong>Lines ± </strong> — lines added (green) and deleted (red) across all merged PRs, with a mini balance bar.</li>
      <li><strong>Cycle (hrs)</strong> — avg working hours from PR creation to merge (leave-adjusted).</li>
      <li><strong>Pickup (hrs)</strong> — avg working hours until the first reviewer engages.</li>
      <li><strong>Review lifecycle (hrs)</strong> — avg working hours from first comment to merge.</li>
      <li><strong>Review depth</strong> — avg reviewer actions (comments/approvals) per PR. Informational; not part of the quality score.</li>
      <li><strong>Work type</strong> — mini stacked bar: blue = Features, red = Bugs, amber = Infra/Debt.</li>
      <li><strong>Stale PRs</strong> — open PRs older than the configured threshold (default 3 business days). Shown in amber when &gt; 0.</li>
      <li><strong>Avg PR size</strong> — mean lines changed per PR. ⚑ flag appears when &gt; 400 lines (large, harder to review).</li>
      <li><strong>Quality</strong> — composite 0–100 score: 25% security resolution (2.5× multiplier for BlackDuck/CVE fixes) + 25% approval rate (24-h SLA, rubber-stamp penalised) + 25% PR focus (sigmoid on avg size) + 25% low rework (exponential penalty on RESCOPED events).</li>
    </ul>
    <p className="tip-source">Source: Bitbucket commits, PRs, activities + Jira issues</p>
  </>
);

function exportCsv(data: AggregatedDeveloperMetric[]) {
  const header = ['Name', 'ID', 'Commits', 'PRsReviewed', 'Lines+', 'Lines-',
    'CycleHrs', 'PickupHrs', 'ReviewLifecycleHrs', 'ReviewDepth',
    'AvgPRSizeLines', 'QualityScore', 'Features', 'Bugs', 'InfraDebt'];
  const rows = data.map((d) => [
    d.name, d.developerId, d.totalCommits, d.prsReviewed,
    d.linesChanged.added, d.linesChanged.deleted,
    d.cycleTimeHrs.toFixed(1), d.pickupDelayHrs.toFixed(1),
    d.reviewLifecycleHrs.toFixed(1), d.reviewDepth.toFixed(1),
    d.avgPrSizeLines,
    d.codeQuality.score,
    d.workType.features, d.workType.bugs, d.workType.infraOrDebt,
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'team-metrics.csv'; a.click();
  URL.revokeObjectURL(url);
}

interface ContributorTableProps {
  data:      AggregatedDeveloperMetric[];
  isLoading: boolean;
  onSelect:  (metric: AggregatedDeveloperMetric) => void;
}

type SortKey = keyof AggregatedDeveloperMetric;
type SortDir = 'asc' | 'desc';

function buildCols(onSelect: (d: AggregatedDeveloperMetric) => void): { label: string; key: SortKey; render: (d: AggregatedDeveloperMetric) => ReactNode }[] {
  return [
  {
    label: 'Developer',
    key:   'name',
    render: (d) => (
      <button
        type="button"
        className="c-table__name-btn"
        onClick={() => onSelect(d)}
        title="View details"
      >
        <span className="c-table__avatar" aria-hidden="true">
          {d.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
        </span>
        <span>
          <strong>{d.name}</strong>
          <small style={{ display: 'block', color: '#8b8fa8', fontSize: '0.7rem' }}>
            {d.developerId}
          </small>
        </span>
      </button>
    ),
  },
  {
    label: 'Commits',
    key:   'totalCommits',
    render: (d) => d.totalCommits,
  },
  {
    label: 'PRs reviewed',
    key:   'prsReviewed',
    render: (d) => d.prsReviewed === 0
      ? <span style={{ color: '#8b8fa8' }}>0</span>
      : d.prsReviewed,
  },
  {
    label: 'Lines ± (added/del)',
    key:   'linesChanged',
    render: (d) => (
      <span>
        <span style={{ color: '#4fc87f' }}>+{d.linesChanged.added.toLocaleString()}</span>
        {' / '}
        <span style={{ color: '#f74f4f' }}>-{d.linesChanged.deleted.toLocaleString()}</span>
        <LineBalanceBar added={d.linesChanged.added} deleted={d.linesChanged.deleted} />
      </span>
    ),
  },
  {
    label: 'Cycle (hrs)',
    key:   'cycleTimeHrs',
    render: (d) => fmtHrs(d.cycleTimeHrs),
  },
  {
    label: 'Pickup (hrs)',
    key:   'pickupDelayHrs',
    render: (d) => fmtHrs(d.pickupDelayHrs),
  },
  {
    label: 'Review lifecycle (hrs)',
    key:   'reviewLifecycleHrs',
    render: (d) => fmtHrs(d.reviewLifecycleHrs),
  },
  {
    label: 'Review depth',
    key:   'reviewDepth',
    render: (d) => fmtHrs(d.reviewDepth),
  },
  {
    label: 'Work type',
    key:   'workType',
    render: (d) => <WorkTypeSparkline metric={d} />,
  },
  {
    label: 'Stale PRs',
    key:   'openPrsOverThreshold',
    render: (d) => d.openPrsOverThreshold === 0
      ? <span style={{ color: '#8b8fa8' }}>0</span>
      : <span style={{ color: '#f7b24f', fontWeight: 600 }}>{d.openPrsOverThreshold}</span>,
  },
  {
    label: 'Avg PR size',
    key:   'avgPrSizeLines',
    render: (d) => (
      <span>
        {d.avgPrSizeLines === 0 ? '—' : d.avgPrSizeLines.toLocaleString()}
        {d.avgPrSizeLines > 400 && (
          <span title="Large PR: avg size exceeds 400 lines" style={{ marginLeft: '0.3rem', color: '#f7b24f' }}>
            ⚑
          </span>
        )}
      </span>
    ),
  },
  {
    label: 'Quality',
    key:   'codeQuality',
    render: (d) => <QualityBadge score={d.codeQuality.score} />,
  },
];}  // end buildCols

function fmtHrs(v: number): string {
  return v === 0 ? '—' : v.toFixed(1);
}

function LineBalanceBar({ added, deleted }: { added: number; deleted: number }) {
  const total = added + deleted;
  if (total === 0) return null;
  const addPct = Math.round((added / total) * 100);
  return (
    <div
      className="line-balance"
      title={`+${added} / -${deleted}`}
      style={{ display: 'flex', height: '4px', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}
    >
      <div style={{ width: `${addPct}%`, background: '#4fc87f' }} />
      <div style={{ width: `${100 - addPct}%`, background: '#f74f4f' }} />
    </div>
  );
}

function WorkTypeSparkline({ metric }: { metric: AggregatedDeveloperMetric }) {
  const { features, bugs, infraOrDebt } = metric.workType;
  const total = features + bugs + infraOrDebt;
  if (total === 0) return <span style={{ color: '#8b8fa8' }}>—</span>;

  const data = [
    { value: features,    color: '#4f8ef7', label: 'F' },
    { value: bugs,        color: '#f74f4f', label: 'B' },
    { value: infraOrDebt, color: '#f7b24f', label: 'I' },
  ].filter((d) => d.value > 0);

  return (
    <span className="wt-mini" title={`F:${features} B:${bugs} I:${infraOrDebt}`}>
      {data.map((d) => (
        <span
          key={d.label}
          className="wt-mini__segment"
          style={{
            width:      `${Math.round((d.value / total) * 48)}px`,
            background: d.color,
          }}
          aria-label={`${d.label}:${d.value}`}
        />
      ))}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  let cls = 'cq-badge';
  if (score >= 75) cls += ' cq-badge--good';
  else if (score >= 50) cls += ' cq-badge--fair';
  else cls += ' cq-badge--poor';
  return <span className={cls}>{score}</span>;
}

function getSortValue(d: AggregatedDeveloperMetric, key: SortKey): number | string {
  const v = d[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (key === 'linesChanged') {
    const lc = v as { added: number; deleted: number };
    return lc.added + lc.deleted;
  }
  if (key === 'workType') {
    const wt = v as { features: number; bugs: number; infraOrDebt: number };
    return wt.features + wt.bugs + wt.infraOrDebt;
  }
  if (key === 'codeQuality') {
    return (v as { score: number }).score;
  }
  return 0;
}

export function ContributorTable({ data, isLoading, onSelect }: ContributorTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalCommits');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const COLS = buildCols(onSelect);

  const handleTableSort = useCallback(
    (_e: MouseEvent<HTMLButtonElement>, fieldKey: SortKey) => {
      if (fieldKey === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(fieldKey);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  const sorted = [...data].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <section className="contributor-table">
      <div className="contributor-table__header">
        <h2 className="section-title">Team Contributors <WidgetTooltip content={TOOLTIP} /></h2>
        {data.length > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => exportCsv(data)}>
            Export CSV
          </button>
        )}
      </div>
      <div className="contributor-table__scroll">
        <table className="c-table">
          <thead>
            <tr>
              {COLS.map((col) => (
                <th key={col.key as string} className="c-table__th">
                  <button
                    type="button"
                    className="c-table__sort-btn"
                    onClick={(e) => handleTableSort(e, col.key)}
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span aria-hidden="true" className="c-table__sort-arrow">
                        {sortDir === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {COLS.map((col) => (
                      <td key={col.key as string} className="c-table__td">
                        <Skeleton height="0.9rem" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row) => (
                  <tr key={row.developerId} className="c-table__row">
                    {COLS.map((col) => (
                      <td key={col.key as string} className="c-table__td">
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

