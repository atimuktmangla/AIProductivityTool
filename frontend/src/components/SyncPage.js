import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useSync } from '../hooks/useSync.js';
import { UserPicker } from './UserPicker.js';
import { Skeleton } from './Skeleton.js';
const API_HEADERS = { 'X-Api-Key': import.meta.env.VITE_API_KEY };
// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
    if (!ts)
        return 'Never';
    return new Date(ts).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function fmtRelative(ms) {
    if (!ms)
        return 'Not scheduled';
    const diff = ms - Date.now();
    if (diff <= 0)
        return 'Imminent';
    const mins = Math.floor(diff / 60000);
    if (mins < 60)
        return `in ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)
        return `in ${hrs} h`;
    return `in ${Math.floor(hrs / 24)} d`;
}
function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtElapsed(startMs) {
    const s = Math.floor((Date.now() - startMs) / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function scheduleLabel(opt) {
    if (opt === 'daily')
        return 'Daily (every 24 h)';
    if (opt === 'weekly')
        return 'Weekly (every 7 d)';
    return 'Run once now';
}
// ── Elapsed ticker ─────────────────────────────────────────────────────────────
function ElapsedTimer({ startMs }) {
    const [elapsed, setElapsed] = useState(() => fmtElapsed(startMs));
    useEffect(() => {
        const id = setInterval(() => setElapsed(fmtElapsed(startMs)), 1000);
        return () => clearInterval(id);
    }, [startMs]);
    return _jsx(_Fragment, { children: elapsed });
}
// ── Project selector ──────────────────────────────────────────────────────────
function ProjectPills({ selected, onChange, }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/dashboard/projects', { signal: controller.signal, headers: API_HEADERS })
            .then((r) => r.json())
            .then((keys) => { setProjects(keys); setLoading(false); })
            .catch(() => setLoading(false));
        return () => controller.abort();
    }, []);
    if (loading)
        return _jsx("span", { className: "repo-picker__loading", children: "Loading projects\u2026" });
    return (_jsx("div", { className: "repo-picker__tag-list", style: { marginBottom: '0.75rem' }, children: projects.map((key) => (_jsx("button", { type: "button", onClick: () => onChange(selected === key ? '' : key), className: `repo-picker__tag${selected === key ? ' repo-picker__tag--active' : ''}`, children: key }, key))) }));
}
// ── Run history row ───────────────────────────────────────────────────────────
function LogRow({ log }) {
    const [expanded, setExpanded] = useState(false);
    const okBatches = log.batches.filter((b) => b.status === 'ok').length;
    const hasErrors = log.batches.some((b) => b.status === 'error');
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: `sync-log-row sync-log-row--${hasErrors ? 'error' : 'ok'}`, onClick: () => setExpanded((v) => !v), style: { cursor: 'pointer' }, children: [_jsx("td", { className: "sync-logs-table__td", children: fmtDate(log.startedAt) }), _jsx("td", { className: "sync-logs-table__td", children: log.totalUsers }), _jsx("td", { className: "sync-logs-table__td", children: fmtDuration(log.durationMs) }), _jsxs("td", { className: "sync-logs-table__td", children: [okBatches, "/", log.batches.length] }), _jsx("td", { className: "sync-logs-table__td", children: _jsx("span", { className: `sync-status-badge sync-status-badge--${hasErrors ? 'error' : 'ok'}`, children: hasErrors ? 'Partial error' : 'OK' }) }), _jsx("td", { className: "sync-logs-table__td sync-logs-table__expand", children: expanded ? '▲' : '▼' })] }), expanded && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 0 }, children: _jsx("div", { className: "sync-log-detail", children: _jsxs("table", { className: "sync-log-detail__table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Batch" }), _jsx("th", { children: "Users" }), _jsx("th", { children: "Duration" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Error" })] }) }), _jsx("tbody", { children: log.batches.map((b) => (_jsxs("tr", { className: `sync-log-row--${b.status}`, children: [_jsx("td", { children: b.batchIndex + 1 }), _jsx("td", { children: b.userIds.join(', ') }), _jsx("td", { children: fmtDuration(b.durationMs) }), _jsx("td", { children: _jsx("span", { className: `sync-status-badge sync-status-badge--${b.status}`, children: b.status }) }), _jsx("td", { children: b.error ?? '—' })] }, b.batchIndex))) })] }) }) }) }))] }));
}
// ── Cache coverage card ───────────────────────────────────────────────────────
function CacheCoverageCard({ coverage }) {
    if (!coverage)
        return _jsx(Skeleton, { width: "100%", height: "2.5rem" });
    if (coverage.configuredUsers === 0) {
        return _jsx("p", { className: "sync-user-area__hint", children: "No users configured." });
    }
    const uncached = coverage.uncachedUsers;
    const shown = uncached.slice(0, 5);
    const overflow = uncached.length - shown.length;
    return (_jsxs("div", { className: "sync-coverage-card", children: [_jsxs("span", { className: "sync-coverage-card__ratio", children: [_jsx("strong", { children: coverage.cachedUsers }), " / ", coverage.configuredUsers, " users cached"] }), uncached.length > 0 && (_jsxs("span", { className: "sync-coverage-card__missing", children: [' ', "\u2014 needs warming: ", shown.join(', '), overflow > 0 ? ` +${overflow} more` : ''] }))] }));
}
// ── Main component ────────────────────────────────────────────────────────────
export function SyncPage() {
    const { state, setMode, setSelectedUsers, setSelectedProject, setScheduleOption, setScheduledTime, setPurgeLogsOnRun, setConfirmed, saveAndRun, warmupMissing, refreshStatus, } = useSync();
    const { status, logs, coverage, mode, selectedUsers, selectedProject, scheduleOption, scheduledTime, purgeLogsOnRun, confirmed, isLoadingStatus, isLoadingLogs, isSaving, isWarmingUp, error, } = state;
    const isRunning = status?.running ?? false;
    // ── All-users mode ────────────────────────────────────────────────────────
    const [allUsers, setAllUsers] = useState([]);
    const [allUsersLoading, setAllUsersLoading] = useState(false);
    const loadAllUsers = useCallback(() => {
        if (allUsers.length > 0)
            return;
        setAllUsersLoading(true);
        fetch('/api/dashboard/users', { headers: API_HEADERS })
            .then((r) => r.json())
            .then((users) => {
            setAllUsers(users);
            setAllUsersLoading(false);
            setSelectedUsers(users.map((u) => u.name));
        })
            .catch(() => setAllUsersLoading(false));
    }, [allUsers.length, setSelectedUsers]);
    useEffect(() => {
        if (mode === 'all')
            loadAllUsers();
    }, [mode, loadAllUsers]);
    // ── By-project mode ───────────────────────────────────────────────────────
    const [projectUsers, setProjectUsers] = useState([]);
    useEffect(() => {
        if (mode !== 'by-project' || !selectedProject) {
            setProjectUsers([]);
            return;
        }
        fetch('/api/dashboard/users', { headers: API_HEADERS })
            .then((r) => r.json())
            .then(setProjectUsers)
            .catch(() => { });
    }, [mode, selectedProject]);
    // canRun: confirmed summary, not already saving or running
    const canRun = confirmed && !isSaving && !isRunning;
    // Date range the job will use (last 90 days)
    const jobEndDate = new Date().toISOString().slice(0, 10);
    const jobStartDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        return d.toISOString().slice(0, 10);
    })();
    return (_jsxs("div", { className: "sync-page", children: [_jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Sync Job Status" }), _jsx("div", { className: "sync-status-card", children: isLoadingStatus ? (_jsx(Skeleton, { width: "60%", height: "1rem" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "sync-status-card__row", children: [_jsx("span", { className: `sync-badge sync-badge--${isRunning ? 'running' : 'idle'}`, children: isRunning ? 'Running' : 'Idle' }), _jsxs("span", { className: "sync-status-card__meta", children: ["Last run: ", _jsx("strong", { children: fmtDate(status?.lastRunAt ?? null) })] }), _jsxs("span", { className: "sync-status-card__meta", children: ["Next: ", _jsx("strong", { children: fmtRelative(status?.nextRunAt ?? null) })] })] }), _jsxs("div", { className: "sync-status-card__users", children: [status?.configuredUsers.length ?? 0, " users configured", status && status.intervalMinutes > 0 && (_jsxs("span", { className: "sync-status-card__interval", children: ["\u2014 ", status.intervalMinutes === 1440 ? 'Daily' : 'Weekly', status.scheduledTime && ` at ${status.scheduledTime}`] }))] })] })) })] }), _jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Cache Coverage" }), _jsx(CacheCoverageCard, { coverage: coverage }), coverage && coverage.configuredUsers > 0 && (_jsx("button", { type: "button", className: `btn btn--secondary sync-warmup-btn${(isRunning || (coverage.uncachedUsers.length === 0 && coverage.staleUsers.length === 0) || isWarmingUp) ? ' btn--disabled' : ''}`, disabled: isRunning || (coverage.uncachedUsers.length === 0 && coverage.staleUsers.length === 0) || isWarmingUp, onClick: (!isRunning && (coverage.uncachedUsers.length > 0 || coverage.staleUsers.length > 0) && !isWarmingUp) ? () => { void warmupMissing(); } : undefined, title: isRunning ? 'A sync is already running' :
                            isWarmingUp ? 'Warm-up in progress…' :
                                (coverage.uncachedUsers.length === 0 && coverage.staleUsers.length === 0) ? 'All users are cached' :
                                    undefined, children: isWarmingUp ? 'Warming up…' : 'Warm Missing Cache' }))] }), isRunning && status && (_jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Progress" }), _jsxs("div", { className: "sync-progress-card", children: [_jsxs("div", { className: "sync-progress-card__header", children: [_jsx("span", { className: "sync-badge sync-badge--running", children: "Running" }), _jsxs("span", { className: "sync-progress-card__elapsed", children: ["Elapsed:", ' ', _jsx("strong", { children: status.runStartedAt ? _jsx(ElapsedTimer, { startMs: status.runStartedAt }) : '—' })] }), _jsx("button", { className: "sync-progress-card__refresh-btn", onClick: () => { void refreshStatus(); }, title: "Refresh status", children: "\u21BB Refresh" })] }), status.totalSyncUsers > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "sync-progress-bar__track", children: _jsx("div", { className: "sync-progress-bar__fill", style: {
                                                width: `${Math.round((status.completedUsers.length / status.totalSyncUsers) * 100)}%`,
                                            } }) }), _jsxs("div", { className: "sync-progress-card__counter", children: [_jsx("span", { className: "sync-progress-card__done", children: status.completedUsers.length }), status.failedUsers.length > 0 && (_jsxs("span", { className: "sync-progress-card__failed", children: [" + ", status.failedUsers.length, " failed"] })), _jsxs("span", { className: "sync-progress-card__total", children: [" of ", status.totalSyncUsers, " users completed"] }), status.activeUsers.length > 0 && (_jsxs("span", { className: "sync-progress-card__current", children: ["\u00A0\u2014 ", _jsx("strong", { children: status.activeUsers.length }), " in progress"] }))] }), (status.completedUsers.length > 0 || status.failedUsers.length > 0 || status.activeUsers.length > 0) && (_jsxs("div", { className: "sync-progress-card__chips", children: [status.activeUsers.map((u) => (_jsxs("span", { className: "sync-progress-chip sync-progress-chip--active", children: ["\u25B6 ", u] }, u))), status.failedUsers.map((u) => (_jsx("span", { className: "sync-progress-chip sync-progress-chip--failed", children: u }, u))), status.completedUsers.map((u) => (_jsx("span", { className: "sync-progress-chip sync-progress-chip--done", children: u }, u)))] }))] })), _jsx("div", { className: "sync-progress-card__hint", children: "Refreshes every 5 s. Run History updates when complete." })] })] })), _jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Select Users to Sync" }), _jsx("div", { className: "sync-mode-tabs", children: ['all', 'by-project', 'manual'].map((m) => (_jsx("button", { type: "button", onClick: () => setMode(m), className: `sync-mode-tab${mode === m ? ' sync-mode-tab--active' : ''}`, children: m === 'all' ? 'All users' : m === 'by-project' ? 'By project' : 'Select manually' }, m))) }), _jsxs("div", { className: "sync-user-area", children: [mode === 'all' && (allUsersLoading
                                ? _jsx(Skeleton, { width: "100%", height: "2rem" })
                                : _jsx("p", { className: "sync-user-area__hint", children: selectedUsers.length > 0
                                        ? `${selectedUsers.length} users selected (all Bitbucket users)`
                                        : 'Loading users…' })), mode === 'by-project' && (_jsxs(_Fragment, { children: [_jsx(ProjectPills, { selected: selectedProject, onChange: setSelectedProject }), selectedProject && (projectUsers.length > 0
                                        ? _jsx(UserPicker, { selectedUsers: selectedUsers, onChange: setSelectedUsers })
                                        : _jsx(Skeleton, { width: "100%", height: "2rem" }))] })), mode === 'manual' && (_jsx(UserPicker, { selectedUsers: selectedUsers, onChange: setSelectedUsers }))] }), selectedUsers.length > 0 && mode !== 'all' && (_jsxs("p", { className: "sync-user-area__count", children: [selectedUsers.length, " users selected"] }))] }), _jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Schedule" }), _jsx("div", { className: "sync-schedule", children: [
                            ['now', 'Run once now'],
                            ['daily', 'Daily (every 24 h)'],
                            ['weekly', 'Weekly (every 7 d)'],
                        ].map(([value, label]) => (_jsxs("label", { className: "sync-schedule__option", children: [_jsx("input", { type: "radio", name: "schedule", value: value, checked: scheduleOption === value, onChange: () => setScheduleOption(value) }), label] }, value))) }), scheduleOption !== 'now' && (_jsxs("div", { className: "sync-schedule__time-row", children: [_jsx("label", { className: "sync-schedule__time-label", htmlFor: "sync-scheduled-time", children: "Run at (local time):" }), _jsx("input", { id: "sync-scheduled-time", type: "time", className: "sync-schedule__time-input", value: scheduledTime, onChange: (e) => setScheduledTime(e.target.value), placeholder: "HH:MM" }), _jsx("span", { className: "sync-schedule__time-hint", children: scheduledTime
                                    ? `First run at ${scheduledTime} local time`
                                    : 'Leave blank to run immediately then repeat on interval' })] }))] }), selectedUsers.length > 0 && (_jsxs("section", { className: "sync-page__section", children: [_jsx("div", { className: "sync-page__section-title", children: "Job Summary" }), _jsxs("div", { className: "sync-summary-card", children: [_jsxs("div", { className: "sync-summary-card__row", children: [_jsx("span", { className: "sync-summary-card__label", children: "Users" }), _jsxs("span", { className: "sync-summary-card__value", children: [selectedUsers.length, " user", selectedUsers.length !== 1 ? 's' : '', selectedUsers.length <= 10 && (_jsxs("span", { className: "sync-summary-card__names", children: [" (", selectedUsers.join(', '), ")"] }))] })] }), _jsxs("div", { className: "sync-summary-card__row", children: [_jsx("span", { className: "sync-summary-card__label", children: "Date range" }), _jsxs("span", { className: "sync-summary-card__value", children: [jobStartDate, " \u2192 ", jobEndDate, " ", _jsx("span", { className: "sync-summary-card__hint", children: "(last 90 days)" })] })] }), _jsxs("div", { className: "sync-summary-card__row", children: [_jsx("span", { className: "sync-summary-card__label", children: "Schedule" }), _jsxs("span", { className: "sync-summary-card__value", children: [scheduleLabel(scheduleOption), scheduleOption !== 'now' && scheduledTime && ` — first run at ${scheduledTime} local time`, scheduleOption !== 'now' && !scheduledTime && ' — starts immediately'] })] }), _jsxs("div", { className: "sync-summary-card__row", children: [_jsx("span", { className: "sync-summary-card__label", children: "Processing" }), _jsxs("span", { className: "sync-summary-card__value", children: ["1 user at a time, sequentially (", Math.ceil(selectedUsers.length / 10), " group", Math.ceil(selectedUsers.length / 10) !== 1 ? 's' : '', " of up to 10)"] })] }), purgeLogsOnRun && (_jsxs("div", { className: "sync-summary-card__row sync-summary-card__row--warn", children: [_jsx("span", { className: "sync-summary-card__label", children: "Warning" }), _jsx("span", { className: "sync-summary-card__value", children: "Run logs will be purged before starting" })] })), !confirmed && (_jsx("button", { type: "button", className: "btn btn--secondary sync-confirm-btn", onClick: () => setConfirmed(true), children: "Confirm & enable Run" })), confirmed && (_jsx("div", { className: "sync-summary-card__confirmed", children: "\u2713 Parameters confirmed \u2014 click Save & Run below" }))] })] })), _jsxs("section", { className: "sync-page__section sync-page__section--actions", children: [_jsxs("label", { className: "sync-purge-row", children: [_jsx("input", { type: "checkbox", checked: purgeLogsOnRun, onChange: (e) => setPurgeLogsOnRun(e.target.checked) }), "Purge run logs before starting"] }), error && (_jsx("div", { className: "dashboard__error", role: "alert", children: error })), isRunning && (_jsx("div", { className: "sync-running-notice", role: "status", children: "A sync is already running \u2014 wait for it to finish before starting a new one." })), _jsx("button", { type: "button", className: `btn btn--primary sync-run-btn${!canRun ? ' btn--disabled' : ''}`, onClick: canRun ? saveAndRun : undefined, disabled: !canRun, title: isRunning ? 'A sync is already in progress' :
                            !selectedUsers.length ? 'Select at least one user' :
                                !confirmed ? 'Review the Job Summary above and click Confirm first' :
                                    undefined, children: isSaving ? 'Starting…' : 'Save & Run' }), !confirmed && selectedUsers.length > 0 && !isRunning && (_jsx("p", { className: "sync-run-hint", children: "Review the Job Summary above and click Confirm to enable this button." }))] }), _jsxs("section", { className: "sync-page__section", children: [_jsxs("div", { className: "sync-page__section-title", children: ["Run History", _jsx("span", { className: "sync-page__section-count", children: "(last 50 runs)" })] }), isLoadingLogs ? (_jsx(Skeleton, { width: "100%", height: "6rem" })) : logs.length === 0 ? (_jsx("p", { className: "sync-logs-empty", children: "No runs recorded yet." })) : (_jsx("div", { className: "sync-logs-table__wrap", children: _jsxs("table", { className: "sync-logs-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "sync-logs-table__th", children: "Date" }), _jsx("th", { className: "sync-logs-table__th", children: "Users" }), _jsx("th", { className: "sync-logs-table__th", children: "Duration" }), _jsx("th", { className: "sync-logs-table__th", children: "Batches" }), _jsx("th", { className: "sync-logs-table__th", children: "Status" }), _jsx("th", { className: "sync-logs-table__th" })] }) }), _jsx("tbody", { children: logs.map((log) => (_jsx(LogRow, { log: log }, log.runId))) })] }) }))] })] }));
}
