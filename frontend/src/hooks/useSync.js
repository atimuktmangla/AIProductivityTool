import { useReducer, useCallback, useEffect, useRef } from 'react';
const API_HEADERS = {
    'Content-Type': 'application/json',
    'X-Api-Key': import.meta.env.VITE_API_KEY,
};
const initialState = {
    status: null,
    config: null,
    logs: [],
    coverage: null,
    mode: 'all',
    selectedUsers: [],
    selectedProject: '',
    scheduleOption: 'now',
    scheduledTime: '',
    purgeLogsOnRun: false,
    confirmed: false,
    isLoadingStatus: true,
    isLoadingLogs: true,
    isSaving: false,
    isWarmingUp: false,
    error: null,
};
function reducer(state, action) {
    switch (action.type) {
        case 'SET_STATUS': return { ...state, status: action.payload, isLoadingStatus: false };
        case 'SET_CONFIG': return { ...state, config: action.payload };
        case 'SET_LOGS': return { ...state, logs: action.payload, isLoadingLogs: false };
        case 'SET_COVERAGE': return { ...state, coverage: action.payload };
        case 'SET_MODE': return { ...state, mode: action.payload, selectedUsers: [], selectedProject: '', confirmed: false };
        case 'SET_SELECTED_USERS': return { ...state, selectedUsers: action.payload, confirmed: false };
        case 'SET_PROJECT': return { ...state, selectedProject: action.payload, confirmed: false };
        case 'SET_SCHEDULE': return { ...state, scheduleOption: action.payload, confirmed: false };
        case 'SET_SCHEDULED_TIME': return { ...state, scheduledTime: action.payload, confirmed: false };
        case 'SET_PURGE': return { ...state, purgeLogsOnRun: action.payload };
        case 'SET_CONFIRMED': return { ...state, confirmed: action.payload };
        case 'SAVE_START': return { ...state, isSaving: true, error: null };
        case 'SAVE_DONE': return { ...state, isSaving: false, confirmed: false };
        case 'WARMUP_START': return { ...state, isWarmingUp: true, error: null };
        case 'WARMUP_DONE': return { ...state, isWarmingUp: false };
        case 'SET_ERROR': return { ...state, error: action.payload, isSaving: false, isWarmingUp: false };
        case 'STATUS_LOADED': return { ...state, isLoadingStatus: false };
        case 'LOGS_LOADED': return { ...state, isLoadingLogs: false };
    }
}
// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(url, init) {
    const res = await fetch(url, { ...init, headers: { ...API_HEADERS, ...init?.headers } });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSync() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const pollRef = useRef(null);
    const fetchStatus = useCallback(async () => {
        try {
            const status = await apiFetch('/api/dashboard/sync/status');
            dispatch({ type: 'SET_STATUS', payload: status });
        }
        catch (e) {
            dispatch({ type: 'STATUS_LOADED' });
        }
    }, []);
    const fetchLogs = useCallback(async () => {
        try {
            const logs = await apiFetch('/api/dashboard/sync/logs');
            dispatch({ type: 'SET_LOGS', payload: logs });
        }
        catch {
            dispatch({ type: 'LOGS_LOADED' });
        }
    }, []);
    const fetchConfig = useCallback(async () => {
        try {
            const config = await apiFetch('/api/dashboard/sync/config');
            dispatch({ type: 'SET_CONFIG', payload: config });
        }
        catch {
            // non-fatal
        }
    }, []);
    const fetchCoverage = useCallback(async () => {
        try {
            const coverage = await apiFetch('/api/dashboard/sync/cache-coverage');
            dispatch({ type: 'SET_COVERAGE', payload: coverage });
        }
        catch {
            // non-fatal — coverage card stays in skeleton state
        }
    }, []);
    // Initial load
    useEffect(() => {
        fetchStatus();
        fetchLogs();
        fetchConfig();
        fetchCoverage();
    }, [fetchStatus, fetchLogs, fetchConfig, fetchCoverage]);
    // Adaptive polling: 5 s while running, 30 s while idle
    useEffect(() => {
        const interval = state.status?.running ? 5000 : 30000;
        if (pollRef.current)
            clearInterval(pollRef.current);
        pollRef.current = setInterval(() => {
            fetchStatus();
            fetchLogs();
            fetchCoverage();
        }, interval);
        return () => {
            if (pollRef.current)
                clearInterval(pollRef.current);
        };
    }, [state.status?.running, fetchStatus, fetchLogs, fetchCoverage]);
    const setMode = useCallback((mode) => {
        dispatch({ type: 'SET_MODE', payload: mode });
    }, []);
    const setSelectedUsers = useCallback((users) => {
        dispatch({ type: 'SET_SELECTED_USERS', payload: users });
    }, []);
    const setSelectedProject = useCallback((project) => {
        dispatch({ type: 'SET_PROJECT', payload: project });
    }, []);
    const setScheduleOption = useCallback((opt) => {
        dispatch({ type: 'SET_SCHEDULE', payload: opt });
    }, []);
    const setScheduledTime = useCallback((time) => {
        dispatch({ type: 'SET_SCHEDULED_TIME', payload: time });
    }, []);
    const setPurgeLogsOnRun = useCallback((val) => {
        dispatch({ type: 'SET_PURGE', payload: val });
    }, []);
    const setConfirmed = useCallback((val) => {
        dispatch({ type: 'SET_CONFIRMED', payload: val });
    }, []);
    const saveAndRun = useCallback(async () => {
        const { selectedUsers, scheduleOption, scheduledTime, purgeLogsOnRun } = state;
        if (selectedUsers.length === 0) {
            dispatch({ type: 'SET_ERROR', payload: 'Select at least one user before running.' });
            return;
        }
        dispatch({ type: 'SAVE_START' });
        try {
            if (purgeLogsOnRun) {
                await apiFetch('/api/dashboard/sync/logs', { method: 'DELETE' });
            }
            if (scheduleOption === 'daily' || scheduleOption === 'weekly') {
                const intervalMinutes = scheduleOption === 'daily' ? 1440 : 10080;
                const body = { developerIds: selectedUsers, intervalMinutes };
                if (scheduledTime)
                    body.scheduledTime = scheduledTime;
                await apiFetch('/api/dashboard/sync/config', {
                    method: 'POST',
                    body: JSON.stringify(body),
                });
            }
            await apiFetch('/api/dashboard/sync/trigger', {
                method: 'POST',
                body: JSON.stringify({ developerIds: selectedUsers }),
            });
            dispatch({ type: 'SAVE_DONE' });
            // Immediately refresh status so the badge updates
            await fetchStatus();
            await fetchLogs();
        }
        catch (e) {
            dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'Failed to start sync' });
        }
    }, [state, fetchStatus, fetchLogs]);
    const warmupMissing = useCallback(async () => {
        dispatch({ type: 'WARMUP_START' });
        try {
            await apiFetch('/api/dashboard/sync/warmup', { method: 'POST', body: '{}' });
            await fetchStatus();
            await fetchCoverage();
        }
        catch (e) {
            dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'Warm-up failed' });
        }
        finally {
            dispatch({ type: 'WARMUP_DONE' });
        }
    }, [fetchStatus, fetchCoverage]);
    return {
        state,
        setMode,
        setSelectedUsers,
        setSelectedProject,
        setScheduleOption,
        setScheduledTime,
        setPurgeLogsOnRun,
        setConfirmed,
        saveAndRun,
        warmupMissing,
        refreshStatus: fetchStatus,
        refreshLogs: fetchLogs,
    };
}
