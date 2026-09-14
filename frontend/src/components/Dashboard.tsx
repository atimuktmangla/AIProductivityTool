import { useState, type MouseEvent } from 'react';
import { useDashboard } from '../hooks/useDashboard.js';
import { FilterPanel } from './FilterPanel.js';
import { SelectionSummary } from './SelectionSummary.js';
import { ThroughputOverview } from './ThroughputOverview.js';
import { WorkflowCycleTrack } from './WorkflowCycleTrack.js';
import { WorkTypeChart } from './WorkTypeChart.js';
import { ContributorTable } from './ContributorTable.js';
import { ContributorDrawer } from './ContributorDrawer.js';
import { CodeQualityPanel } from './CodeQualityPanel.js';
import { WelcomePanel } from './WelcomePanel.js';
import { InsightsPanel } from './InsightsPanel.js';
import type { AggregatedDeveloperMetric } from '../types/index.js';

function fmtCachedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function Dashboard() {
  const {
    state,
    setSelectedUsers, setSelectedRepoTargets, setSelectedProjects,
    setStartDate, setEndDate, setDatePreset, fetchMetrics,
    restoreSession, dismissSession,
  } = useDashboard();

  const {
    isLoading, errorMessage, dashboardData,
    selectedUsers, selectedRepoTargets, selectedProjects,
    startDate, endDate, savedSession,
  } = state;

  const currentData  = dashboardData?.current  ?? [];
  const previousData = dashboardData?.previous;
  const cacheStatus  = dashboardData?.cacheStatus;
  const cachedAt     = dashboardData?.cachedAt;

  const [selectedDeveloper, setSelectedDeveloper] = useState<AggregatedDeveloperMetric | null>(null);

  const handleSubmit = (_e: MouseEvent<HTMLButtonElement>) => {
    void fetchMetrics();
  };

  const showMetrics = isLoading || dashboardData !== null;

  return (
    <div className="dashboard">
      <FilterPanel
        selectedUsers={selectedUsers}
        selectedRepoTargets={selectedRepoTargets}
        selectedProjects={selectedProjects}
        startDate={startDate}
        endDate={endDate}
        isLoading={isLoading}
        savedSession={savedSession}
        onUsersChange={setSelectedUsers}
        onRepoTargetsChange={setSelectedRepoTargets}
        onProjectsChange={setSelectedProjects}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
        onPreset={setDatePreset}
        onSubmit={handleSubmit}
        onRestoreSession={restoreSession}
        onDismissSession={dismissSession}
      />

      <main className="dashboard__main">
        <SelectionSummary
          selectedUsers={selectedUsers}
          selectedRepoTargets={selectedRepoTargets}
          selectedProjects={selectedProjects}
          startDate={startDate}
          endDate={endDate}
        />
        {errorMessage && (
          <div className="dashboard__error" role="alert">
            {errorMessage}
          </div>
        )}

        {cacheStatus && cacheStatus !== 'none' && !isLoading && (
          <div className="cache-banner" role="status">
            <span className="cache-banner__icon">&#9889;</span>
            <span className="cache-banner__text">
              {cacheStatus === 'full'
                ? 'Served from sync cache'
                : 'Partial cache hit — some developers loaded live'}
              {cachedAt ? ` · synced ${fmtCachedAt(cachedAt)}` : ''}
            </span>
            <a className="cache-banner__link" href="#" onClick={(e) => {
              e.preventDefault();
              // Signal parent to switch to sync tab — handled via window event
              window.dispatchEvent(new CustomEvent('navigate-to-sync'));
            }}>
              Manage sync jobs &#8594;
            </a>
          </div>
        )}

        {!showMetrics && !errorMessage && <WelcomePanel />}

        {showMetrics && (
          <div className="dashboard__grid">
            {dashboardData?.insights && (
              <InsightsPanel insights={dashboardData.insights} />
            )}
            <ThroughputOverview data={currentData} previousData={previousData} isLoading={isLoading} />
            <WorkflowCycleTrack data={currentData} isLoading={isLoading} />
            <CodeQualityPanel   data={currentData} isLoading={isLoading} />
            <WorkTypeChart      data={currentData} isLoading={isLoading} />
            <ContributorTable   data={currentData} isLoading={isLoading} onSelect={setSelectedDeveloper} />
          </div>
        )}
      </main>

      <ContributorDrawer
        metric={selectedDeveloper}
        onClose={() => setSelectedDeveloper(null)}
      />
    </div>
  );
}
