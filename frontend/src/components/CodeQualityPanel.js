import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, } from 'recharts';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';
const TOOLTIP = (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Code Quality Score" }), _jsx("p", { children: "A 0\u2013100 composite from four equal-weighted signals (25% each)." }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "Critical / Security (25%)" }), " \u2014 Jira issues resolved, with a 2.5\u00D7 multiplier for BlackDuck, CVE, customer-reported, or RCA tickets. Rewards high-risk firefighting instead of penalising it."] }), _jsxs("li", { children: [_jsx("strong", { children: "Approval rate (25%)" }), " \u2014 % of PRs approved by a human within 24 h. Rubber-stamp approvals (under 5 min, zero comments) count as 50%."] }), _jsxs("li", { children: [_jsx("strong", { children: "PR focus (25%)" }), " \u2014 Sigmoid decay on avg PR size: \u2264 200 lines \u2248 100, 500 lines = 50, \u2265 800 lines \u2248 0. A 1-line security fix scores the same as a clean 200-line feature."] }), _jsxs("li", { children: [_jsx("strong", { children: "Low rework (25%)" }), " \u2014 Exponential penalty on RESCOPED events per PR. 0 rescopes = 100; penalty doubles every extra rescope."] })] }), _jsx("p", { children: "Thresholds: \u2265 75 = Good (green), 50\u201374 = Fair (amber), < 50 = Needs work (red)." }), _jsx("p", { className: "tip-source", children: "Source: Jira issue types + Bitbucket PR activity events" })] }));
function scoreColor(score) {
    if (score >= 75)
        return '#4fc87f';
    if (score >= 50)
        return '#f7b24f';
    return '#f74f4f';
}
function scoreLabel(score) {
    if (score >= 75)
        return 'Good';
    if (score >= 50)
        return 'Fair';
    return 'Needs work';
}
/** Circular arc gauge rendered via SVG. */
function ScoreGauge({ score }) {
    const r = 36;
    const cx = 52;
    const cy = 52;
    const circumference = Math.PI * r; // half-circle arc
    const fill = (score / 100) * circumference;
    const color = scoreColor(score);
    return (_jsxs("svg", { width: "104", height: "60", viewBox: "0 0 104 60", "aria-label": `Quality score ${score}`, children: [_jsx("path", { d: `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`, fill: "none", stroke: "#2a2d3a", strokeWidth: "10", strokeLinecap: "round" }), _jsx("path", { d: `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`, fill: "none", stroke: color, strokeWidth: "10", strokeLinecap: "round", strokeDasharray: `${fill} ${circumference}` }), _jsx("text", { x: cx, y: cy - 6, textAnchor: "middle", fill: color, fontSize: "18", fontWeight: "700", children: score }), _jsx("text", { x: cx, y: cy + 8, textAnchor: "middle", fill: "#8b8fa8", fontSize: "9", children: "/ 100" })] }));
}
export function CodeQualityPanel({ data, isLoading }) {
    if (isLoading) {
        return (_jsxs("section", { className: "code-quality-panel", children: [_jsxs("h2", { className: "section-title", children: ["Code Quality Score ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsx(Skeleton, { width: "100%", height: "240px" })] }));
    }
    if (data.length === 0)
        return null;
    // ── Team average for radar ───────────────────────────────────────────────────
    const avg = (fn) => Math.round(data.reduce((s, d) => s + fn(d), 0) / data.length);
    // Nullable variant: excludes developers where the signal is null (no data)
    const avgNullable = (fn) => {
        const values = data.map(fn).filter((v) => v !== null);
        if (values.length === 0)
            return null;
        return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    };
    const teamScore = avg((d) => d.codeQuality.score);
    const teamCriticalScore = avgNullable((d) => d.codeQuality.criticalScore);
    const teamApprovalScore = avgNullable((d) => d.codeQuality.approvalScore);
    const teamPrFocusScore = avgNullable((d) => d.codeQuality.prFocusScore);
    const teamReworkScore = avg((d) => Math.round(100 * Math.pow(2, -d.codeQuality.reworkRate)));
    const radarData = [
        { axis: 'Critical / Security', value: teamCriticalScore ?? 0 },
        { axis: 'Approval rate', value: teamApprovalScore ?? 0 },
        { axis: 'PR focus', value: teamPrFocusScore ?? 0 },
        { axis: 'Low rework', value: teamReworkScore },
    ];
    // ── Per-developer bar chart data ─────────────────────────────────────────────
    const barData = [...data]
        .sort((a, b) => b.codeQuality.score - a.codeQuality.score)
        .map((d) => ({ name: d.name.split(' ')[0], score: d.codeQuality.score }));
    return (_jsxs("section", { className: "code-quality-panel", children: [_jsxs("h2", { className: "section-title", children: ["Code Quality Score ", _jsx(WidgetTooltip, { content: TOOLTIP })] }), _jsxs("div", { className: "cq-body", children: [_jsxs("div", { className: "cq-gauge-card", children: [_jsx("span", { className: "cq-gauge-card__label", children: "Team average" }), _jsx(ScoreGauge, { score: teamScore }), _jsx("span", { className: "cq-gauge-card__rating", style: { color: scoreColor(teamScore) }, children: scoreLabel(teamScore) }), _jsxs("div", { className: "cq-sub-scores", children: [_jsx(SubScore, { label: "Critical / Security", value: teamCriticalScore }), _jsx(SubScore, { label: "Approval rate", value: teamApprovalScore }), _jsx(SubScore, { label: "PR focus", value: teamPrFocusScore }), _jsx(SubScore, { label: "Low rework", value: teamReworkScore })] })] }), _jsx("div", { className: "cq-radar", children: _jsx(ResponsiveContainer, { width: "100%", height: 200, children: _jsxs(RadarChart, { data: radarData, margin: { top: 8, right: 24, bottom: 8, left: 24 }, children: [_jsx(PolarGrid, { stroke: "#2a2d3a" }), _jsx(PolarAngleAxis, { dataKey: "axis", tick: { fill: '#8b8fa8', fontSize: 11 } }), _jsx(Radar, { dataKey: "value", stroke: "#4f8ef7", fill: "#4f8ef7", fillOpacity: 0.25 }), _jsx(Tooltip, { formatter: (v) => [`${v}`, 'Score'], contentStyle: { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }, itemStyle: { color: '#e2e4ed' } })] }) }) }), data.length > 1 && (_jsx("div", { className: "cq-bars", children: _jsx(ResponsiveContainer, { width: "100%", height: 200, children: _jsxs(BarChart, { data: barData, layout: "vertical", margin: { top: 4, right: 16, bottom: 4, left: 8 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#2a2d3a", horizontal: false }), _jsx(XAxis, { type: "number", domain: [0, 100], tick: { fill: '#8b8fa8', fontSize: 10 } }), _jsx(YAxis, { type: "category", dataKey: "name", width: 72, tick: { fill: '#8b8fa8', fontSize: 11 } }), _jsx(Tooltip, { formatter: (v) => [`${v} / 100`], contentStyle: { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }, itemStyle: { color: '#e2e4ed' } }), _jsx(Bar, { dataKey: "score", radius: [0, 4, 4, 0], children: barData.map((entry) => (_jsx(Cell, { fill: scoreColor(entry.score) }, entry.name))) })] }) }) }))] })] }));
}
function SubScore({ label, value }) {
    return (_jsxs("div", { className: "cq-sub-score", children: [_jsx("span", { className: "cq-sub-score__label", children: label }), _jsx("div", { className: "cq-sub-score__track", children: value !== null && (_jsx("div", { className: "cq-sub-score__fill", style: { width: `${value}%`, background: scoreColor(value) } })) }), _jsx("span", { className: "cq-sub-score__value", style: { color: value !== null ? scoreColor(value) : '#8b8fa8' }, children: value !== null ? value : 'N/A' })] }));
}
