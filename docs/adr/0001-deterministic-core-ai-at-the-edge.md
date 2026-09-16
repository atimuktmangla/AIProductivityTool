# ADR-0001: Deterministic metric core, AI only at the edge

**Status:** Accepted

## Context

The product reports engineering-productivity metrics (cycle time, review depth,
code quality, spec adherence) that managers use to make decisions. In this
domain a wrong-but-confident number is more harmful than a missing number. LLMs
are non-deterministic and can hallucinate, so any metric derived from an LLM
would be unreproducible and potentially misleading.

At the same time, a plain grid of numbers is hard to read quickly, and a
well-written narrative genuinely helps a busy manager.

## Decision

Compute every metric with deterministic, unit-tested TypeScript
(`backend/metrics/`, `AI/skills/insightsSummary.ts::computeBaseInsights`). Use an
LLM **only** to rewrite an already-computed rule-based summary into prose, and
only when explicitly enabled. The LLM output replaces a single `summary` string;
it can never change a structured metric value.

## Alternatives considered

- **LLM computes metrics from raw data.** Rejected: non-reproducible,
  unverifiable, expensive, and dangerous for decision-making.
- **No AI at all.** Viable and safe, but leaves the "so what?" narrative to the
  reader. The chosen design keeps this as the zero-cost default (rule-based
  summary) while allowing an optional upgrade.

## Trade-offs

- (+) Numbers are always correct, reproducible, and testable.
- (+) The product is fully functional with AI disabled.
- (−) The rule-based baseline must be maintained even though the LLM often
  produces nicer prose — but this baseline is also the LLM's grounding context,
  so it earns its keep.

## Consequences

- The insights skill always computes the deterministic baseline first.
- LLM failures degrade gracefully to the baseline (see ADR-0001 → AI_ARCHITECTURE §5).
- Tests can assert exact metric values without mocking an LLM.
