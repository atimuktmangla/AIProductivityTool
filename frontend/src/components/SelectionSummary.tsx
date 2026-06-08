import type { RepoTarget } from '../types/index.js';

interface SelectionSummaryProps {
  selectedUsers:       string[];
  selectedRepoTargets: RepoTarget[];
  selectedProjects:    string[];
  startDate:           string;
  endDate:             string;
}

export function SelectionSummary({
  selectedUsers,
  selectedRepoTargets,
  selectedProjects,
  startDate,
  endDate,
}: SelectionSummaryProps) {
  const tier = selectedRepoTargets.length > 0 ? 1 : selectedProjects.length > 0 ? 2 : 3;

  const tierLabel = {
    1: { text: 'Tier 1 — Exact repos',              cls: 'summary__tier--1' },
    2: { text: 'Tier 2 — Project-scoped discovery', cls: 'summary__tier--2' },
    3: { text: 'Tier 3 — User profile auto-discover', cls: 'summary__tier--3' },
  }[tier];

  return (
    <div className="summary">
      <div className="summary__header">
        <span className="summary__title">Current Selection</span>
        <span className={`summary__tier ${tierLabel.cls}`}>{tierLabel.text}</span>
      </div>

      <div className="summary__scroll">

        {/* Users */}
        <div className="summary__group">
          <div className="summary__group-label">
            Team members
            <span className="summary__count">{selectedUsers.length}</span>
          </div>
          {selectedUsers.length === 0
            ? <div className="summary__empty">None selected</div>
            : (
              <div className="summary__chips">
                {selectedUsers.map((u) => (
                  <span key={u} className="summary__chip summary__chip--user">{u}</span>
                ))}
              </div>
            )}
        </div>

        {/* Tier 1: Repo targets */}
        {tier === 1 && (
          <div className="summary__group">
            <div className="summary__group-label">
              Repos (exact)
              <span className="summary__count">{selectedRepoTargets.length}</span>
            </div>
            <div className="summary__chips">
              {selectedRepoTargets.map((t) => {
                const key = `${t.projectKey}/${t.repoSlug}`;
                return (
                  <span key={key} className="summary__chip summary__chip--repo">
                    <span className="summary__chip-project">{t.projectKey}</span>
                    <span className="summary__chip-sep">/</span>
                    {t.repoSlug}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Tier 2: Project keys */}
        {tier === 2 && (
          <div className="summary__group">
            <div className="summary__group-label">
              Projects
              <span className="summary__count">{selectedProjects.length}</span>
            </div>
            <div className="summary__chips">
              {selectedProjects.map((k) => (
                <span key={k} className="summary__chip summary__chip--project">{k}</span>
              ))}
            </div>
            <div className="summary__note">Repos filtered by user activity in date range</div>
          </div>
        )}

        {/* Tier 3: Auto */}
        {tier === 3 && (
          <div className="summary__group">
            <div className="summary__group-label">Repos</div>
            <div className="summary__note">Auto-discovered from user Bitbucket profiles</div>
          </div>
        )}

        {/* Date range */}
        <div className="summary__group">
          <div className="summary__group-label">Date range</div>
          <div className="summary__date-range">
            <span className="summary__chip summary__chip--date">{startDate}</span>
            <span className="summary__date-sep">→</span>
            <span className="summary__chip summary__chip--date">{endDate}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
