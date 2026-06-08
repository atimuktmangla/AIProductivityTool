import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';
const TOOLTIP = (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Throughput Overview" }), _jsx("p", { children: "Team-wide output summary for the selected date window." }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "Total Commits" }), " \u2014 count of all commits authored by the selected developers across the scoped repos. Delta shows change vs. the comparison period (if set)."] }), _jsxs("li", { children: [_jsx("strong", { children: "Lines Added / Deleted" }), " \u2014 raw diff lines summed from every merged PR. High deletions relative to additions can indicate cleanup or refactoring sprints."] }), _jsxs("li", { children: [_jsx("strong", { children: "Avg Cycle Time" }), " \u2014 mean hours from PR creation to merge, counted only on Mon\u2013Fri 09:00\u201317:00 and discounted for ~2.75 leave/holiday days per month. Lower is better."] })] }), _jsx("p", { className: "tip-source", children: "Source: Bitbucket commits + PR diffs" })] }));
function Delta({ value, label }) {
    const sign = value > 0 ? '+' : '';
    const colour = value > 0 ? '#4fc87f' : '#f74f4f';
    return (_jsxs("span", { style: { fontSize: '0.75rem', color: colour, marginLeft: '0.4rem' }, children: [sign, label ?? value] }));
}
function StatCard({ label, value, sub, delta, deltaLabel }) {
    return (_jsxs("div", { className: "stat-card", children: [_jsx("span", { className: "stat-card__label", children: label }), _jsxs("span", { className: "stat-card__value", children: [value, delta != null && delta !== 0 && _jsx(Delta, { value: delta, label: deltaLabel })] }), sub && _jsx("span", { className: "stat-card__sub", children: sub })] }));
}
function sum(data, key) {
    if (key === 'linesAdded')
        return data.reduce((s, d) => s + d.linesChanged.added, 0);
    if (key === 'linesDeleted')
        return data.reduce((s, d) => s + d.linesChanged.deleted, 0);
    return data.reduce((s, d) => s + d[key], 0);
}
function avgCycle(data) {
    if (data.length === 0)
        return null;
    return data.reduce((s, d) => s + d.cycleTimeHrs, 0) / data.length;
}
export function ThroughputOverview({ data, previousData, isLoading }) {
    if (isLoading) {
        return (_jsxs("section", { className: "throughput-overview", children: [_jsxs("h2", { className: "section-title", children: ["Throughput Overview ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx("div", { className: "throughput-overview__grid", children: Array.from({ length: 4 }).map((_, i) => (_jsxs("div", { className: "stat-card", children: [_jsx(Skeleton, { height: "0.75rem", width: "60%" }), _jsx(Skeleton, { height: "2rem", width: "40%", className: "stat-card__value-skeleton" })] }, i))) })] }));
    }
    const totalCommits = sum(data, 'totalCommits');
    const totalAdded = sum(data, 'linesAdded');
    const totalDeleted = sum(data, 'linesDeleted');
    const cycle = avgCycle(data);
    const prevCommits = previousData ? sum(previousData, 'totalCommits') : null;
    const prevAdded = previousData ? sum(previousData, 'linesAdded') : null;
    const prevCycle = previousData ? avgCycle(previousData) : null;
    const commitDelta = prevCommits != null ? totalCommits - prevCommits : null;
    const addedDelta = prevAdded != null ? totalAdded - prevAdded : null;
    // For cycle time: negative delta is good (faster = better) — flip sign for colour
    const cycleDeltaRaw = (cycle != null && prevCycle != null) ? cycle - prevCycle : null;
    const cycleDelta = cycleDeltaRaw != null ? -cycleDeltaRaw : null; // invert so green = faster
    const cycleDeltaLabel = cycleDeltaRaw != null
        ? `${cycleDeltaRaw > 0 ? '+' : ''}${cycleDeltaRaw.toFixed(1)} hrs`
        : undefined;
    return (_jsxs("section", { className: "throughput-overview", children: [_jsx("h2", { className: "section-title", children: "Throughput Overview" }), _jsxs("div", { className: "throughput-overview__grid", children: [_jsx(StatCard, { label: "Total Commits", value: totalCommits, delta: commitDelta }), _jsx(StatCard, { label: "Lines Added", value: `+${totalAdded.toLocaleString()}`, delta: addedDelta }), _jsx(StatCard, { label: "Lines Deleted", value: `-${totalDeleted.toLocaleString()}` }), _jsx(StatCard, { label: "Avg Cycle Time", value: cycle != null ? `${cycle.toFixed(1)} hrs` : '—', sub: "leave-adjusted, Mon\u2013Fri", delta: cycleDelta, deltaLabel: cycleDeltaLabel })] })] }));
}
