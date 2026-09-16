# ADR-0006: Name the retry helper honestly (not an "agent")

**Status:** Accepted

## Context

`AI/subagents/retryAgent.ts` exports `withRetry`, an exponential-backoff retry
wrapper for transient Atlassian API failures. Its path and comments call it a
"retry subagent". In an AI-engineering portfolio, the words "agent" and
"subagent" carry a specific meaning — an autonomous component that plans and/or
calls tools. This helper does neither; it is a control-flow utility. Mislabeling
it risks looking like résumé-driven naming to an AI-literate reviewer.

## Decision

Moved the module from `AI/subagents/retryAgent.ts` to
`databaselayer/http/retry.ts` (keeping the honest `withRetry` export name),
placing it next to the HTTP client it serves. Reserved the `agent`/`subagent`
vocabulary for genuinely agentic components — of which this project currently
has none; its AI usage is a single bounded narration call, by design (see
ADR-0001).

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

- Import in `databaselayer/client/atlassianFetch.ts` and the dynamic imports in
  `tests/unit/remainingRequirements.test.ts` updated to the new path.
- `AI/subagents/` removed; `AI/` now contains only `providers/` and `skills/`.
- `docs/AI_ARCHITECTURE.md` §9, README, and DETAILED_DESIGN updated to match.
