# ADR-0006: Name the retry helper honestly (not an "agent")

**Status:** Proposed

## Context

`AI/subagents/retryAgent.ts` exports `withRetry`, an exponential-backoff retry
wrapper for transient Atlassian API failures. Its path and comments call it a
"retry subagent". In an AI-engineering portfolio, the words "agent" and
"subagent" carry a specific meaning — an autonomous component that plans and/or
calls tools. This helper does neither; it is a control-flow utility. Mislabeling
it risks looking like résumé-driven naming to an AI-literate reviewer.

## Decision (proposed)

Rename the module and symbol to reflect what it is — e.g.
`databaselayer/http/retry.ts` exporting `withRetry` — and reserve the
`agent`/`subagent` vocabulary for genuinely agentic components (of which this
project currently has none; its AI usage is a single bounded narration call, by
design — see ADR-0001).

## Alternatives considered

- **Leave it as-is.** Rejected: the honesty cost outweighs the churn of a
  rename.
- **Keep the path, fix only the comments.** Partial; the path itself
  (`AI/subagents/`) is the most visible part of the misnomer.

## Trade-offs

- (+) Naming matches behaviour; strengthens credibility on exactly the axis this
  portfolio is optimising for.
- (−) A rename touches imports in `atlassianFetch.ts` and any tests referencing
  the path.

## Consequences

- Tracked as a P2 follow-up. Until executed, `docs/AI_ARCHITECTURE.md` §9 and
  this ADR document the discrepancy openly.
