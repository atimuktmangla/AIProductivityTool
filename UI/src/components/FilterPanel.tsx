import type { MouseEvent } from 'react';
import { UserPicker } from './UserPicker.js';
import { DateRangePicker } from './DateRangePicker.js';
import { RepoPicker } from './RepoPicker.js';
import { SessionRestoreBanner } from './SessionRestoreBanner.js';
import type { RepoTarget, SavedSession } from '../types/index.js';

interface FilterPanelProps {
  selectedUsers:       string[];
  selectedRepoTargets: RepoTarget[];
  selectedProjects:    string[];
  startDate:           string;
  endDate:             string;
  isLoading:           boolean;
  savedSession:        SavedSession | null;
  onUsersChange:       (users: string[]) => void;
  onRepoTargetsChange: (targets: RepoTarget[]) => void;
  onProjectsChange:    (keys: string[]) => void;
  onStartChange:       (date: string) => void;
  onEndChange:         (date: string) => void;
  onPreset:            (preset: 'last30' | 'currentQuarter' | 'last90') => void;
  onSubmit:            (e: MouseEvent<HTMLButtonElement>) => void;
  onRestoreSession:    (s: SavedSession) => void;
  onDismissSession:    () => void;
}

export function FilterPanel({
  selectedUsers,
  selectedRepoTargets,
  selectedProjects,
  startDate,
  endDate,
  isLoading,
  savedSession,
  onUsersChange,
  onRepoTargetsChange,
  onProjectsChange,
  onStartChange,
  onEndChange,
  onPreset,
  onSubmit,
  onRestoreSession,
  onDismissSession,
}: FilterPanelProps) {
  const canSubmit = selectedUsers.length > 0 && !isLoading;

  return (
    <aside className="filter-panel">
      {savedSession && (
        <SessionRestoreBanner
          session={savedSession}
          onRestore={onRestoreSession}
          onDismiss={onDismissSession}
        />
      )}

      <h1 className="filter-panel__title">Developer Metrics</h1>

      <section className="filter-panel__section">
        <h2 className="filter-panel__section-title">Team members</h2>
        <UserPicker selectedUsers={selectedUsers} onChange={onUsersChange} />
      </section>

      <section className="filter-panel__section">
        <h2 className="filter-panel__section-title">Projects &amp; Repos</h2>
        <RepoPicker
          selectedRepoTargets={selectedRepoTargets}
          selectedProjects={selectedProjects}
          onRepoTargetsChange={onRepoTargetsChange}
          onProjectsChange={onProjectsChange}
        />
      </section>

      <section className="filter-panel__section">
        <h2 className="filter-panel__section-title">Date range</h2>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={onStartChange}
          onEndChange={onEndChange}
          onPreset={onPreset}
        />
      </section>

      <button
        type="button"
        className={`btn btn--primary filter-panel__submit${!canSubmit ? ' btn--disabled' : ''}`}
        disabled={!canSubmit}
        onClick={onSubmit}
        aria-busy={isLoading}
      >
        {isLoading ? 'Loading…' : 'Run report'}
      </button>
    </aside>
  );
}
