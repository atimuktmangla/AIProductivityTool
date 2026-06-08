import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
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
function fmtCachedAt(ms) {
    return new Date(ms).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}
export function Dashboard() {
    const { state, setSelectedUsers, setSelectedRepoTargets, setSelectedProjects, setStartDate, setEndDate, setDatePreset, fetchMetrics, restoreSession, dismissSession, } = useDashboard();
    const { isLoading, errorMessage, dashboardData, selectedUsers, selectedRepoTargets, selectedProjects, startDate, endDate, savedSession, } = state;
    const currentData = dashboardData?.current ?? [];
    const previousData = dashboardData?.previous;
    const cacheStatus = dashboardData?.cacheStatus;
    const cachedAt = dashboardData?.cachedAt;
    const [selectedDeveloper, setSelectedDeveloper] = useState(null);
    const handleSubmit = (_e) => {
        void fetchMetrics();
    };
    const showMetrics = isLoading || dashboardData !== null;
    return (_jsxs("div", { className: "dashboard", children: [_jsx(FilterPanel, { selectedUsers: selectedUsers, selectedRepoTargets: selectedRepoTargets, selectedProjects: selectedProjects, startDate: startDate, endDate: endDate, isLoading: isLoading, savedSession: savedSession, onUsersChange: setSelectedUsers, onRepoTargetsChange: setSelectedRepoTargets, onProjectsChange: setSelectedProjects, onStartChange: setStartDate, onEndChange: setEndDate, onPreset: setDatePreset, onSubmit: handleSubmit, onRestoreSession: restoreSession, onDismissSession: dismissSession }), _jsxs("main", { className: "dashboard__main", children: [_jsx(SelectionSummary, { selectedUsers: selectedUsers, selectedRepoTargets: selectedRepoTargets, selectedProjects: selectedProjects, startDate: startDate, endDate: endDate }), errorMessage && (_jsx("div", { className: "dashboard__error", role: "alert", children: errorMessage })), cacheStatus && cacheStatus !== 'none' && !isLoading && (_jsxs("div", { className: "cache-banner", role: "status", children: [_jsx("span", { className: "cache-banner__icon", children: "\u26A1" }), _jsxs("span", { className: "cache-banner__text", children: [cacheStatus === 'full'
                                        ? 'Served from sync cache'
                                        : 'Partial cache hit — some developers loaded live', cachedAt ? ` · synced ${fmtCachedAt(cachedAt)}` : ''] }), _jsx("a", { className: "cache-banner__link", href: "#", onClick: (e) => {
                                    e.preventDefault();
                                    // Signal parent to switch to sync tab — handled via window event
                                    window.dispatchEvent(new CustomEvent('navigate-to-sync'));
                                }, children: "Manage sync jobs \u2192" })] })), !showMetrics && !errorMessage && _jsx(WelcomePanel, {}), showMetrics && (_jsxs("div", { className: "dashboard__grid", children: [dashboardData?.insights && (_jsx(InsightsPanel, { insights: dashboardData.insights })), _jsx(ThroughputOverview, { data: currentData, previousData: previousData, isLoading: isLoading }), _jsx(WorkflowCycleTrack, { data: currentData, isLoading: isLoading }), _jsx(CodeQualityPanel, { data: currentData, isLoading: isLoading }), _jsx(WorkTypeChart, { data: currentData, isLoading: isLoading }), _jsx(ContributorTable, { data: currentData, isLoading: isLoading, onSelect: setSelectedDeveloper })] }))] }), _jsx(ContributorDrawer, { metric: selectedDeveloper, onClose: () => setSelectedDeveloper(null) })] }));
}
