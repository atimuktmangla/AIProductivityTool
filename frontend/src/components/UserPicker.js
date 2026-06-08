import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { Skeleton } from './Skeleton.js';
function initials(displayName) {
    return displayName
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
}
const API_HEADERS = { 'X-Api-Key': import.meta.env.VITE_API_KEY };
async function fetchUsers(params, signal) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const r = await fetch(`/api/dashboard/users?${qs}`, { signal, headers: API_HEADERS });
    if (!r.ok)
        throw new Error(`Failed to load users (${r.status})`);
    return r.json();
}
export function UserPicker({ selectedUsers, onChange }) {
    const [allUsers, setAllUsers] = useState([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        // Phase 1: fetch first 10 immediately so the picker feels instant
        fetchUsers({ limit: 10 }, signal)
            .then((first10) => {
            setAllUsers(first10);
            setLoading(false);
            // Phase 2: fetch the rest and append without disrupting existing items
            return fetchUsers({ start: 10 }, signal);
        })
            .then((rest) => {
            if (rest.length > 0) {
                setAllUsers((prev) => [...prev, ...rest]);
            }
        })
            .catch((e) => {
            if (e instanceof DOMException && e.name === 'AbortError')
                return;
            setError(e instanceof Error ? e.message : 'Failed to load users');
            setLoading(false);
        });
        return () => controller.abort();
    }, []);
    const filtered = filter
        ? allUsers.filter((u) => u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
            u.name.toLowerCase().includes(filter.toLowerCase()))
        : allUsers;
    const toggleUser = useCallback((slug) => {
        onChange(selectedUsers.includes(slug)
            ? selectedUsers.filter((s) => s !== slug)
            : [...selectedUsers, slug]);
    }, [selectedUsers, onChange]);
    const selectAll = useCallback(() => onChange(filtered.map((u) => u.name)), [filtered, onChange]);
    const clearAll = useCallback(() => onChange([]), [onChange]);
    const handleFilterChange = useCallback((e) => setFilter(e.target.value), []);
    if (error) {
        return _jsx("div", { className: "user-picker__error", role: "alert", children: error });
    }
    return (_jsxs("div", { className: "user-picker", children: [_jsxs("div", { className: "user-picker__search", children: [_jsx("input", { type: "search", placeholder: "Search users\u2026", value: filter, onChange: handleFilterChange, className: "user-picker__input", "aria-label": "Search users" }), _jsxs("div", { className: "user-picker__bulk-actions", children: [_jsx("button", { type: "button", onClick: selectAll, className: "btn btn--ghost", children: "Select all" }), _jsx("button", { type: "button", onClick: clearAll, className: "btn btn--ghost", children: "Clear" })] })] }), _jsx("div", { className: "user-picker__list", role: "listbox", "aria-multiselectable": "true", children: loading
                    ? Array.from({ length: 6 }).map((_, i) => (_jsxs("div", { className: "user-picker__item user-picker__item--skeleton", children: [_jsx(Skeleton, { width: "2rem", height: "2rem", className: "user-picker__avatar-skeleton" }), _jsx(Skeleton, { width: "60%", height: "0.9rem" })] }, i)))
                    : filtered.map((user) => {
                        const selected = selectedUsers.includes(user.name);
                        return (_jsxs("div", { role: "option", "aria-selected": selected, className: `user-picker__item${selected ? ' user-picker__item--selected' : ''}`, onClick: () => toggleUser(user.name), onKeyDown: (e) => e.key === 'Enter' && toggleUser(user.name), tabIndex: 0, children: [_jsx("span", { className: "user-picker__avatar", "aria-hidden": "true", children: initials(user.displayName) }), _jsx("span", { className: "user-picker__name", children: user.displayName }), selected && _jsx("span", { className: "user-picker__check", "aria-hidden": "true", children: "\u2713" })] }, user.name));
                    }) }), selectedUsers.length > 0 && (_jsxs("p", { className: "user-picker__count", children: [selectedUsers.length, " selected"] }))] }));
}
