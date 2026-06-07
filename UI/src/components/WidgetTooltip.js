import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
/**
 * Small (?) icon that shows a floating tooltip panel on hover/focus.
 * Position flips to avoid clipping at viewport edges.
 */
export function WidgetTooltip({ content }) {
    const [visible, setVisible] = useState(false);
    const btnRef = useRef(null);
    const tipRef = useRef(null);
    const [above, setAbove] = useState(false);
    useEffect(() => {
        if (!visible || !btnRef.current || !tipRef.current)
            return;
        const btnRect = btnRef.current.getBoundingClientRect();
        const tipHeight = tipRef.current.offsetHeight;
        const spaceBelow = window.innerHeight - btnRect.bottom;
        setAbove(spaceBelow < tipHeight + 16);
    }, [visible]);
    // Close on Escape or outside click
    useEffect(() => {
        if (!visible)
            return;
        const handler = (e) => {
            if (e instanceof KeyboardEvent && e.key === 'Escape')
                setVisible(false);
            if (e instanceof MouseEvent &&
                btnRef.current && !btnRef.current.contains(e.target) &&
                tipRef.current && !tipRef.current.contains(e.target)) {
                setVisible(false);
            }
        };
        document.addEventListener('keydown', handler);
        document.addEventListener('mousedown', handler);
        return () => {
            document.removeEventListener('keydown', handler);
            document.removeEventListener('mousedown', handler);
        };
    }, [visible]);
    return (_jsxs("span", { className: "widget-tooltip-wrap", children: [_jsx("button", { ref: btnRef, type: "button", className: "widget-tooltip-btn", "aria-label": "Widget info", "aria-expanded": visible, onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false), onFocus: () => setVisible(true), onBlur: () => setVisible(false), onClick: () => setVisible((v) => !v), children: "?" }), visible && (_jsx("div", { ref: tipRef, role: "tooltip", className: `widget-tooltip-panel${above ? ' widget-tooltip-panel--above' : ''}`, children: content }))] }));
}
