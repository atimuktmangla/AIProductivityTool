import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';
const TOOLTIP = (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Team Contributors" }), _jsx("p", { children: "Per-developer breakdown of every metric. Click a row to open the detail drawer. Click a column header to sort." }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "Commits" }), " \u2014 total commits pushed to the scoped repos in the date range."] }), _jsxs("li", { children: [_jsx("strong", { children: "PRs reviewed" }), " \u2014 merged PRs authored by others where this developer participated as a reviewer."] }), _jsxs("li", { children: [_jsx("strong", { children: "Lines \u00B1 " }), " \u2014 lines added (green) and deleted (red) across all merged PRs, with a mini balance bar."] }), _jsxs("li", { children: [_jsx("strong", { children: "Cycle (hrs)" }), " \u2014 avg working hours from PR creation to merge (leave-adjusted)."] }), _jsxs("li", { children: [_jsx("strong", { children: "Pickup (hrs)" }), " \u2014 avg working hours until the first reviewer engages."] }), _jsxs("li", { children: [_jsx("strong", { children: "Review lifecycle (hrs)" }), " \u2014 avg working hours from first comment to merge."] }), _jsxs("li", { children: [_jsx("strong", { children: "Review depth" }), " \u2014 avg reviewer actions (comments/approvals) per PR. Informational; not part of the quality score."] }), _jsxs("li", { children: [_jsx("strong", { children: "Work type" }), " \u2014 mini stacked bar: blue = Features, red = Bugs, amber = Infra/Debt."] }), _jsxs("li", { children: [_jsx("strong", { children: "Stale PRs" }), " \u2014 open PRs older than the configured threshold (default 3 business days). Shown in amber when > 0."] }), _jsxs("li", { children: [_jsx("strong", { children: "Avg PR size" }), " \u2014 mean lines changed per PR. \u2691 flag appears when > 400 lines (large, harder to review)."] }), _jsxs("li", { children: [_jsx("strong", { children: "Quality" }), " \u2014 composite 0\u2013100 score: 25% security resolution (2.5\u00D7 multiplier for BlackDuck/CVE fixes) + 25% approval rate (24-h SLA, rubber-stamp penalised) + 25% PR focus (sigmoid on avg size) + 25% low rework (exponential penalty on RESCOPED events)."] })] }), _jsx("p", { className: "tip-source", children: "Source: Bitbucket commits, PRs, activities + Jira issues" })] }));
function exportCsv(data) {
    const header = ['Name', 'ID', 'Commits', 'PRsReviewed', 'Lines+', 'Lines-',
        'CycleHrs', 'PickupHrs', 'ReviewLifecycleHrs', 'ReviewDepth',
        'AvgPRSizeLines', 'QualityScore', 'Features', 'Bugs', 'InfraDebt'];
    const rows = data.map((d) => [
        d.name, d.developerId, d.totalCommits, d.prsReviewed,
        d.linesChanged.added, d.linesChanged.deleted,
        d.cycleTimeHrs.toFixed(1), d.pickupDelayHrs.toFixed(1),
        d.reviewLifecycleHrs.toFixed(1), d.reviewDepth.toFixed(1),
        d.avgPrSizeLines,
        d.codeQuality.score,
        d.workType.features, d.workType.bugs, d.workType.infraOrDebt,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'team-metrics.csv';
    a.click();
    URL.revokeObjectURL(url);
}
function buildCols(onSelect) {
    return [
        {
            label: 'Developer',
            key: 'name',
            render: (d) => (_jsxs("button", { type: "button", className: "c-table__name-btn", onClick: () => onSelect(d), title: "View details", children: [_jsx("span", { className: "c-table__avatar", "aria-hidden": "true", children: d.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') }), _jsxs("span", { children: [_jsx("strong", { children: d.name }), _jsx("small", { style: { display: 'block', color: '#8b8fa8', fontSize: '0.7rem' }, children: d.developerId })] })] })),
        },
        {
            label: 'Commits',
            key: 'totalCommits',
            render: (d) => d.totalCommits,
        },
        {
            label: 'PRs reviewed',
            key: 'prsReviewed',
            render: (d) => d.prsReviewed === 0
                ? _jsx("span", { style: { color: '#8b8fa8' }, children: "0" })
                : d.prsReviewed,
        },
        {
            label: 'Lines ± (added/del)',
            key: 'linesChanged',
            render: (d) => (_jsxs("span", { children: [_jsxs("span", { style: { color: '#4fc87f' }, children: ["+", d.linesChanged.added.toLocaleString()] }), ' / ', _jsxs("span", { style: { color: '#f74f4f' }, children: ["-", d.linesChanged.deleted.toLocaleString()] }), _jsx(LineBalanceBar, { added: d.linesChanged.added, deleted: d.linesChanged.deleted })] })),
        },
        {
            label: 'Cycle (hrs)',
            key: 'cycleTimeHrs',
            render: (d) => fmtHrs(d.cycleTimeHrs),
        },
        {
            label: 'Pickup (hrs)',
            key: 'pickupDelayHrs',
            render: (d) => fmtHrs(d.pickupDelayHrs),
        },
        {
            label: 'Review lifecycle (hrs)',
            key: 'reviewLifecycleHrs',
            render: (d) => fmtHrs(d.reviewLifecycleHrs),
        },
        {
            label: 'Review depth',
            key: 'reviewDepth',
            render: (d) => fmtHrs(d.reviewDepth),
        },
        {
            label: 'Work type',
            key: 'workType',
            render: (d) => _jsx(WorkTypeSparkline, { metric: d }),
        },
        {
            label: 'Stale PRs',
            key: 'openPrsOverThreshold',
            render: (d) => d.openPrsOverThreshold === 0
                ? _jsx("span", { style: { color: '#8b8fa8' }, children: "0" })
                : _jsx("span", { style: { color: '#f7b24f', fontWeight: 600 }, children: d.openPrsOverThreshold }),
        },
        {
            label: 'Avg PR size',
            key: 'avgPrSizeLines',
            render: (d) => (_jsxs("span", { children: [d.avgPrSizeLines === 0 ? '—' : d.avgPrSizeLines.toLocaleString(), d.avgPrSizeLines > 400 && (_jsx("span", { title: "Large PR: avg size exceeds 400 lines", style: { marginLeft: '0.3rem', color: '#f7b24f' }, children: "\u2691" }))] })),
        },
        {
            label: 'Quality',
            key: 'codeQuality',
            render: (d) => _jsx(QualityBadge, { score: d.codeQuality.score }),
        },
    ];
} // end buildCols
function fmtHrs(v) {
    return v === 0 ? '—' : v.toFixed(1);
}
function LineBalanceBar({ added, deleted }) {
    const total = added + deleted;
    if (total === 0)
        return null;
    const addPct = Math.round((added / total) * 100);
    return (_jsxs("div", { className: "line-balance", title: `+${added} / -${deleted}`, style: { display: 'flex', height: '4px', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }, children: [_jsx("div", { style: { width: `${addPct}%`, background: '#4fc87f' } }), _jsx("div", { style: { width: `${100 - addPct}%`, background: '#f74f4f' } })] }));
}
function WorkTypeSparkline({ metric }) {
    const { features, bugs, infraOrDebt } = metric.workType;
    const total = features + bugs + infraOrDebt;
    if (total === 0)
        return _jsx("span", { style: { color: '#8b8fa8' }, children: "\u2014" });
    const data = [
        { value: features, color: '#4f8ef7', label: 'F' },
        { value: bugs, color: '#f74f4f', label: 'B' },
        { value: infraOrDebt, color: '#f7b24f', label: 'I' },
    ].filter((d) => d.value > 0);
    return (_jsx("span", { className: "wt-mini", title: `F:${features} B:${bugs} I:${infraOrDebt}`, children: data.map((d) => (_jsx("span", { className: "wt-mini__segment", style: {
                width: `${Math.round((d.value / total) * 48)}px`,
                background: d.color,
            }, "aria-label": `${d.label}:${d.value}` }, d.label))) }));
}
function QualityBadge({ score }) {
    let cls = 'cq-badge';
    if (score >= 75)
        cls += ' cq-badge--good';
    else if (score >= 50)
        cls += ' cq-badge--fair';
    else
        cls += ' cq-badge--poor';
    return _jsx("span", { className: cls, children: score });
}
function getSortValue(d, key) {
    const v = d[key];
    if (typeof v === 'number')
        return v;
    if (typeof v === 'string')
        return v;
    if (key === 'linesChanged') {
        const lc = v;
        return lc.added + lc.deleted;
    }
    if (key === 'workType') {
        const wt = v;
        return wt.features + wt.bugs + wt.infraOrDebt;
    }
    if (key === 'codeQuality') {
        return v.score;
    }
    return 0;
}
export function ContributorTable({ data, isLoading, onSelect }) {
    const [sortKey, setSortKey] = useState('totalCommits');
    const [sortDir, setSortDir] = useState('desc');
    const COLS = buildCols(onSelect);
    const handleTableSort = useCallback((_e, fieldKey) => {
        if (fieldKey === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        }
        else {
            setSortKey(fieldKey);
            setSortDir('desc');
        }
    }, [sortKey]);
    const sorted = [...data].sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
    });
    return (_jsxs("section", { className: "contributor-table", children: [_jsxs("div", { className: "contributor-table__header", children: [_jsxs("h2", { className: "section-title", children: ["Team Contributors ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), data.length > 0 && (_jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => exportCsv(data), children: "Export CSV" }))] }), _jsx("div", { className: "contributor-table__scroll", children: _jsxs("table", { className: "c-table", children: [_jsx("thead", { children: _jsx("tr", { children: COLS.map((col) => (_jsx("th", { className: "c-table__th", children: _jsxs("button", { type: "button", className: "c-table__sort-btn", onClick: (e) => handleTableSort(e, col.key), "aria-sort": sortKey === col.key
                                            ? sortDir === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : 'none', children: [col.label, sortKey === col.key && (_jsx("span", { "aria-hidden": "true", className: "c-table__sort-arrow", children: sortDir === 'asc' ? ' ▲' : ' ▼' }))] }) }, col.key))) }) }), _jsx("tbody", { children: isLoading
                                ? Array.from({ length: 4 }).map((_, i) => (_jsx("tr", { children: COLS.map((col) => (_jsx("td", { className: "c-table__td", children: _jsx(Skeleton, { height: "0.9rem" }) }, col.key))) }, i)))
                                : sorted.map((row) => (_jsx("tr", { className: "c-table__row", children: COLS.map((col) => (_jsx("td", { className: "c-table__td", children: col.render(row) }, col.key))) }, row.developerId))) })] }) })] }));
}
