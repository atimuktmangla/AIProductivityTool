import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';
const TOOLTIP = (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Jira Category Allocation" }), _jsx("p", { children: "Shows how the team's Jira issues are distributed across three work categories for the selected period." }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "Features (blue)" }), " \u2014 Story, New Feature, Epic, Task, and similar issue types. Represents forward progress on the product roadmap."] }), _jsxs("li", { children: [_jsx("strong", { children: "Bugs (red)" }), " \u2014 Bug issue types. A high bug percentage relative to features signals quality or stability problems."] }), _jsxs("li", { children: [_jsx("strong", { children: "Infra & Debt (amber)" }), " \u2014 Improvement, Sub-task, Technical Debt, Infrastructure, and Support issues. Represents investment in platform health."] })] }), _jsx("p", { children: "Issues are sourced from two places: Jira keys found in commit messages, and issues assigned to each developer in the date range \u2014 both are deduplicated." }), _jsx("p", { className: "tip-source", children: "Source: Jira issue types + labels linked to Bitbucket commits" })] }));
const COLORS = { features: '#4f8ef7', bugs: '#f74f4f', infraOrDebt: '#f7b24f' };
export function WorkTypeChart({ data, isLoading }) {
    if (isLoading) {
        return (_jsxs("section", { className: "work-type-chart", children: [_jsxs("h2", { className: "section-title", children: ["Jira Category Allocation ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx(Skeleton, { width: "100%", height: "220px" })] }));
    }
    const totals = data.reduce((acc, d) => ({
        features: acc.features + d.workType.features,
        bugs: acc.bugs + d.workType.bugs,
        infraOrDebt: acc.infraOrDebt + d.workType.infraOrDebt,
    }), { features: 0, bugs: 0, infraOrDebt: 0 });
    const grand = totals.features + totals.bugs + totals.infraOrDebt;
    const chartData = [
        { name: 'Features', value: totals.features, color: COLORS.features },
        { name: 'Bugs', value: totals.bugs, color: COLORS.bugs },
        { name: 'Infra / Debt', value: totals.infraOrDebt, color: COLORS.infraOrDebt },
    ].filter((d) => d.value > 0);
    if (grand === 0) {
        return (_jsxs("section", { className: "work-type-chart", children: [_jsxs("h2", { className: "section-title", children: ["Jira Category Allocation ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx("p", { className: "chart-empty", children: "No Jira issues found for the selected window." })] }));
    }
    return (_jsxs("section", { className: "work-type-chart", children: [_jsxs("h2", { className: "section-title", children: ["Jira Category Allocation ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsxs("div", { className: "work-type-chart__body", children: [_jsx(ResponsiveContainer, { width: "50%", height: 220, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: chartData, cx: "50%", cy: "50%", innerRadius: 60, outerRadius: 95, paddingAngle: 3, dataKey: "value", label: ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`, labelLine: false, children: chartData.map((entry) => (_jsx(Cell, { fill: entry.color }, entry.name))) }), _jsx(Tooltip, { formatter: (value) => [
                                        `${value} (${grand > 0 ? ((Number(value) / grand) * 100).toFixed(1) : 0}%)`,
                                        'Issues',
                                    ], contentStyle: { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }, itemStyle: { color: '#e2e4ed' } }), _jsx(Legend, { iconType: "circle", iconSize: 10, formatter: (value) => _jsx("span", { style: { color: '#e2e4ed', fontSize: '0.8rem' }, children: value }) })] }) }), _jsx("div", { className: "work-type-chart__bars", children: chartData.map((item) => {
                            const pct = grand > 0 ? Math.round((item.value / grand) * 100) : 0;
                            return (_jsxs("div", { className: "wt-bar", children: [_jsx("span", { className: "wt-bar__label", children: item.name }), _jsx("div", { className: "wt-bar__track", children: _jsx("div", { className: "wt-bar__fill", style: { width: `${pct}%`, background: item.color } }) }), _jsxs("span", { className: "wt-bar__count", children: [item.value, " ", _jsxs("span", { className: "wt-bar__pct", children: ["(", pct, "%)"] })] })] }, item.name));
                        }) })] })] }));
}
