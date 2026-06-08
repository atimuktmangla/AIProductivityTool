import { useEffect } from 'react';
import type { AggregatedDeveloperMetric, PRSummary } from '../types/index.js';

interface ContributorDrawerProps {
  metric:  AggregatedDeveloperMetric | null;
  onClose: () => void;
}

function fmtHrs(v: number): string {
  return v === 0 ? '—' : `${v.toFixed(1)} hrs`;
}

function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function avatarInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="drawer__stat-card">
      <span className="drawer__stat-label">{label}</span>
      <span className="drawer__stat-value">{value}</span>
    </div>
  );
}

function QualityBar({ label, value, max = 100, colorClass }: { label: string; value: number | null; max?: number; colorClass: string }) {
  const pct = value !== null ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="drawer__quality-bar">
      <span className="drawer__quality-label">{label}</span>
      <div className="drawer__quality-track">
        {value !== null && (
          <div className={`drawer__quality-fill ${colorClass}`} style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="drawer__quality-value" style={{ color: value === null ? '#8b8fa8' : undefined }}>
        {value !== null ? value : 'N/A'}
      </span>
    </div>
  );
}

function StateBadge({ state }: { state: PRSummary['state'] }) {
  const cls = state === 'MERGED' ? 'drawer__pr-badge--merged'
            : state === 'OPEN'   ? 'drawer__pr-badge--open'
            : 'drawer__pr-badge--declined';
  return <span className={`drawer__pr-badge ${cls}`}>{state}</span>;
}

export function ContributorDrawer({ metric, onClose }: ContributorDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!metric) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [metric, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (metric) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [metric]);

  if (!metric) return null;

  const { name, developerId, totalCommits, totalPRs, prsReviewed, linesChanged,
          cycleTimeHrs, pickupDelayHrs, reviewLifecycleHrs, reviewDepth,
          workType, codeQuality, prs } = metric;

  const sortedPRs = [...prs].sort((a, b) => b.createdDate - a.createdDate);
  const totalWorkType = workType.features + workType.bugs + workType.infraOrDebt;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="contributor-drawer" role="dialog" aria-modal="true" aria-label={`${name} details`}>

        {/* Header */}
        <div className="drawer__header">
          <div className="drawer__header-identity">
            <span className="drawer__avatar">{avatarInitials(name)}</span>
            <div>
              <h2 className="drawer__name">{name}</h2>
              <span className="drawer__id">{developerId}</span>
            </div>
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>

        <div className="drawer__body">

          {/* Quick stats */}
          <section className="drawer__section">
            <div className="drawer__stat-row">
              <StatCard label="Commits" value={totalCommits} />
              <StatCard label="PRs merged" value={totalPRs} />
              <StatCard label="PRs reviewed" value={prsReviewed} />
              <StatCard label="Lines +" value={`+${linesChanged.added.toLocaleString()}`} />
              <StatCard label="Lines −" value={`-${linesChanged.deleted.toLocaleString()}`} />
            </div>
          </section>

          {/* Cycle time */}
          <section className="drawer__section">
            <h3 className="drawer__section-title">Cycle time (avg)</h3>
            <div className="drawer__stat-row">
              <StatCard label="Pickup delay" value={fmtHrs(pickupDelayHrs)} />
              <StatCard label="Review lifecycle" value={fmtHrs(reviewLifecycleHrs)} />
              <StatCard label="Total cycle" value={fmtHrs(cycleTimeHrs)} />
              <StatCard label="Review depth" value={reviewDepth === 0 ? '—' : reviewDepth.toFixed(1)} />
            </div>
          </section>

          {/* Work type */}
          {totalWorkType > 0 && (
            <section className="drawer__section">
              <h3 className="drawer__section-title">Work type ({totalWorkType} issues)</h3>
              <div className="drawer__worktype-row">
                <span className="drawer__worktype-chip drawer__worktype-chip--feature">Features {workType.features}</span>
                <span className="drawer__worktype-chip drawer__worktype-chip--bug">Bugs {workType.bugs}</span>
                <span className="drawer__worktype-chip drawer__worktype-chip--infra">Infra &amp; debt {workType.infraOrDebt}</span>
              </div>
            </section>
          )}

          {/* Code quality */}
          <section className="drawer__section">
            <h3 className="drawer__section-title">
              Code quality
              <span className={`drawer__quality-badge ${codeQuality.score >= 75 ? 'drawer__quality-badge--good' : codeQuality.score >= 50 ? 'drawer__quality-badge--fair' : 'drawer__quality-badge--poor'}`}>
                {codeQuality.score}
              </span>
            </h3>
            <div className="drawer__quality-bars">
              <QualityBar
                label="Critical / Security"
                value={codeQuality.criticalScore}
                colorClass="drawer__quality-fill--bug"
              />
              <QualityBar
                label="Approval rate"
                value={codeQuality.approvalScore}
                colorClass="drawer__quality-fill--review"
              />
              <QualityBar
                label="PR focus"
                value={codeQuality.prFocusScore}
                colorClass="drawer__quality-fill--review"
              />
              <QualityBar
                label="Low rework"
                value={Math.round(100 * Math.pow(2, -codeQuality.reworkRate))}
                colorClass="drawer__quality-fill--rework"
              />
            </div>
          </section>

          {/* PR list */}
          <section className="drawer__section drawer__section--prs">
            <h3 className="drawer__section-title">Pull requests ({sortedPRs.length})</h3>
            {sortedPRs.length === 0
              ? <p className="drawer__empty">No PRs in the selected date range.</p>
              : (
                <div className="drawer__pr-scroll">
                  <table className="drawer__pr-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Repo</th>
                        <th>State</th>
                        <th>Created</th>
                        <th>Cycle</th>
                        <th>Lines ±</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPRs.map((pr) => (
                        <tr key={pr.id}>
                          <td className="drawer__pr-title">
                            {pr.url
                              ? <a href={pr.url} target="_blank" rel="noopener noreferrer" className="drawer__pr-link">{pr.title}</a>
                              : pr.title}
                          </td>
                          <td className="drawer__pr-repo">
                            <span className="drawer__pr-project">{pr.projectKey}</span>/{pr.repoSlug}
                          </td>
                          <td><StateBadge state={pr.state} /></td>
                          <td className="drawer__pr-date">{fmtDate(pr.createdDate)}</td>
                          <td className="drawer__pr-hrs">{pr.cycleTimeHrs === 0 ? '—' : `${pr.cycleTimeHrs.toFixed(1)}h`}</td>
                          <td className="drawer__pr-lines">
                            <span style={{ color: '#4fc87f' }}>+{pr.linesAdded}</span>
                            {' / '}
                            <span style={{ color: '#f74f4f' }}>-{pr.linesRemoved}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </section>

        </div>
      </aside>
    </>
  );
}
