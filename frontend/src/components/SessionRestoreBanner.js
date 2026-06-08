import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SessionRestoreBanner({ session, onRestore, onDismiss }) {
    const userLabel = session.users.length === 1
        ? session.users[0]
        : `${session.users[0]} +${session.users.length - 1} more`;
    return (_jsxs("div", { className: "session-banner", role: "status", children: [_jsxs("p", { className: "session-banner__text", children: ["Resume last session: ", _jsx("strong", { children: userLabel }), ' ', "\u00B7", ' ', _jsx("strong", { children: session.startDate }), " to ", _jsx("strong", { children: session.endDate })] }), _jsxs("div", { className: "session-banner__actions", children: [_jsx("button", { type: "button", className: "session-banner__btn session-banner__btn--restore", onClick: () => onRestore(session), children: "Restore" }), _jsx("button", { type: "button", className: "session-banner__btn session-banner__btn--dismiss", onClick: onDismiss, children: "Dismiss" })] })] }));
}
