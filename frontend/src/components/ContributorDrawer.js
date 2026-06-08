import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
function fmtHrs(v) {
    return v === 0 ? '—' : `${v.toFixed(1)} hrs`;
}
function fmtDate(epochMs) {
    return new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function avatarInitials(name) {
    return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function StatCard({ label, value }) {
    return (_jsxs("div", { className: "drawer__stat-card", children: [_jsx("span", { className: "drawer__stat-label", children: label }), _jsx("span", { className: "drawer__stat-value", children: value })] }));
}
function QualityBar({ label, value, max = 100, colorClass }) {
    const pct = value !== null ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (_jsxs("div", { className: "drawer__quality-bar", children: [_jsx("span", { className: "drawer__quality-label", children: label }), _jsx("div", { className: "drawer__quality-track", children: value !== null && (_jsx("div", { className: `drawer__quality-fill ${colorClass}`, style: { width: `${pct}%` } })) }), _jsx("span", { className: "drawer__quality-value", style: { color: value === null ? '#8b8fa8' : undefined }, children: value !== null ? value : 'N/A' })] }));
}
function StateBadge({ state }) {
    const cls = state === 'MERGED' ? 'drawer__pr-badge--merged'
        : state === 'OPEN' ? 'drawer__pr-badge--open'
            : 'drawer__pr-badge--declined';
    return _jsx("span", { className: `drawer__pr-badge ${cls}`, children: state });
}
export function ContributorDrawer({ metric, onClose }) {
    // Close on Escape
    useEffect(() => {
        if (!metric)
            return;
        const handler = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [metric, onClose]);
    // Lock body scroll while open
    useEffect(() => {
        if (metric) {
            document.body.style.overflow = 'hidden';
        }
        else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [metric]);
    if (!metric)
        return null;
    const { name, developerId, totalCommits, totalPRs, prsReviewed, linesChanged, cycleTimeHrs, pickupDelayHrs, reviewLifecycleHrs, reviewDepth, workType, codeQuality, prs } = metric;
    const sortedPRs = [...prs].sort((a, b) => b.createdDate - a.createdDate);
    const totalWorkType = workType.features + workType.bugs + workType.infraOrDebt;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "drawer-backdrop", onClick: onClose, "aria-hidden": "true" }), _jsxs("aside", { className: "contributor-drawer", role: "dialog", "aria-modal": "true", "aria-label": `${name} details`, children: [_jsxs("div", { className: "drawer__header", children: [_jsxs("div", { className: "drawer__header-identity", children: [_jsx("span", { className: "drawer__avatar", children: avatarInitials(name) }), _jsxs("div", { children: [_jsx("h2", { className: "drawer__name", children: name }), _jsx("span", { className: "drawer__id", children: developerId })] })] }), _jsx("button", { type: "button", className: "drawer__close", onClick: onClose, "aria-label": "Close", children: "\u2715" })] }), _jsxs("div", { className: "drawer__body", children: [_jsx("section", { className: "drawer__section", children: _jsxs("div", { className: "drawer__stat-row", children: [_jsx(StatCard, { label: "Commits", value: totalCommits }), _jsx(StatCard, { label: "PRs merged", value: totalPRs }), _jsx(StatCard, { label: "PRs reviewed", value: prsReviewed }), _jsx(StatCard, { label: "Lines +", value: `+${linesChanged.added.toLocaleString()}` }), _jsx(StatCard, { label: "Lines \u2212", value: `-${linesChanged.deleted.toLocaleString()}` })] }) }), _jsxs("section", { className: "drawer__section", children: [_jsx("h3", { className: "drawer__section-title", children: "Cycle time (avg)" }), _jsxs("div", { className: "drawer__stat-row", children: [_jsx(StatCard, { label: "Pickup delay", value: fmtHrs(pickupDelayHrs) }), _jsx(StatCard, { label: "Review lifecycle", value: fmtHrs(reviewLifecycleHrs) }), _jsx(StatCard, { label: "Total cycle", value: fmtHrs(cycleTimeHrs) }), _jsx(StatCard, { label: "Review depth", value: reviewDepth === 0 ? '—' : reviewDepth.toFixed(1) })] })] }), totalWorkType > 0 && (_jsxs("section", { className: "drawer__section", children: [_jsxs("h3", { className: "drawer__section-title", children: ["Work type (", totalWorkType, " issues)"] }), _jsxs("div", { className: "drawer__worktype-row", children: [_jsxs("span", { className: "drawer__worktype-chip drawer__worktype-chip--feature", children: ["Features ", workType.features] }), _jsxs("span", { className: "drawer__worktype-chip drawer__worktype-chip--bug", children: ["Bugs ", workType.bugs] }), _jsxs("span", { className: "drawer__worktype-chip drawer__worktype-chip--infra", children: ["Infra & debt ", workType.infraOrDebt] })] })] })), _jsxs("section", { className: "drawer__section", children: [_jsxs("h3", { className: "drawer__section-title", children: ["Code quality", _jsx("span", { className: `drawer__quality-badge ${codeQuality.score >= 75 ? 'drawer__quality-badge--good' : codeQuality.score >= 50 ? 'drawer__quality-badge--fair' : 'drawer__quality-badge--poor'}`, children: codeQuality.score })] }), _jsxs("div", { className: "drawer__quality-bars", children: [_jsx(QualityBar, { label: "Critical / Security", value: codeQuality.criticalScore, colorClass: "drawer__quality-fill--bug" }), _jsx(QualityBar, { label: "Approval rate", value: codeQuality.approvalScore, colorClass: "drawer__quality-fill--review" }), _jsx(QualityBar, { label: "PR focus", value: codeQuality.prFocusScore, colorClass: "drawer__quality-fill--review" }), _jsx(QualityBar, { label: "Low rework", value: Math.round(100 * Math.pow(2, -codeQuality.reworkRate)), colorClass: "drawer__quality-fill--rework" })] })] }), _jsxs("section", { className: "drawer__section drawer__section--prs", children: [_jsxs("h3", { className: "drawer__section-title", children: ["Pull requests (", sortedPRs.length, ")"] }), sortedPRs.length === 0
                                        ? _jsx("p", { className: "drawer__empty", children: "No PRs in the selected date range." })
                                        : (_jsx("div", { className: "drawer__pr-scroll", children: _jsxs("table", { className: "drawer__pr-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Title" }), _jsx("th", { children: "Repo" }), _jsx("th", { children: "State" }), _jsx("th", { children: "Created" }), _jsx("th", { children: "Cycle" }), _jsx("th", { children: "Lines \u00B1" })] }) }), _jsx("tbody", { children: sortedPRs.map((pr) => (_jsxs("tr", { children: [_jsx("td", { className: "drawer__pr-title", children: pr.url
                                                                        ? _jsx("a", { href: pr.url, target: "_blank", rel: "noopener noreferrer", className: "drawer__pr-link", children: pr.title })
                                                                        : pr.title }), _jsxs("td", { className: "drawer__pr-repo", children: [_jsx("span", { className: "drawer__pr-project", children: pr.projectKey }), "/", pr.repoSlug] }), _jsx("td", { children: _jsx(StateBadge, { state: pr.state }) }), _jsx("td", { className: "drawer__pr-date", children: fmtDate(pr.createdDate) }), _jsx("td", { className: "drawer__pr-hrs", children: pr.cycleTimeHrs === 0 ? '—' : `${pr.cycleTimeHrs.toFixed(1)}h` }), _jsxs("td", { className: "drawer__pr-lines", children: [_jsxs("span", { style: { color: '#4fc87f' }, children: ["+", pr.linesAdded] }), ' / ', _jsxs("span", { style: { color: '#f74f4f' }, children: ["-", pr.linesRemoved] })] })] }, pr.id))) })] }) }))] })] })] })] }));
}
