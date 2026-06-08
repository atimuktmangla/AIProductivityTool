export function WelcomePanel() {
  return (
    <div className="welcome-panel">
      <div className="welcome-panel__hero">
        <h2 className="welcome-panel__heading">Developer Metrics Dashboard</h2>
        <p className="welcome-panel__sub">
          A unified view of engineering throughput, code quality, and workflow health for your
          team — pulled live from Jira and Bitbucket. Run an ad-hoc report right here, or head
          to the <strong>Sync Jobs</strong> tab to schedule automatic overnight data syncs so
          reports load instantly from cache.
        </p>
      </div>

      <div className="welcome-panel__steps">
        <h3 className="welcome-panel__section-title">How to run a report</h3>
        <ol className="welcome-panel__step-list">
          <li className="welcome-panel__step">
            <span className="welcome-panel__step-num">1</span>
            <div>
              <strong>Pick team members</strong>
              <p>
                Search and select one or more developers from the left panel. Use "Select all"
                to include every Bitbucket user. Your selection is saved between sessions so
                recurring reports start pre-filled.
              </p>
            </div>
          </li>
          <li className="welcome-panel__step">
            <span className="welcome-panel__step-num">2</span>
            <div>
              <strong>Scope repositories (optional)</strong>
              <p>
                Click a project pill (Step 1) to scan all repos in that project, then
                optionally drill into specific repositories via the repo checklist (Step 2).
                Leave both blank for Tier 3 auto-discovery, which finds repos from each
                developer's Bitbucket activity profile automatically.
              </p>
            </div>
          </li>
          <li className="welcome-panel__step">
            <span className="welcome-panel__step-num">3</span>
            <div>
              <strong>Set the date range</strong>
              <p>
                Use a quick preset — Last 30 days, Last 90 days, Current quarter — or enter
                exact start and end dates. Enable the "Compare with previous period" toggle to
                show delta arrows next to every metric.
              </p>
            </div>
          </li>
          <li className="welcome-panel__step">
            <span className="welcome-panel__step-num">4</span>
            <div>
              <strong>Click Run report</strong>
              <p>
                Results appear in seconds. If a background sync has run recently, metrics
                load from the per-developer cache with no API calls needed. All time
                metrics use working hours (Mon–Fri 09:00–17:00) with automatic leave
                adjustment.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <div className="welcome-panel__metrics">
        <h3 className="welcome-panel__section-title">What you'll see</h3>
        <div className="welcome-panel__metric-grid">
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#9650;</span>
            <div>
              <strong>Throughput</strong>
              <p>Commits, PRs merged, and lines changed per developer — the raw output
              signal across the selected period.</p>
            </div>
          </div>
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#9201;</span>
            <div>
              <strong>Cycle Time</strong>
              <p>Pickup delay (time until first review), review lifecycle, and total cycle
              time — shows exactly where work stalls in the pipeline.</p>
            </div>
          </div>
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#10003;</span>
            <div>
              <strong>Code Quality Score</strong>
              <p>Composite 0–100 score from four signals: critical/security issue resolution,
              PR approval rate, PR focus (size discipline), and rework stability. Rewards
              quality over raw volume.</p>
            </div>
          </div>
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#9783;</span>
            <div>
              <strong>Work Type Breakdown</strong>
              <p>Features vs Bugs vs Infra &amp; Tech Debt, sourced from Jira issue types
              linked to each PR. Highlights whether the team is firefighting or building.</p>
            </div>
          </div>
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#9776;</span>
            <div>
              <strong>Contributor Table</strong>
              <p>Side-by-side comparison of every selected developer with sortable columns,
              quality badges, and a click-through drawer showing the full PR history.</p>
            </div>
          </div>
          <div className="welcome-panel__metric-card">
            <span className="welcome-panel__metric-icon">&#128161;</span>
            <div>
              <strong>Team Insights</strong>
              <p>Automatically generated summary flagging the top contributor, bottlenecks
              in the review pipeline, work-type imbalance, and an overall team health
              score — with optional AI narrative.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="welcome-panel__tip">
        <h3 className="welcome-panel__section-title">Speed tip: use Sync Jobs for instant reports</h3>
        <p className="welcome-panel__sub" style={{ fontSize: '0.85rem' }}>
          Switch to the <strong>Sync Jobs</strong> tab to schedule a daily or weekly background
          sync for your team. Once a sync has run, every dashboard query loads from a
          per-developer JSON cache — no live Bitbucket API calls, sub-second load times even
          for large teams. You can also trigger an immediate sync from that tab and monitor
          per-batch run logs.
        </p>
      </div>
    </div>
  );
}
