<!--
  SYNC IMPACT REPORT
  ==================
  Version change: 1.0.0 → 1.1.0
  Modified principles: none renamed
  Added sections:
    - Principle VI. In-Memory SQLite Storage Law (new)
  Removed sections: none
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ Constitution Check section covers new principle
    - .specify/templates/spec-template.md ✅ No changes required (principle-agnostic)
    - .specify/templates/tasks-template.md ✅ No changes required (principle-agnostic)
    - .specify/templates/checklist-template.md ✅ No changes required
    - README.md ⚠ pending — Architecture section describes JSON file cache; must be
      updated when the storage migration is implemented to reflect in-memory SQLite.
    - docs/FUNCTIONAL_SPEC.md ⚠ pending — Section 6.1/6.2 data-flow diagrams and
      REQ-4.8.1-1 reference per-developer JSON cache files; these must be revised in
      a follow-up spec amendment once implementation is underway.
  Follow-up TODOs:
    - SPEC: Revise REQ-4.8.1-1, REQ-4.8.4-1, and section 6 data-flow to replace
      JSON-file references with in-memory SQLite semantics.
    - CODE: Migrate DB/cache/metricsCache.ts and jobs/metricsSync.ts from JSON files
      to in-memory SQLite using node:sqlite (Node ≥ 22.5) or better-sqlite3 fallback.
-->

# AI Productivity Tool Constitution

## Core Principles

### I. Spec-to-Code Traceability (NON-NEGOTIABLE)

Every requirement in `docs/FUNCTIONAL_SPEC.md` MUST carry a `<!-- REQ-* -->` comment tag.
Every `it()` test block MUST have a `// @req REQ-*` comment on the immediately preceding line.
The traceability checker (`npx tsx scripts/check-traceability.ts`) MUST pass with zero
untested, orphaned, or untagged items before any merge to master.

**Rationale**: The project surfaces developer productivity metrics used in performance
conversations. A gap between spec and test means a metric could silently change semantics —
the traceability gate makes that impossible.

### II. Boundary-First Security

All data crossing a trust boundary MUST be validated before it flows into business logic.
Trust boundaries are: HTTP request bodies and query params, Jira API responses, Bitbucket
API responses, file reads from `data/`, and environment variables at startup.

- HTTP inputs: validated with typed schemas in `WEB/guardrails/`
- API responses: typed via `types/index.ts` interfaces; unknown shapes must be handled
- No credentials or PII in logs — redact before logging
- No string concatenation into SQL, shell commands, or external URLs

**Rationale**: On-premises deployments run on corporate networks but still face insider
threats and misconfigured proxies. The tool stores no user data but does proxy credentials
and issue keys — leaking those into logs would be a compliance issue.

### III. Working-Hours Accuracy

All elapsed-time metrics MUST use the leave-adjusted business-hours formula:
`effectiveHours = rawWorkingHours × (1 − 33/261)` applied after counting only
Monday–Friday 09:00–17:00 windows.

Deviations (e.g., a timezone-aware variant) MUST be gated behind a named constant
or config flag, not inline magic numbers.

**Rationale**: The 33/261 discount is the contractual leave entitlement used for
capacity planning. If any metric silently uses wall-clock time, comparisons between
developers in different timezones or on different leave schedules produce misleading
numbers. The formula is specified in REQ-4.4.5-2 and enforced in `cycleTime.ts`.

### IV. Opt-In Extensibility

New metric families MUST be gated behind a boolean config flag (e.g.,
`SPEC_METRICS_ENABLED`). When disabled, the aggregator MUST return `undefined`
for that metric's field — never a zero or a default that looks like real data.
The flag MUST default to `false` in `.env.example`.

**Rationale**: Each new metric family adds at least one API call per developer per
request. Teams running the tool against large orgs cannot absorb sudden latency
increases from an opt-out model. New capabilities should not change the performance
envelope for users who have not asked for them.

### V. Simplicity Over Abstraction

Implement the simplest approach that satisfies the current requirement.
No speculative abstractions, no defensive code for scenarios that cannot happen,
no new external libraries when the standard library or an already-imported package
suffices. Three similar lines of code are better than a premature helper.

A bug fix MUST NOT include surrounding refactors. A feature MUST NOT include
unrelated cleanup. Changes MUST be limited to what the task requires.

