import { jsx as _jsx } from "react/jsx-runtime";
export function Skeleton({ width = '100%', height = '1rem', className = '' }) {
    return (_jsx("div", { className: `skeleton ${className}`, style: { width, height }, "aria-hidden": "true" }));
}
