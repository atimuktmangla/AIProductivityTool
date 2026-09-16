# AI Architecture

This document explains where and how AI is used in AIProductivityTool, and —
just as importantly — where it is deliberately **not** used. The guiding
principle is that AI enhances a system that is fully correct without it.

> **One-line summary:** every number on the dashboard is computed by
> deterministic TypeScript. The LLM only writes an optional prose narrative on
> top of numbers that already exist. If the LLM is disabled or fails, the
> product still works and still tells the truth.

---

## 1. Design principle: deterministic core, AI at the edge

Engineering-productivity metrics are a domain where **wrong numbers are worse
than no numbers**. A manager acting on a hallucinated cycle-time figure makes a
bad decision with confidence. So the architecture puts a hard wall between:

- **Computation** — deterministic, tested, reproducible. Never touches an LLM.
- **Narration** — an optional natural-language summary of that computation.

The LLM lives only in the narration layer, and even there it is optional.

```
Jira / Bitbucket data
        │
        ▼
 Deterministic metric engine        ← backend/metrics/*  (pure functions, unit-tested)
        │
        ├─────────────► Dashboard widgets (numbers, charts, tables)
        │
        ▼
 Rule-based insight baseline        ← AI/skills/insightsSummary.ts (computeBaseInsights)
        │
        ▼
 Optional LLM narrative             ← AI/providers/llmProvider.ts (only if enabled + key present)
        │  (on failure → fall back to rule-based summary, silently)
        ▼
 Insights panel
```

---

## 2. What is deterministic (never sent to an LLM)

All of the following are pure, tested TypeScript in `backend/metrics/` and
`AI/skills/insightsSummary.ts` (`computeBaseInsights`):

- Commit throughput, lines changed
- Cycle time, pickup delay, review lifecycle (working-hours math with leave
  adjustment)
- Review depth (bot-filtered)
- Work-type breakdown (features / bugs / infra)
- Code-quality composite score
- Spec-driven metrics (phased lead times, regressions, first-pass yield,
  adherence score)
- The **team health score** and the **rule-based insight summary** (top
  contributor, bottleneck detection, work-type imbalance)

Because these are pure functions, they are covered by fast, deterministic unit
tests (`tests/unit/cycleTime.test.ts`, `workType.test.ts`, `codeQuality.test.ts`,
`specMetrics.test.ts`, `reviewMetrics.test.ts`, …).

---

## 3. What the LLM does

When `AI_INSIGHTS_ENABLED=true` **and** an `AI_API_KEY` is present, the insights
skill calls the configured provider once per report to rewrite the rule-based
summary into a concise 3–4 sentence manager-facing narrative
(`AI/skills/insightsSummary.ts` → `buildPrompt` → `callLlm`).

Key properties:

- **The rule-based baseline is computed first, unconditionally.** The LLM
  receives that baseline as context and is asked only to narrate it.
- **The prompt forbids inventing data** and asks for prose, not raw numbers.
- **The LLM output replaces only the `summary` string.** Every structured field
  (`teamHealthScore`, `bottleneck`, `workTypeImbalance`, …) remains the
  deterministic value. The LLM cannot change a metric.
- **`aiGenerated` / `aiProvider` flags** are returned so the UI can label
  AI-written text honestly.

---

## 4. Provider abstraction

`AI/providers/llmProvider.ts` exposes a single `callLlm(provider, apiKey,
prompt)` function over three providers:

| Provider  | Model                        | Notes                    |
|-----------|------------------------------|--------------------------|
| anthropic | `claude-haiku-4-5`           | default, fastest         |
| openai    | `gpt-4o-mini`                |                          |
| gemini    | `gemini-2.0-flash`           | cheapest                 |

Each call has a 30s timeout, a 600-token output cap, and validates the response
shape before returning (throws if the provider returns no text block). Provider
selection is validated in `env.ts` (`parseProvider`) and falls back to
`anthropic` on an unrecognised value.

---

## 5. Failure handling

The insights feature is designed to **never break a report**:

```ts
if (aiInsightsEnabled && aiApiKey) {
  try {
    const aiSummary = await callLlm(...);
    return { ...base, summary: aiSummary, aiGenerated: true, aiProvider };
  } catch (err) {
    // log a warning, fall through to the rule-based summary
  }
}
return { ...base, aiGenerated: false };
```

- LLM timeout, 5xx, malformed response, or missing key → the report returns the
  deterministic rule-based summary with `aiGenerated: false`. The user still
  gets a complete, correct report.
- Transient failures on the **data-fetch** side (Jira/Bitbucket 5xx, 429,
  network blips) are handled separately by `databaselayer/http/retry.ts`
  (`withRetry`) — exponential backoff, capped attempts, retry only on transient
  error classes. It is a retry helper, not an autonomous agent.

---

## 6. Hallucination and prompt-injection posture

- **Hallucination containment:** the LLM cannot alter any metric — it only
  produces a display string derived from numbers computed elsewhere. The worst
  case of a hallucinated narrative is a misleading sentence next to correct
  numbers, and the panel is labelled as AI-generated. There is no agentic loop,
  no tool-calling, and no action taken on LLM output.
- **Prompt-injection surface:** the prompt is assembled from **numeric
  aggregates and developer display names**, not from free-text fields (Jira
  descriptions, commit messages, PR comments are not sent). This keeps the
  injection surface minimal. If free-text fields are ever added to the prompt,
  they must be treated as untrusted and delimited/escaped accordingly.

---

## 7. Data-egress boundary

When AI insights are **on**, the following leaves your network to the chosen
provider:

- Per-developer aggregates: commit count, PR count, cycle/pickup hours, quality
  score, work-type counts, and (if spec metrics on) spec-adherence figures
- Developer **display names**

The following is **never sent**: source code, commit diffs, Jira ticket bodies,
PR comment text, credentials/tokens, or customer data.

When AI insights are **off** (the default), **nothing leaves your network** —
the rule-based summary is used and no external LLM call is made.

---

## 8. Human-in-the-loop

This tool is read-only and advisory: it computes and narrates, it does not act.
Humans remain in the loop by design — the dashboard surfaces metrics and an
optional narrative, and a manager decides what to do. There are no automated
actions (no ticket edits, no notifications, no gating) taken on the basis of AI
output. This is the appropriate HITL posture for a metrics/insights tool; an
agentic extension (e.g. auto-drafting a retro) would require an explicit
approval step before any external side effect.

---

## 9. Naming note

An earlier version placed the retry helper at `AI/subagents/retryAgent.ts` and
called it a "retry subagent". It was neither AI-related nor an agent — just an
exponential-backoff retry wrapper — so it now lives at
`databaselayer/http/retry.ts` alongside the HTTP client it serves. The
`agent`/`subagent` vocabulary is reserved for genuinely agentic components, of
which this project has none by design (see §1 and ADR-0006).
