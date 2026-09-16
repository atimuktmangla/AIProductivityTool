# Project Story — AIProductivityTool

## Problem

Engineering leaders running on-prem Atlassian (Jira Server/DC + Bitbucket
Server/Stash) have the raw data to understand delivery health — commits, PRs,
review timings, issue types — but it is scattered across two systems, expressed
in wall-clock time (not working hours), and not linked into per-developer,
per-period views. Answering "where is our delivery bottleneck, and is it getting
better or worse?" typically means manual spreadsheet work or an expensive SaaS
that many enterprises cannot point at an internal, firewalled Bitbucket.

## Solution

A single-node, clone-and-run dashboard that pulls **live** data from on-prem
Jira and Bitbucket and computes SDLC metrics per developer and per period:

- Commit throughput and lines changed
- Cycle time, pickup delay, review lifecycle — in **working hours**, with a
  leave/holiday adjustment
- Review depth (bots excluded) and a composite code-quality score
- Work-type breakdown (features / bugs / infra) from Jira
- Optional **spec-driven metrics**: phased lead times, spec regressions,
  first-pass yield, spec-adherence score — derived from the Jira changelog
- Period-over-period deltas, a contributor comparison table, and an optional
  AI-written narrative summary
- A background sync job that pre-computes per-developer caches so repeat reports
  load in sub-seconds

## Target users

- **Engineering Managers / Directors** who want an objective, working-hours view
  of delivery health for coaching and planning conversations.
- **Platform / DevEx teams** who need this against an internal Bitbucket a SaaS
  tool cannot reach.

## Architecture (why this shape)

A clean four-layer split keeps the metric math independent of transport and I/O:

- `api/` — HTTP boundary (auth, rate limiting, input validation, logging)
- `backend/` — deterministic, unit-tested metric engine + typed config
- `databaselayer/` — all external I/O: a bounded-concurrency Atlassian client
  (semaphore + retry + typed errors) plus JSON/SQLite caching
- `AI/` — an optional narration layer over already-computed numbers

The decisions behind this shape are recorded as ADRs (`docs/adr/`): a global
semaphore to protect non-elastic on-prem servers from fan-out, SQLite+JSON
instead of an external DB for a single-node tool, shared-secret auth for the
single-tenant internal deployment model, and TLS-secure-by-default with an
opt-in self-signed path.

## AI role (precise)

- **AI is used** only to turn an already-computed, rule-based team summary into
  a concise manager-facing narrative — and only when explicitly enabled.
- **Deterministic logic** computes every metric and the baseline summary. The
  LLM cannot change a number.
- **No agents.** The project has no autonomous, tool-calling agent. Its AI usage
  is a single, bounded, well-contained narration call. (A retry helper is
  currently mislabeled "subagent" — this is flagged openly; see ADR-0006.)
- **MCP** is consumed as a *development aid* (the repo carries a code-review-graph
  config for AI-assisted review) but the app exposes no MCP server.
- **Context** sent to the LLM is numeric aggregates + developer display names
  only — never code, diffs, ticket bodies, or credentials.
- **Validation** happens before the LLM (deterministic metrics) and the LLM's
  output is displayed, never acted upon.
- **Failure handling:** LLM errors fall back silently to the rule-based summary;
  the report is always complete and correct.

Full detail: [`docs/AI_ARCHITECTURE.md`](docs/AI_ARCHITECTURE.md).

## Engineering value

- **Productivity visibility** without a SaaS or a manual spreadsheet pipeline.
- **Working-hours accuracy** — timings reflect actual working time, not weekends
  and holidays, so the numbers survive scrutiny in a 1:1.
- **Operational efficiency** — the sync job turns a 5–30s live report into a
  sub-second cached read for recurring team reviews.
- **Reliability against fragile on-prem endpoints** — the semaphore + retry
  design means large reports run reliably instead of overwhelming the server.

## Leadership value

This project demonstrates the ability to:

- Choose the *right-sized* architecture (single node, embedded storage, no
  Kubernetes) and defend it in writing (ADRs).
- Apply AI **surgically** — enhancing, not replacing, a correct deterministic
  system — and reason explicitly about hallucination, data egress, and
  human-in-the-loop.
- Treat an internal tool with production discipline: typed config, input
  validation, structured logging, security headers, CI with coverage gates and
  E2E, and an honest SECURITY.md.

> This repository is an example / reference implementation. It has not been
> validated against a specific production deployment, user count, or business
> outcome; any such claims are intentionally omitted. Items needing real-world
> validation are marked `TODO: Validate` where they appear.
