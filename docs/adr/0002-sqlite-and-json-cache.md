# ADR-0002: SQLite + JSON file cache instead of an external database

**Status:** Accepted

## Context

The tool caches per-developer metric results and sync-run logs so that repeated
dashboard queries load in sub-seconds instead of re-hitting Jira and Bitbucket.
It runs as a single-node, internal, on-prem service. It needs durable-enough
storage that survives a restart, but has no multi-node, high-write, or
horizontal-scaling requirement.

## Decision

Use two local storage mechanisms, no external database:

- **JSON file cache** (`databaselayer/cache/`) — one file per developer +
  date-range, written atomically (temp file + rename). Human-inspectable,
  trivially portable, easy to evict by month.
- **SQLite via better-sqlite3** (`databaselayer/store/appStore.ts`) — persistent
  store for metrics cache and sync logs that benefits from indexed queries and
  transactional writes; survives restart; zero server to operate.

## Alternatives considered

- **PostgreSQL / MySQL.** Rejected: adds an operational dependency (a server to
  run, back up, secure) with no benefit at single-node scale. Over-engineering
  for a portfolio/internal tool.
- **In-memory only.** Rejected: cache and sync history would not survive a
  restart, defeating the "sub-second repeat load" goal.
- **JSON files only (no SQLite).** Workable, but indexed/transactional access
  for sync logs and metrics is cleaner in SQLite.

## Trade-offs

- (+) Zero infra to operate; clone-and-run.
- (+) `better-sqlite3` is synchronous and fast for this workload.
- (−) `better-sqlite3` is a native module — it must be rebuilt against the local
  Node ABI (`npm rebuild better-sqlite3`) if the Node version changes. This is
  documented and is the price of a fast embedded store.
- (−) Not suitable if the tool ever needs multi-node deployment — that would be
  a new ADR.

## Consequences

- Deployment is a single container/process with a mounted data volume.
- CI and local dev must run `npm rebuild` after a Node upgrade.