**Rationale**: The codebase is maintained by a small team. Unnecessary abstraction
increases cognitive load for the next person touching the code and makes diffs
harder to review.

### VI. In-Memory SQLite Storage Law (NON-NEGOTIABLE)

Transient metrics and operational caching MUST be stored in a single in-memory
SQLite database instance (`:memory:`). Writing computed analytics or cache entries
directly to the local JSON file system is **forbidden**.

Specifically:
- Per-developer metrics result cache MUST be held in SQLite, not in
  `data/cache/metrics-result/*.json` files.
- Sync run logs MUST be stored in SQLite, not in `data/sync-logs/*.json` files.
- The in-memory database is process-scoped and intentionally non-durable; it resets
  on server restart. Background sync exists precisely to repopulate it.
- Persistent operational **configuration** (e.g., `data/sync-config.json`) is exempt
  — it is not analytics and must survive restarts.

Implementation constraint — keep dependencies minimal:
- Prefer `node:sqlite` (built-in, Node.js ≥ 22.5, no `package.json` entry needed).
- If the runtime Node version is below 22.5, use `better-sqlite3` (one package,
  synchronous API, zero transitive deps). No ORM, no query builder.
- A single `DB/store/inMemoryDb.ts` module MUST own the singleton connection and
  schema initialisation. All other modules import from there — never open a second
  connection.

**Rationale**: JSON file I/O introduces race conditions on concurrent writes (two
sync batches writing the same developer file), requires atomic tmp-file rename
gymnastics, scatters state across the filesystem making it hard to inspect or reset,
and bleeds implementation details into CI environments. A single in-memory SQLite
instance eliminates all of these: writes are serialised by SQLite's WAL, the full
state is inspectable with one `SELECT`, and the process boundary is the only cleanup
needed.

## Quality & Safety Standards

- **TypeScript strict mode** is on. No `any` escapes without a justifying comment.
- **Vitest** is the sole test runner for both backend (`tests/`) and frontend (`UI/src/test/`).
  Tests run in CI on every push to master via `.github/workflows/ci.yml`.
- **No secrets committed.** `data/`, `.env`, `*.key`, `*.pem`, and `coverage/` are
  git-ignored. The `.env.example` file MUST contain only safe placeholder values.
- **Structured errors only.** `throw new AppError(...)` with a typed payload.
  Never `throw new Error('something broke')`.
- **Leave-adjustment constant** (`33/261`) MUST NOT be duplicated. It lives in
  `BL/metrics/cycleTime.ts` and is imported wherever needed.
- **Single SQLite connection.** The in-memory database singleton MUST be initialised
  once at server startup in `DB/store/inMemoryDb.ts`. PRs that open additional
  connections or write JSON cache files MUST be rejected.

## Development Workflow

1. **Read before writing.** Before modifying any function, identify its callers.
   For impact analysis use the code-review-graph MCP tools (`get_impact_radius`,
   `query_graph`) before Grep/Glob/Read.
2. **Spec first, then tests, then code.** For any new REQ-* requirement: add the
   spec tag, write the failing test (tagged `// @req`), then implement.
3. **Run the traceability checker** before every commit that touches spec, tests,
   or business logic: `npx tsx scripts/check-traceability.ts`.
4. **CI must be green.** Never merge a branch where `npm run build` or
   `npx vitest run` fails.
5. **Small, reviewable PRs.** A PR that touches more than 3 unrelated concerns
   MUST be split.

## Governance

This constitution supersedes `CLAUDE.md`, `README.md`, and any other informal
guidance when they conflict. Amendments follow this procedure:

1. Propose the change in a PR description with a rationale.
2. Increment the version according to semver rules:
   - **MAJOR** — principle removed, renamed, or definition materially narrowed.
   - **MINOR** — new principle or section added; existing principle expanded.
   - **PATCH** — clarification, wording, or typo fix with no semantic change.
3. Update this file and run `/speckit-constitution` to propagate changes.
4. All open plan and spec documents MUST be re-checked against the updated principles
   before the amending PR is merged.

Compliance is verified by the traceability checker (automated) and by code review
(manual). Reviewers MUST reject PRs that violate Principles I–VI without a documented
exception in the PR description.

**Version**: 1.1.0 | **Ratified**: 2026-06-07 | **Last Amended**: 2026-06-07
