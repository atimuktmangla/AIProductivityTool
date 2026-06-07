import { useReducer, useCallback, useRef } from 'react';
import type { DashboardState, MetricsResult, RepoTarget, SavedSession } from '../types/index.js';

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'apt:last-session';

function readSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' || parsed === null ||
      !Array.isArray((parsed as SavedSession).users)
    ) return null;
    return parsed as SavedSession;
  } catch {
    return null;
  }
}

function writeSavedSession(s: SavedSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function clearSavedSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
}

// ─── State ───────────────────────────────────────────────────────────────────

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(today.getDate() - 30);

const fmt = (d: Date): string => d.toISOString().slice(0, 10);

function readInitialStateFromUrl(): Partial<DashboardState> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const devsParam  = params.get('devs');
  const startParam = params.get('start');
  const endParam   = params.get('end');
  return {
    selectedUsers: devsParam ? devsParam.split(',').filter(Boolean) : undefined,
    startDate:     startParam ?? undefined,
    endDate:       endParam   ?? undefined,
  };
}

const urlOverrides = readInitialStateFromUrl();
const hasUrlParams = !!(urlOverrides.selectedUsers?.length || urlOverrides.startDate);

// Only offer the restore banner when there are no URL params driving the state
const initialSavedSession: SavedSession | null = hasUrlParams ? null : readSavedSession();

