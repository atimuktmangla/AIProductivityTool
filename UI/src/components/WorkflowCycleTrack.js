import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, } from 'recharts';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';
const TOOLTIP = (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Workflow Cycle Track" }), _jsx("p", { children: "Breaks total PR cycle time into three sequential stages so you can see exactly where time is lost." }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "Pickup Speed" }), " \u2014 working hours from PR creation to the first reviewer action (comment, review, or approval). Target: \u2264 4 hrs (green), 4\u20138 hrs (amber), > 8 hrs (red)."] }), _jsxs("li", { children: [_jsx("strong", { children: "Review Quality" }), " \u2014 working hours from the first reviewer comment to merge. Measures how long the review conversation takes. Target: \u2264 8 hrs (green), 8\u201316 hrs (amber), > 16 hrs (red)."] }), _jsxs("li", { children: [_jsx("strong", { children: "Total Cycle Time" }), " \u2014 end-to-end working hours from PR creation to merge, adjusted for weekends and ~2.75 leave days/month. Target: \u2264 24 hrs (green), 24\u201340 hrs (amber), > 40 hrs (red)."] })] }), _jsx("p", { children: "The bar chart compares the three stages side-by-side when multiple developers are selected." }), _jsx("p", { className: "tip-source", children: "Source: Bitbucket PR activities (created/comment/merge timestamps)" })] }));
// Team performance benchmarks (hours). Colour indicates how actual compares.
const BENCHMARKS = {
    pickupDelayHrs: { good: 4, warn: 8 },
    reviewLifecycleHrs: { good: 8, warn: 16 },
    cycleTimeHrs: { good: 24, warn: 40 },
};
function ratingColor(value, key) {
    const { good, warn } = BENCHMARKS[key];
    if (value <= good)
        return '#4fc87f';
    if (value <= warn)
        return '#f7b24f';
    return '#f74f4f';
}
function ratingLabel(value, key) {
    const { good, warn } = BENCHMARKS[key];
    if (value === 0)
        return '—';
    if (value <= good)
        return 'On track';
    if (value <= warn)
        return 'Needs attention';
    return 'At risk';
}
const fmt = (v) => (v === 0 ? '—' : `${v.toFixed(1)} hrs`);
export function WorkflowCycleTrack({ data, isLoading }) {
    if (isLoading) {
        return (_jsxs("section", { className: "workflow-cycle-track", children: [_jsxs("h2", { className: "section-title", children: ["Workflow Cycle Track ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx(Skeleton, { width: "100%", height: "200px" })] }));
    }
    const avg = (fn) => data.length ? data.reduce((s, d) => s + fn(d), 0) / data.length : 0;
    const stages = [
        {
            key: 'pickupDelayHrs',
            label: 'Pickup Speed',
            detail: 'PR created → first review',
            value: avg((d) => d.pickupDelayHrs),
        },
        {
            key: 'reviewLifecycleHrs',
            label: 'Review Quality',
            detail: 'First comment → merge',
            value: avg((d) => d.reviewLifecycleHrs),
        },
        {
            key: 'cycleTimeHrs',
            label: 'Total Cycle Time',
            detail: 'Creation → merge (leave-adjusted)',
            value: avg((d) => d.cycleTimeHrs),
        },
    ];
    const chartData = stages.map((s) => ({ name: s.label, hours: parseFloat(s.value.toFixed(2)) }));
    return (_jsxs("section", { className: "workflow-cycle-track", children: [_jsxs("h2", { className: "section-title", children: ["Workflow Cycle Track ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx("div", { className: "wf-track", children: stages.map((stage) => (_jsxs("div", { className: "wf-stage", children: [_jsx("span", { className: "wf-stage__label", children: stage.label }), _jsx("span", { className: "wf-stage__value", style: { color: ratingColor(stage.value, stage.key) }, children: fmt(stage.value) }), _jsx("span", { className: "wf-stage__detail", children: stage.detail }), _jsx("span", { className: "wf-stage__rating", style: { color: ratingColor(stage.value, stage.key) }, children: ratingLabel(stage.value, stage.key) })] }, stage.key))) }), data.length > 1 && (_jsx("div", { className: "wf-barchart", children: _jsx(ResponsiveContainer, { width: "100%", height: 180, children: _jsxs(BarChart, { data: chartData, margin: { top: 8, right: 16, bottom: 0, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#2a2d3a" }), _jsx(XAxis, { dataKey: "name", tick: { fill: '#8b8fa8', fontSize: 11 } }), _jsx(YAxis, { tick: { fill: '#8b8fa8', fontSize: 11 }, unit: " h" }), _jsx(Tooltip, { formatter: (v) => [`${v} hrs`], contentStyle: { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }, itemStyle: { color: '#e2e4ed' } }), _jsx(Bar, { dataKey: "hours", radius: [4, 4, 0, 0], children: chartData.map((entry, i) => (_jsx(Cell, { fill: ratingColor(stages[i].value, stages[i].key) }, entry.name))) })] }) }) }))] }));
}
