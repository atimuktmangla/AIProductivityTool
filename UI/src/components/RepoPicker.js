import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
export function RepoPicker({ selectedRepoTargets, selectedProjects, onRepoTargetsChange, onProjectsChange, }) {
    const [allProjects, setAllProjects] = useState([]);
    const [repoList, setRepoList] = useState([]);
    const [projLoading, setProjLoading] = useState(true);
    const [repoLoading, setRepoLoading] = useState(false);
    const [repoFilter, setRepoFilter] = useState('');
    const [error, setError] = useState(null);
    const repoAbortRef = useRef(null);
    // Tier 1 is active when chips exist; Tier 2 is active when only project pills exist
    const tier1Active = selectedRepoTargets.length > 0;
    const tier2Active = !tier1Active && selectedProjects.length > 0;
    const tier3Active = !tier1Active && !tier2Active;
    // Load all project keys once on mount
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/dashboard/projects', { signal: controller.signal, headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY } })
            .then((r) => {
            if (!r.ok)
                throw new Error(`Failed to load projects (${r.status})`);
            return r.json();
        })
            .then((keys) => { setAllProjects(keys); setProjLoading(false); })
            .catch((e) => {
            if (e instanceof DOMException && e.name === 'AbortError')
                return;
            setError(e instanceof Error ? e.message : 'Failed to load projects');
            setProjLoading(false);
        });
        return () => controller.abort();
    }, []);
    // Load repos whenever selected projects change
    useEffect(() => {
        if (selectedProjects.length === 0) {
            setRepoList([]);
            return;
        }
        repoAbortRef.current?.abort();
        const controller = new AbortController();
        repoAbortRef.current = controller;
        setRepoLoading(true);
        setRepoFilter('');
        fetch(`/api/dashboard/repos?projectKeys=${selectedProjects.join(',')}`, { signal: controller.signal, headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY } })
            .then((r) => {
            if (!r.ok)
                throw new Error(`Failed to load repos (${r.status})`);
            return r.json();
        })
            .then((repos) => { setRepoList(repos); setRepoLoading(false); })
            .catch((e) => {
            if (e instanceof DOMException && e.name === 'AbortError')
                return;
            setError(e instanceof Error ? e.message : 'Failed to load repos');
            setRepoLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjects.join(',')]);
    const toggleProject = useCallback((key) => onProjectsChange(selectedProjects.includes(key)
        ? selectedProjects.filter((k) => k !== key)
        : [...selectedProjects, key]), [selectedProjects, onProjectsChange]);
    const toggleRepoChip = useCallback((target) => {
        const key = `${target.projectKey}/${target.repoSlug}`;
        const exists = selectedRepoTargets.some((t) => `${t.projectKey}/${t.repoSlug}` === key);
        onRepoTargetsChange(exists
            ? selectedRepoTargets.filter((t) => `${t.projectKey}/${t.repoSlug}` !== key)
            : [...selectedRepoTargets, target]);
    }, [selectedRepoTargets, onRepoTargetsChange]);
    const removeChip = useCallback((target) => {
        const key = `${target.projectKey}/${target.repoSlug}`;
        onRepoTargetsChange(selectedRepoTargets.filter((t) => `${t.projectKey}/${t.repoSlug}` !== key));
    }, [selectedRepoTargets, onRepoTargetsChange]);
    const filteredRepos = repoFilter
        ? repoList.filter((r) => r.repoSlug.toLowerCase().includes(repoFilter.toLowerCase()) ||
            r.projectKey.toLowerCase().includes(repoFilter.toLowerCase()))
        : repoList;
    const selectAllRepos = useCallback(() => onRepoTargetsChange(filteredRepos), [filteredRepos, onRepoTargetsChange]);
    const clearChips = useCallback(() => onRepoTargetsChange([]), [onRepoTargetsChange]);
    if (error)
        return _jsx("div", { className: "repo-picker__error", role: "alert", children: error });
    return (_jsxs("div", { className: "repo-picker", children: [_jsxs("div", { className: "repo-picker__step-label", children: [_jsx("span", { className: "repo-picker__step-num", children: "1" }), " Select Projects"] }), _jsx("div", { className: "repo-picker__hint", children: selectedProjects.length === 0
                    ? 'None selected — all projects considered'
                    : `${selectedProjects.length} selected` }), _jsx("div", { className: "repo-picker__tag-list", children: projLoading
                    ? _jsx("span", { className: "repo-picker__loading", children: "Loading projects\u2026" })
                    : allProjects.map((key) => (_jsx("button", { type: "button", onClick: () => toggleProject(key), className: `repo-picker__tag${selectedProjects.includes(key) ? ' repo-picker__tag--active' : ''}${tier1Active ? ' repo-picker__tag--dimmed' : ''}`, title: tier1Active ? 'Clear repo chips to use project filter' : undefined, children: key }, key))) }), selectedProjects.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "repo-picker__step-label repo-picker__step-label--repos", children: [_jsx("span", { className: "repo-picker__step-num", children: "2" }), " Select Repos", _jsx("span", { className: "repo-picker__step-opt", children: "(optional \u2014 leave blank for all)" })] }), repoLoading
                        ? _jsx("span", { className: "repo-picker__loading", children: "Loading repos\u2026" })
                        : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "repo-picker__repo-search", children: [_jsx("input", { type: "search", placeholder: "Filter repos\u2026", value: repoFilter, onChange: (e) => setRepoFilter(e.target.value), className: "user-picker__input", "aria-label": "Filter repositories" }), _jsxs("div", { className: "user-picker__bulk-actions", children: [_jsx("button", { type: "button", onClick: selectAllRepos, className: "btn btn--ghost", children: "All" }), _jsx("button", { type: "button", onClick: clearChips, className: "btn btn--ghost", children: "Clear" })] })] }), _jsxs("div", { className: "repo-picker__repo-list", role: "listbox", "aria-multiselectable": "true", children: [filteredRepos.map((r) => {
                                            const key = `${r.projectKey}/${r.repoSlug}`;
                                            const active = selectedRepoTargets.some((t) => `${t.projectKey}/${t.repoSlug}` === key);
                                            return (_jsxs("div", { role: "option", "aria-selected": active, tabIndex: 0, className: `repo-picker__repo-item${active ? ' repo-picker__repo-item--selected' : ''}`, onClick: () => toggleRepoChip(r), onKeyDown: (e) => e.key === 'Enter' && toggleRepoChip(r), children: [_jsx("span", { className: "repo-picker__repo-project", children: r.projectKey }), _jsx("span", { className: "repo-picker__repo-sep", children: "/" }), _jsx("span", { className: "repo-picker__repo-name", children: r.repoSlug }), active && _jsx("span", { className: "user-picker__check", "aria-hidden": "true", children: "\u2713" })] }, key));
                                        }), filteredRepos.length === 0 && (_jsx("div", { className: "repo-picker__empty", children: "No repos found" }))] })] }))] })), selectedRepoTargets.length > 0 && (_jsxs("div", { className: "repo-picker__chips-section", children: [_jsx("div", { className: "repo-picker__chips-label", children: "Selected targets" }), _jsx("div", { className: "repo-picker__chips", children: selectedRepoTargets.map((t) => {
                            const key = `${t.projectKey}/${t.repoSlug}`;
                            return (_jsxs("span", { className: "repo-picker__chip", children: [key, _jsx("button", { type: "button", className: "repo-picker__chip-remove", onClick: () => removeChip(t), "aria-label": `Remove ${key}`, children: "\u00D7" })] }, key));
                        }) })] })), _jsxs("div", { className: `repo-picker__tier-badge repo-picker__tier-badge--${tier1Active ? '1' : tier2Active ? '2' : '3'}`, children: [tier1Active && '🟢 Tier 1 — using exact repos', tier2Active && '🟡 Tier 2 — repos filtered by user activity', tier3Active && '🔵 Tier 3 — auto-discover from user profiles'] })] }));
}
