import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const PROVIDER_LABEL = {
    anthropic: 'Claude (Anthropic)',
    openai: 'GPT-4o mini (OpenAI)',
    gemini: 'Gemini 2.0 Flash (Google)',
};
const HEALTH_COLOR = (score) => score >= 75 ? '#4fc87f' : score >= 50 ? '#f7b24f' : '#f74f4f';
const HEALTH_LABEL = (score) => score >= 75 ? 'Healthy' : score >= 50 ? 'Fair' : 'At risk';
export function InsightsPanel({ insights }) {
    const { summary, teamHealthScore, bottleneck, bottleneckDetail, workTypeImbalance, workTypeDetail, aiGenerated, aiProvider, } = insights;
    const color = HEALTH_COLOR(teamHealthScore);
    return (_jsxs("section", { className: "insights-panel", children: [_jsxs("div", { className: "insights-panel__header", children: [_jsx("h2", { className: "section-title", style: { marginBottom: 0 }, children: "Team Insights" }), _jsxs("div", { className: "insights-panel__badges", children: [_jsxs("span", { className: "insights-panel__health-badge", style: { background: `${color}22`, color, border: `1px solid ${color}` }, children: ["Health ", teamHealthScore, "/100 \u2014 ", HEALTH_LABEL(teamHealthScore)] }), aiGenerated && aiProvider && (_jsxs("span", { className: "insights-panel__ai-badge", children: ["\u2726 ", PROVIDER_LABEL[aiProvider] ?? aiProvider] }))] })] }), _jsx("p", { className: "insights-panel__summary", children: summary }), _jsxs("div", { className: "insights-panel__signals", children: [bottleneck !== 'none' && (_jsxs("div", { className: "insights-signal insights-signal--warn", children: [_jsx("span", { className: "insights-signal__icon", children: "\u26A0" }), _jsx("span", { children: bottleneckDetail })] })), workTypeImbalance && (_jsxs("div", { className: "insights-signal insights-signal--warn", children: [_jsx("span", { className: "insights-signal__icon", children: "\u26A0" }), _jsx("span", { children: workTypeDetail })] })), bottleneck === 'none' && !workTypeImbalance && (_jsxs("div", { className: "insights-signal insights-signal--ok", children: [_jsx("span", { className: "insights-signal__icon", children: "\u2713" }), _jsx("span", { children: "No workflow bottlenecks or work-type imbalances detected." })] }))] })] }));
}
