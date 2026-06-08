import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const PRESETS = [
    { label: 'Last 30 days', value: 'last30' },
    { label: 'Current quarter', value: 'currentQuarter' },
    { label: 'Last 90 days', value: 'last90' },
];
export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, onPreset, }) {
    const handleStart = (e) => onStartChange(e.target.value);
    const handleEnd = (e) => onEndChange(e.target.value);
    const handlePreset = (e, preset) => {
        e.preventDefault();
        onPreset(preset);
    };
    return (_jsxs("div", { className: "date-range-picker", children: [_jsx("div", { className: "date-range-picker__presets", children: PRESETS.map((p) => (_jsx("button", { type: "button", className: "btn btn--ghost", onClick: (e) => handlePreset(e, p.value), children: p.label }, p.value))) }), _jsxs("div", { className: "date-range-picker__inputs", children: [_jsxs("label", { className: "date-range-picker__label", children: ["From", _jsx("input", { type: "date", value: startDate, max: endDate, onChange: handleStart, className: "date-range-picker__input" })] }), _jsx("span", { className: "date-range-picker__sep", children: "\u2013" }), _jsxs("label", { className: "date-range-picker__label", children: ["To", _jsx("input", { type: "date", value: endDate, min: startDate, onChange: handleEnd, className: "date-range-picker__input" })] })] })] }));
}
