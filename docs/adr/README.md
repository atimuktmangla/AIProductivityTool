# Architecture Decision Records

Short records of the significant technical decisions in this project and the
trade-offs behind them. Each ADR is immutable once accepted; a reversal is a new
ADR that supersedes the old one.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-deterministic-core-ai-at-the-edge.md) | Deterministic metric core, AI only at the edge | Accepted |
| [0002](0002-sqlite-and-json-cache.md) | SQLite + JSON file cache instead of an external database | Accepted |
| [0003](0003-bounded-concurrency-semaphore.md) | Global semaphore for on-prem API fan-out | Accepted |
| [0004](0004-api-key-auth.md) | Shared-secret API key auth for an internal single-tenant tool | Accepted |
| [0005](0005-tls-self-signed-opt-in.md) | TLS verification on by default, self-signed opt-in | Accepted |
| [0006](0006-rename-retry-agent.md) | Name the retry helper honestly (not an "agent") | Proposed |
