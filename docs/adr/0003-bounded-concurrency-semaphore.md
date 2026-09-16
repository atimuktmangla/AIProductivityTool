# ADR-0003: Global semaphore for on-prem API fan-out

**Status:** Accepted

## Context

A single `/metrics` request can fan out into hundreds of parallel calls to
Bitbucket and Jira: `N developers × M repos × (commits + PRs + activities)`. The
README notes 9 users × 4 project keys can generate 500+ parallel requests.
On-prem Atlassian servers are not elastic cloud endpoints — flooding them causes
timeouts, connection resets, and degraded service for everyone else on the
instance.

## Decision

Route **all** Bitbucket/Jira calls through `databaselayer/client/atlassianFetch.ts`,
which enforces a single global semaphore capping total in-flight requests
(`HTTP_CONCURRENCY`, default 12), backed by a per-host socket pool
(`maxSockets: 32`). Additional per-request and per-developer concurrency knobs
(`METRICS_CONCURRENCY`, `REPO_CONCURRENCY`) shape the fan-out above the
semaphore. Every call is also wrapped in exponential-backoff retry
(`withRetry`).

## Alternatives considered

- **Unbounded `Promise.all`.** Simplest, but the failure mode described above
  makes it unacceptable against on-prem servers.
- **A full job queue (BullMQ / Redis).** Rejected: adds infrastructure and
  complexity far beyond what an in-process semaphore needs to solve. Over-
  engineering (see project's "do not over-engineer" guidance).
- **Per-service rate limiting only.** Insufficient — the risk is aggregate
  in-flight count across all services, which a single global semaphore controls
  directly.

## Trade-offs

- (+) One tunable knob (`HTTP_CONCURRENCY`) governs total load on the on-prem
  server — the single most important safety valve.
- (+) Socket reuse (keep-alive pool) avoids connection-setup overhead.
- (−) A global semaphore is a process-local construct; it would not coordinate
  across multiple instances (acceptable — this is a single-node tool, see
  ADR-0002).

## Consequences

- Large reports run slower but reliably, instead of fast-then-failing.
- The semaphore + retry + typed-error mapping is the core resilience story.