const initialState: DashboardState = {
  selectedUsers:       urlOverrides.selectedUsers ?? [],
  selectedRepoTargets: [],
  selectedProjects:    [],
  startDate:           urlOverrides.startDate     ?? fmt(thirtyDaysAgo),
  endDate:             urlOverrides.endDate        ?? fmt(today),
  compareStartDate:    '',
  compareEndDate:      '',
  dashboardData:       null,
  isLoading:           false,
  errorMessage:        null,
  savedSession:        initialSavedSession,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_USERS';               payload: string[] }
  | { type: 'SET_REPO_TARGETS';        payload: RepoTarget[] }
  | { type: 'SET_PROJECTS';            payload: string[] }
  | { type: 'SET_START_DATE';          payload: string }
  | { type: 'SET_END_DATE';            payload: string }
  | { type: 'SET_COMPARE_START_DATE';  payload: string }
  | { type: 'SET_COMPARE_END_DATE';    payload: string }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS';           payload: MetricsResult }
  | { type: 'FETCH_ERROR';             payload: string }
  | { type: 'RESTORE_SESSION';         payload: SavedSession }
  | { type: 'DISMISS_SESSION' };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'SET_USERS':
      return { ...state, selectedUsers: action.payload };
    case 'SET_REPO_TARGETS':
      return { ...state, selectedRepoTargets: action.payload };
    case 'SET_PROJECTS':
      // Selecting projects is Tier 2 — clear any Tier 1 chips to keep tiers mutually exclusive.
      return { ...state, selectedProjects: action.payload, selectedRepoTargets: [] };
    case 'SET_START_DATE':
      return { ...state, startDate: action.payload };
    case 'SET_END_DATE':
      return { ...state, endDate: action.payload };
    case 'SET_COMPARE_START_DATE':
      return { ...state, compareStartDate: action.payload };
    case 'SET_COMPARE_END_DATE':
      return { ...state, compareEndDate: action.payload };
    case 'FETCH_START':
      return { ...state, isLoading: true, errorMessage: null };
    case 'FETCH_SUCCESS': {
      const params = new URLSearchParams();
      if (state.selectedUsers.length > 0) params.set('devs', state.selectedUsers.join(','));
      params.set('start', state.startDate);
      params.set('end',   state.endDate);
      window.history.replaceState(null, '', `?${params.toString()}`);
      writeSavedSession({
        users:       state.selectedUsers,
        repoTargets: state.selectedRepoTargets,
        projects:    state.selectedProjects,
        startDate:   state.startDate,
        endDate:     state.endDate,
      });
      return { ...state, isLoading: false, dashboardData: action.payload, savedSession: null };
    }
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, errorMessage: action.payload };
    case 'RESTORE_SESSION':
      return {
        ...state,
        selectedUsers:       action.payload.users,
        selectedRepoTargets: action.payload.repoTargets,
        selectedProjects:    action.payload.projects,
        startDate:           action.payload.startDate,
        endDate:             action.payload.endDate,
        savedSession:        null,
      };
    case 'DISMISS_SESSION':
      clearSavedSession();
      return { ...state, savedSession: null };
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDashboard() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const setSelectedUsers = useCallback((users: string[]) => {
    dispatch({ type: 'SET_USERS', payload: users });
  }, []);

  // Tier 1: full [projectKey, repoSlug] pairs — clears project pills
  const setSelectedRepoTargets = useCallback((targets: RepoTarget[]) => {
    dispatch({ type: 'SET_REPO_TARGETS', payload: targets });
  }, []);

  // Tier 2: project keys only — clears repo chips
  const setSelectedProjects = useCallback((keys: string[]) => {
    dispatch({ type: 'SET_PROJECTS', payload: keys });
  }, []);

  const setStartDate = useCallback((date: string) => {
    dispatch({ type: 'SET_START_DATE', payload: date });
  }, []);

  const setEndDate = useCallback((date: string) => {
    dispatch({ type: 'SET_END_DATE', payload: date });
  }, []);

  const setCompareStartDate = useCallback((date: string) => {
    dispatch({ type: 'SET_COMPARE_START_DATE', payload: date });
  }, []);

  const setCompareEndDate = useCallback((date: string) => {
    dispatch({ type: 'SET_COMPARE_END_DATE', payload: date });
  }, []);

  const restoreSession = useCallback((saved: SavedSession) => {
    dispatch({ type: 'RESTORE_SESSION', payload: saved });
  }, []);

  const dismissSession = useCallback(() => {
    dispatch({ type: 'DISMISS_SESSION' });
  }, []);

  const fetchMetrics = useCallback(async () => {
    if (state.selectedUsers.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: 'FETCH_START' });
    try {
      const body: Record<string, unknown> = {
        developerIds: state.selectedUsers,
        startDate:    state.startDate,
        endDate:      state.endDate,
      };

      // Tier 1 takes priority; only send one tier at a time
      if (state.selectedRepoTargets.length > 0) {
        body.repoTargets = state.selectedRepoTargets;
      } else if (state.selectedProjects.length > 0) {
        body.projectKeys = state.selectedProjects;
      }
      // Tier 3: nothing extra sent — backend detects absence and uses profile API

      // Period-over-period: only include compare dates when both are set
      if (state.compareStartDate && state.compareEndDate) {
        body.compareStartDate = state.compareStartDate;
        body.compareEndDate   = state.compareEndDate;
      }

      const res = await fetch('/api/dashboard/metrics', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key':    import.meta.env.VITE_API_KEY as string,
        },
        signal:  controller.signal,
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const data = (await res.json()) as MetricsResult;
      dispatch({ type: 'FETCH_SUCCESS', payload: data });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      dispatch({ type: 'FETCH_ERROR', payload: e instanceof Error ? e.message : 'Unknown error' });
    }
  }, [state.selectedUsers, state.startDate, state.endDate, state.selectedRepoTargets, state.selectedProjects, state.compareStartDate, state.compareEndDate]);

  const setDatePreset = useCallback((preset: 'last30' | 'currentQuarter' | 'last90') => {
    const now = new Date();
    let start: Date;
    if (preset === 'last30') {
      start = new Date(now);
      start.setDate(now.getDate() - 30);
    } else if (preset === 'last90') {
      start = new Date(now);
      start.setDate(now.getDate() - 90);
    } else {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
    }
    dispatch({ type: 'SET_START_DATE', payload: fmt(start) });
    dispatch({ type: 'SET_END_DATE',   payload: fmt(now) });
  }, []);

  return {
    state,
    setSelectedUsers,
    setSelectedRepoTargets,
    setSelectedProjects,
    setStartDate,
    setEndDate,
    setCompareStartDate,
    setCompareEndDate,
    setDatePreset,
    fetchMetrics,
    restoreSession,
    dismissSession,
  };
}
