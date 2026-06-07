import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import type { RepoTarget } from '../types/index.js';

interface RepoPickerProps {
  selectedRepoTargets: RepoTarget[]; // Tier 1 chips
  selectedProjects:    string[];     // Tier 2 pills
  onRepoTargetsChange: (targets: RepoTarget[]) => void;
  onProjectsChange:    (keys: string[]) => void;
}

export function RepoPicker({
  selectedRepoTargets,
  selectedProjects,
  onRepoTargetsChange,
  onProjectsChange,
}: RepoPickerProps) {
  const [allProjects,  setAllProjects]  = useState<string[]>([]);
  const [repoList,     setRepoList]     = useState<RepoTarget[]>([]);
  const [projLoading,  setProjLoading]  = useState(true);
  const [repoLoading,  setRepoLoading]  = useState(false);
  const [repoFilter,   setRepoFilter]   = useState('');
  const [error,        setError]        = useState<string | null>(null);
  const repoAbortRef = useRef<AbortController | null>(null);

  // Tier 1 is active when chips exist; Tier 2 is active when only project pills exist
  const tier1Active = selectedRepoTargets.length > 0;
  const tier2Active = !tier1Active && selectedProjects.length > 0;
  const tier3Active = !tier1Active && !tier2Active;

  // Load all project keys once on mount
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/projects', { signal: controller.signal, headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY as string } })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load projects (${r.status})`);
        return r.json() as Promise<string[]>;
      })
      .then((keys) => { setAllProjects(keys); setProjLoading(false); })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load projects');
        setProjLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Load repos whenever selected projects change
  useEffect(() => {
    if (selectedProjects.length === 0) { setRepoList([]); return; }

    repoAbortRef.current?.abort();
    const controller = new AbortController();
    repoAbortRef.current = controller;

    setRepoLoading(true);
    setRepoFilter('');
    fetch(`/api/dashboard/repos?projectKeys=${selectedProjects.join(',')}`, { signal: controller.signal, headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY as string } })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load repos (${r.status})`);
        return r.json() as Promise<RepoTarget[]>;
      })
      .then((repos) => { setRepoList(repos); setRepoLoading(false); })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load repos');
        setRepoLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjects.join(',')]);

  const toggleProject = useCallback(
    (key: string) =>
      onProjectsChange(
        selectedProjects.includes(key)
          ? selectedProjects.filter((k) => k !== key)
          : [...selectedProjects, key],
      ),
    [selectedProjects, onProjectsChange],
  );

  const toggleRepoChip = useCallback(
    (target: RepoTarget) => {
      const key = `${target.projectKey}/${target.repoSlug}`;
      const exists = selectedRepoTargets.some((t) => `${t.projectKey}/${t.repoSlug}` === key);
      onRepoTargetsChange(
        exists
          ? selectedRepoTargets.filter((t) => `${t.projectKey}/${t.repoSlug}` !== key)
          : [...selectedRepoTargets, target],
      );
    },
    [selectedRepoTargets, onRepoTargetsChange],
  );

  const removeChip = useCallback(
    (target: RepoTarget) => {
      const key = `${target.projectKey}/${target.repoSlug}`;
      onRepoTargetsChange(selectedRepoTargets.filter((t) => `${t.projectKey}/${t.repoSlug}` !== key));
    },
    [selectedRepoTargets, onRepoTargetsChange],
  );

  const filteredRepos = repoFilter
    ? repoList.filter((r) =>
        r.repoSlug.toLowerCase().includes(repoFilter.toLowerCase()) ||
        r.projectKey.toLowerCase().includes(repoFilter.toLowerCase()),
      )
    : repoList;

  const selectAllRepos = useCallback(() => onRepoTargetsChange(filteredRepos), [filteredRepos, onRepoTargetsChange]);
  const clearChips     = useCallback(() => onRepoTargetsChange([]), [onRepoTargetsChange]);

  if (error) return <div className="repo-picker__error" role="alert">{error}</div>;

  return (
    <div className="repo-picker">

      {/* ── STEP 1: Project Key Pills ── */}
      <div className="repo-picker__step-label">
        <span className="repo-picker__step-num">1</span> Select Projects
      </div>
      <div className="repo-picker__hint">
        {selectedProjects.length === 0
          ? 'None selected — all projects considered'
          : `${selectedProjects.length} selected`}
      </div>

      <div className="repo-picker__tag-list">
        {projLoading
          ? <span className="repo-picker__loading">Loading projects…</span>
          : allProjects.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleProject(key)}
                className={`repo-picker__tag${selectedProjects.includes(key) ? ' repo-picker__tag--active' : ''}${tier1Active ? ' repo-picker__tag--dimmed' : ''}`}
                title={tier1Active ? 'Clear repo chips to use project filter' : undefined}
              >
                {key}
              </button>
            ))}
      </div>

      {/* ── STEP 2: Repo Checklist (cascades from Step 1) ── */}
      {selectedProjects.length > 0 && (
        <>
          <div className="repo-picker__step-label repo-picker__step-label--repos">
            <span className="repo-picker__step-num">2</span> Select Repos
            <span className="repo-picker__step-opt">(optional — leave blank for all)</span>
          </div>

          {repoLoading
            ? <span className="repo-picker__loading">Loading repos…</span>
            : (
              <>
                <div className="repo-picker__repo-search">
                  <input
                    type="search"
                    placeholder="Filter repos…"
                    value={repoFilter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setRepoFilter(e.target.value)}
                    className="user-picker__input"
                    aria-label="Filter repositories"
                  />
                  <div className="user-picker__bulk-actions">
                    <button type="button" onClick={selectAllRepos} className="btn btn--ghost">All</button>
                    <button type="button" onClick={clearChips}     className="btn btn--ghost">Clear</button>
                  </div>
                </div>

                <div className="repo-picker__repo-list" role="listbox" aria-multiselectable="true">
                  {filteredRepos.map((r) => {
                    const key    = `${r.projectKey}/${r.repoSlug}`;
                    const active = selectedRepoTargets.some((t) => `${t.projectKey}/${t.repoSlug}` === key);
                    return (
                      <div
                        key={key}
                        role="option"
                        aria-selected={active}
                        tabIndex={0}
                        className={`repo-picker__repo-item${active ? ' repo-picker__repo-item--selected' : ''}`}
                        onClick={() => toggleRepoChip(r)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleRepoChip(r)}
                      >
                        <span className="repo-picker__repo-project">{r.projectKey}</span>
                        <span className="repo-picker__repo-sep">/</span>
                        <span className="repo-picker__repo-name">{r.repoSlug}</span>
                        {active && <span className="user-picker__check" aria-hidden="true">✓</span>}
                      </div>
                    );
                  })}
                  {filteredRepos.length === 0 && (
                    <div className="repo-picker__empty">No repos found</div>
                  )}
                </div>
              </>
            )}
        </>
      )}

      {/* ── Selected Targets (Tier 1 chips) ── */}
      {selectedRepoTargets.length > 0 && (
        <div className="repo-picker__chips-section">
          <div className="repo-picker__chips-label">Selected targets</div>
          <div className="repo-picker__chips">
            {selectedRepoTargets.map((t) => {
              const key = `${t.projectKey}/${t.repoSlug}`;
              return (
                <span key={key} className="repo-picker__chip">
                  {key}
                  <button
                    type="button"
                    className="repo-picker__chip-remove"
                    onClick={() => removeChip(t)}
                    aria-label={`Remove ${key}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tier indicator ── */}
      <div className={`repo-picker__tier-badge repo-picker__tier-badge--${tier1Active ? '1' : tier2Active ? '2' : '3'}`}>
        {tier1Active && '🟢 Tier 1 — using exact repos'}
        {tier2Active && '🟡 Tier 2 — repos filtered by user activity'}
        {tier3Active && '🔵 Tier 3 — auto-discover from user profiles'}
      </div>

    </div>
  );
}
