import { useState, useEffect, useCallback } from 'react';
import { useSync } from '../hooks/useSync.js';
import { UserPicker } from './UserPicker.js';
import { Skeleton } from './Skeleton.js';
import type { BitbucketUser } from '../types/index.js';

const API_HEADERS = { 'X-Api-Key': import.meta.env.VITE_API_KEY as string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: number | string | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelative(ms: number | null): string {
  if (!ms) return 'Not scheduled';
  const diff = ms - Date.now();
  if (diff <= 0) return 'Imminent';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs} h`;
  return `in ${Math.floor(hrs / 24)} d`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function scheduleLabel(opt: string): string {
  if (opt === 'daily')  return 'Daily (every 24 h)';
  if (opt === 'weekly') return 'Weekly (every 7 d)';
  return 'Run once now';
}

// ── Elapsed ticker ─────────────────────────────────────────────────────────────

function ElapsedTimer({ startMs }: { startMs: number }) {
  const [elapsed, setElapsed] = useState(() => fmtElapsed(startMs));
  useEffect(() => {
    const id = setInterval(() => setElapsed(fmtElapsed(startMs)), 1000);
    return () => clearInterval(id);
  }, [startMs]);
  return <>{elapsed}</>;
}

// ── Project selector ──────────────────────────────────────────────────────────

function ProjectPills({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (key: string) => void;
}) {
  const [projects, setProjects] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/projects', { signal: controller.signal, headers: API_HEADERS })
      .then((r) => r.json() as Promise<string[]>)
      .then((keys) => { setProjects(keys); setLoading(false); })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) return <span className="repo-picker__loading">Loading projects…</span>;

  return (
    <div className="repo-picker__tag-list" style={{ marginBottom: '0.75rem' }}>
      {projects.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(selected === key ? '' : key)}
          className={`repo-picker__tag${selected === key ? ' repo-picker__tag--active' : ''}`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

// ── Run history row ───────────────────────────────────────────────────────────

function LogRow({ log }: { log: import('../types/index.js').SyncRunLog }) {
  const [expanded, setExpanded] = useState(false);
  const okBatches  = log.batches.filter((b) => b.status === 'ok').length;
  const hasErrors  = log.batches.some((b) => b.status === 'error');

  return (
    <>
      <tr
        className={`sync-log-row sync-log-row--${hasErrors ? 'error' : 'ok'}`}
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
      >
        <td className="sync-logs-table__td">{fmtDate(log.startedAt)}</td>
        <td className="sync-logs-table__td">{log.totalUsers}</td>
        <td className="sync-logs-table__td">{fmtDuration(log.durationMs)}</td>
        <td className="sync-logs-table__td">{okBatches}/{log.batches.length}</td>
        <td className="sync-logs-table__td">
          <span className={`sync-status-badge sync-status-badge--${hasErrors ? 'error' : 'ok'}`}>
            {hasErrors ? 'Partial error' : 'OK'}
          </span>
        </td>
        <td className="sync-logs-table__td sync-logs-table__expand">
          {expanded ? '▲' : '▼'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div className="sync-log-detail">
              <table className="sync-log-detail__table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Users</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {log.batches.map((b) => (
                    <tr key={b.batchIndex} className={`sync-log-row--${b.status}`}>
                      <td>{b.batchIndex + 1}</td>
                      <td>{b.userIds.join(', ')}</td>
                      <td>{fmtDuration(b.durationMs)}</td>
                      <td>
                        <span className={`sync-status-badge sync-status-badge--${b.status}`}>
                          {b.status}
                        </span>
                      </td>
                      <td>{b.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SyncPage() {
  const {
    state,
    setMode,
    setSelectedUsers,
    setSelectedProject,
    setScheduleOption,
    setPurgeLogsOnRun,
    setConfirmed,
    saveAndRun,
  } = useSync();

  const {
    status, logs, mode, selectedUsers, selectedProject,
    scheduleOption, purgeLogsOnRun, confirmed,
    isLoadingStatus, isLoadingLogs, isSaving, error,
  } = state;

  const isRunning = status?.running ?? false;

  // ── All-users mode ────────────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState<BitbucketUser[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);

  const loadAllUsers = useCallback(() => {
    if (allUsers.length > 0) return;
    setAllUsersLoading(true);
    fetch('/api/dashboard/users', { headers: API_HEADERS })
      .then((r) => r.json() as Promise<BitbucketUser[]>)
      .then((users) => {
        setAllUsers(users);
        setAllUsersLoading(false);
        setSelectedUsers(users.map((u) => u.name));
      })
      .catch(() => setAllUsersLoading(false));
  }, [allUsers.length, setSelectedUsers]);

  useEffect(() => {
    if (mode === 'all') loadAllUsers();
  }, [mode, loadAllUsers]);

  // ── By-project mode ───────────────────────────────────────────────────────
  const [projectUsers, setProjectUsers] = useState<BitbucketUser[]>([]);
  useEffect(() => {
    if (mode !== 'by-project' || !selectedProject) {
      setProjectUsers([]);
      return;
    }
    fetch('/api/dashboard/users', { headers: API_HEADERS })
      .then((r) => r.json() as Promise<BitbucketUser[]>)
      .then(setProjectUsers)
      .catch(() => {});
  }, [mode, selectedProject]);

  // canRun: confirmed summary, not already saving or running
  const canRun = confirmed && !isSaving && !isRunning;

  // Date range the job will use (last 90 days)
  const jobEndDate   = new Date().toISOString().slice(0, 10);
  const jobStartDate = (() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="sync-page">

      {/* ── Status card ──────────────────────────────────────────────────── */}
      <section className="sync-page__section">
        <div className="sync-page__section-title">Sync Job Status</div>
        <div className="sync-status-card">
          {isLoadingStatus ? (
            <Skeleton width="60%" height="1rem" />
          ) : (
            <>
              <div className="sync-status-card__row">
                <span className={`sync-badge sync-badge--${isRunning ? 'running' : 'idle'}`}>
                  {isRunning ? 'Running' : 'Idle'}
                </span>
                <span className="sync-status-card__meta">
                  Last run: <strong>{fmtDate(status?.lastRunAt ?? null)}</strong>
                </span>
                <span className="sync-status-card__meta">
                  Next: <strong>{fmtRelative(status?.nextRunAt ?? null)}</strong>
                </span>
              </div>
              <div className="sync-status-card__users">
                {status?.configuredUsers.length ?? 0} users configured
                {status && status.intervalMinutes > 0 && (
                  <span className="sync-status-card__interval">
                    — {status.intervalMinutes === 1440 ? 'Daily' : 'Weekly'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Live progress panel (shown while running) ─────────────────────── */}
      {isRunning && status && (
        <section className="sync-page__section">
          <div className="sync-page__section-title">Progress</div>
          <div className="sync-progress-card">
            <div className="sync-progress-card__header">
              <span className="sync-badge sync-badge--running">Running</span>
              <span className="sync-progress-card__elapsed">
                Elapsed:{' '}
                <strong>
                  {status.runStartedAt ? <ElapsedTimer startMs={status.runStartedAt} /> : '—'}
                </strong>
              </span>
            </div>

            {status.totalSyncUsers > 0 && (
              <>
                {/* Progress bar */}
                <div className="sync-progress-bar__track">
                  <div
                    className="sync-progress-bar__fill"
                    style={{
                      width: `${Math.round((status.completedUsers.length / status.totalSyncUsers) * 100)}%`,
                    }}
                  />
                </div>

                {/* Counter line */}
                <div className="sync-progress-card__counter">
                  <span className="sync-progress-card__done">{status.completedUsers.length}</span>
                  {status.failedUsers.length > 0 && (
                    <span className="sync-progress-card__failed"> + {status.failedUsers.length} failed</span>
                  )}
                  <span className="sync-progress-card__total"> of {status.totalSyncUsers} users completed</span>
                  {status.currentUser && (
                    <span className="sync-progress-card__current">
                      &nbsp;— <strong>{status.currentUser}</strong> in progress
                    </span>
                  )}
                </div>

                {/* Completed users chips */}
                {status.completedUsers.length > 0 && (
                  <div className="sync-progress-card__chips">
                    {status.completedUsers.map((u) => (
                      <span key={u} className="sync-progress-chip sync-progress-chip--done">{u}</span>
                    ))}
                    {status.failedUsers.map((u) => (
                      <span key={u} className="sync-progress-chip sync-progress-chip--failed">{u}</span>
                    ))}
                    {status.currentUser && (
                      <span className="sync-progress-chip sync-progress-chip--active">
                        &#9654; {status.currentUser}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="sync-progress-card__hint">
              Refreshes every 5 s. Run History updates when complete.
            </div>
          </div>
        </section>
      )}

      {/* ── User selection ───────────────────────────────────────────────── */}
      <section className="sync-page__section">
        <div className="sync-page__section-title">Select Users to Sync</div>

        <div className="sync-mode-tabs">
          {(['all', 'by-project', 'manual'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`sync-mode-tab${mode === m ? ' sync-mode-tab--active' : ''}`}
            >
              {m === 'all' ? 'All users' : m === 'by-project' ? 'By project' : 'Select manually'}
            </button>
          ))}
        </div>

        <div className="sync-user-area">
          {mode === 'all' && (
            allUsersLoading
              ? <Skeleton width="100%" height="2rem" />
              : <p className="sync-user-area__hint">
                  {selectedUsers.length > 0
                    ? `${selectedUsers.length} users selected (all Bitbucket users)`
                    : 'Loading users…'}
                </p>
          )}

          {mode === 'by-project' && (
            <>
              <ProjectPills selected={selectedProject} onChange={setSelectedProject} />
              {selectedProject && (
                projectUsers.length > 0
                  ? <UserPicker selectedUsers={selectedUsers} onChange={setSelectedUsers} />
                  : <Skeleton width="100%" height="2rem" />
              )}
            </>
          )}

          {mode === 'manual' && (
            <UserPicker selectedUsers={selectedUsers} onChange={setSelectedUsers} />
          )}
        </div>

        {selectedUsers.length > 0 && mode !== 'all' && (
          <p className="sync-user-area__count">{selectedUsers.length} users selected</p>
        )}
      </section>

      {/* ── Schedule ────────────────────────────────────────────────────── */}
      <section className="sync-page__section">
        <div className="sync-page__section-title">Schedule</div>
        <div className="sync-schedule">
          {([
            ['now',    'Run once now'],
            ['daily',  'Daily (every 24 h)'],
            ['weekly', 'Weekly (every 7 d)'],
          ] as const).map(([value, label]) => (
            <label key={value} className="sync-schedule__option">
              <input
                type="radio"
                name="schedule"
                value={value}
                checked={scheduleOption === value}
                onChange={() => setScheduleOption(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* ── Config summary + confirm ─────────────────────────────────────── */}
      {selectedUsers.length > 0 && (
        <section className="sync-page__section">
          <div className="sync-page__section-title">Job Summary</div>
          <div className="sync-summary-card">
            <div className="sync-summary-card__row">
              <span className="sync-summary-card__label">Users</span>
              <span className="sync-summary-card__value">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}
                {selectedUsers.length <= 10 && (
                  <span className="sync-summary-card__names"> ({selectedUsers.join(', ')})</span>
                )}
              </span>
            </div>
            <div className="sync-summary-card__row">
              <span className="sync-summary-card__label">Date range</span>
              <span className="sync-summary-card__value">
                {jobStartDate} → {jobEndDate} <span className="sync-summary-card__hint">(last 90 days)</span>
              </span>
            </div>
            <div className="sync-summary-card__row">
              <span className="sync-summary-card__label">Schedule</span>
              <span className="sync-summary-card__value">{scheduleLabel(scheduleOption)}</span>
            </div>
            <div className="sync-summary-card__row">
              <span className="sync-summary-card__label">Processing</span>
              <span className="sync-summary-card__value">
                1 user at a time, sequentially ({Math.ceil(selectedUsers.length / 10)} group{Math.ceil(selectedUsers.length / 10) !== 1 ? 's' : ''} of up to 10)
              </span>
            </div>
            {purgeLogsOnRun && (
              <div className="sync-summary-card__row sync-summary-card__row--warn">
                <span className="sync-summary-card__label">Warning</span>
                <span className="sync-summary-card__value">Run logs will be purged before starting</span>
              </div>
            )}

            {!confirmed && (
              <button
                type="button"
                className="btn btn--secondary sync-confirm-btn"
                onClick={() => setConfirmed(true)}
              >
                Confirm &amp; enable Run
              </button>
            )}
            {confirmed && (
              <div className="sync-summary-card__confirmed">
                &#10003; Parameters confirmed — click Save &amp; Run below
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Purge + run ─────────────────────────────────────────────────── */}
      <section className="sync-page__section sync-page__section--actions">
        <label className="sync-purge-row">
          <input
            type="checkbox"
            checked={purgeLogsOnRun}
            onChange={(e) => setPurgeLogsOnRun(e.target.checked)}
          />
          Purge run logs before starting
        </label>

        {error && (
          <div className="dashboard__error" role="alert">{error}</div>
        )}

        {isRunning && (
          <div className="sync-running-notice" role="status">
            A sync is already running — wait for it to finish before starting a new one.
          </div>
        )}

        <button
          type="button"
          className={`btn btn--primary sync-run-btn${!canRun ? ' btn--disabled' : ''}`}
          onClick={canRun ? saveAndRun : undefined}
          disabled={!canRun}
          title={
            isRunning         ? 'A sync is already in progress' :
            !selectedUsers.length ? 'Select at least one user' :
            !confirmed        ? 'Review the Job Summary above and click Confirm first' :
            undefined
          }
        >
          {isSaving ? 'Starting…' : 'Save & Run'}
        </button>

        {!confirmed && selectedUsers.length > 0 && !isRunning && (
          <p className="sync-run-hint">Review the Job Summary above and click Confirm to enable this button.</p>
        )}
      </section>

      {/* ── Run history ─────────────────────────────────────────────────── */}
      <section className="sync-page__section">
        <div className="sync-page__section-title">
          Run History
          <span className="sync-page__section-count">(last 50 runs)</span>
        </div>

        {isLoadingLogs ? (
          <Skeleton width="100%" height="6rem" />
        ) : logs.length === 0 ? (
          <p className="sync-logs-empty">No runs recorded yet.</p>
        ) : (
          <div className="sync-logs-table__wrap">
            <table className="sync-logs-table">
              <thead>
                <tr>
                  <th className="sync-logs-table__th">Date</th>
                  <th className="sync-logs-table__th">Users</th>
                  <th className="sync-logs-table__th">Duration</th>
                  <th className="sync-logs-table__th">Batches</th>
                  <th className="sync-logs-table__th">Status</th>
                  <th className="sync-logs-table__th"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow key={log.runId} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
