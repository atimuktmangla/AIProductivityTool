# Portfolio Notes — AIProductivityTool

Internal notes on what this repository demonstrates and how to talk about it.
Not marketing copy. Honest framing only — nothing here claims production usage,
user counts, or business impact that the repo cannot support.

---

## Senior Engineering Manager signals

- **Technical strategy:** picked a right-sized architecture (single node,
  embedded SQLite + JSON cache, no orchestration platform) and defended each
  choice in an ADR rather than reaching for fashionable infra.
- **Engineering productivity:** the product itself is about making delivery
  health visible in working-hours terms — the domain is EM tooling.
- **Quality discipline:** typed config with fail-fast validation, input
  validation at the trust boundary, 255 passing tests (unit + integration),
  CI coverage gates, Playwright E2E with fake credentials, a custom
  requirement-traceability check.
- **Automation:** background sync job turns recurring live reports into
  sub-second cached reads.
- **System thinking:** clean layer separation keeps metric math free of
  transport/I/O concerns.

## Architecture signals

- **Integrations:** two independent on-prem systems (Jira, Bitbucket) with
  differing APIs, unified behind a data-access layer.
- **Reliability:** global concurrency semaphore + per-host socket pool +
  exponential-backoff retry + typed HTTP/network error mapping — a coherent
  resilience story for fragile, non-elastic on-prem endpoints.
- **Scalability posture (honest):** designed for single-node team-scale, with
  the multi-node boundary explicitly called out as a future ADR rather than
  pretended-away.
- **Security:** Helmet, CORS allowlist, shared-secret auth, rate limiting, body
  cap, localhost bind, TLS-secure-by-default with a documented opt-in.

## AI leadership signals

- **AI applied architecturally, not as a wrapper:** deterministic core, AI only
  at the narration edge; the LLM can never alter a metric.
- **Governance built in:** documented data-egress boundary (numeric aggregates
  only, off by default), hallucination containment, prompt-injection posture,
  and human-in-the-loop stance.
- **Provider abstraction:** one interface over Anthropic/OpenAI/Gemini with
  timeouts and response validation.
- **Intellectual honesty:** the repo flags its own naming misnomer (a retry
  helper labeled "subagent") and records the fix as an ADR — the opposite of
  résumé-driven inflation.

---

## Interview discussion points

Ten questions a senior interviewer might ask, with the trade-off in play and a
direction for a strong answer.

### 1. Why compute metrics deterministically instead of asking the LLM?
- **Trade-off:** LLM convenience/flexibility vs. correctness and reproducibility.
- **Direction:** in a decision-support tool, a confident wrong number is worse
  than no number; LLMs are non-deterministic; metrics must be testable and
  reproducible. AI adds value only where wrongness is cheap — the narrative.
  (ADR-0001)

### 2. A `/metrics` request can fan out to 500+ parallel API calls. How do you keep from taking down an on-prem Bitbucket?
- **Trade-off:** report latency vs. protecting a shared, non-elastic server.
- **Direction:** a single global semaphore caps total in-flight requests, backed
  by a keep-alive socket pool, with retry/backoff on transient errors. One knob
  (`HTTP_CONCURRENCY`) governs aggregate load. Slower-but-reliable beats
  fast-then-failing. (ADR-0003)

### 3. Why SQLite + JSON files instead of Postgres?
- **Trade-off:** operational simplicity vs. scale/features you don't need yet.
- **Direction:** single-node, team-scale, no multi-writer requirement; an
  external DB is pure operational overhead here. State the native-module rebuild
  cost honestly, and the multi-node exit criterion. (ADR-0002)

### 4. Your auth is a single shared API key. Isn't that weak?
- **Trade-off:** appropriate scope vs. gold-plating.
- **Direction:** it's a single-tenant internal tool with no per-user
  authorization need; shared secret + network placement + rate limiting is
  proportionate. Be explicit that it must not face the public internet without a
  real auth layer, and that RBAC/OIDC is a documented future ADR. (ADR-0004)

### 5. You disable TLS verification. Walk me through that.
- **Trade-off:** on-prem self-signed reality vs. MITM risk.
- **Direction:** it's now **off by default**, opt-in via `ALLOW_SELF_SIGNED_CERTS`,
  logged at startup, scoped to Atlassian calls only, with `NODE_EXTRA_CA_CERTS`
  documented as the secure alternative. Show the before (hard-coded) → after
  (opt-in) change. (ADR-0005, SECURITY.md)

### 6. What exactly leaves the network when AI insights are on?
- **Trade-off:** insight quality vs. data governance.
- **Direction:** numeric aggregates + display names only; never code, diffs,
  ticket text, or secrets; off by default. Point to the data-egress section of
  AI_ARCHITECTURE.md — being able to answer this precisely *is* the signal.

### 7. How do you handle an LLM timeout mid-report?
- **Trade-off:** feature richness vs. reliability.
- **Direction:** the rule-based summary is always computed first; an LLM failure
  falls through to it with `aiGenerated:false`. The report is never blocked by
  the optional layer.

### 8. Cycle time "in working hours with a 12.6% leave adjustment" — defend that.
- **Trade-off:** simplicity of wall-clock vs. credibility of the number.
- **Direction:** wall-clock cycle time punishes weekends/holidays and gets
  dismissed in a 1:1. Working-hours math + a leave discount makes the metric
  survivable under scrutiny. It's a documented, tunable assumption, not a
  hidden fudge.

### 9. Where's the prompt-injection risk, and why is it low here?
- **Trade-off:** rich context vs. attack surface.
- **Direction:** the prompt is built from numeric aggregates, not free-text
  fields (no ticket bodies / commit messages / PR comments), so the injection
  surface is minimal by construction. Note what would have to change if free
  text were ever added.

### 10. You call something a "subagent" that's just a retry loop. Why?
- **Trade-off:** honesty vs. impressive-sounding naming.
- **Direction:** own it — it's a naming mistake, flagged in AI_ARCHITECTURE §9
  and scheduled for rename in ADR-0006. This project has no autonomous agent,
  and pretending otherwise would be the wrong signal for an AI-leadership role.

### 11. (Bonus) How would you evolve this toward genuinely agentic?
- **Direction:** an agent that drafts a retro or flags at-risk PRs and *proposes*
  an action — gated behind explicit human approval before any side effect (the
  HITL boundary from AI_ARCHITECTURE §8). Keep the deterministic core; add the
  agent at the edge, never in the measurement path.

---

## Strongest interview stories (rank order)

1. **The semaphore.** Protecting a shared on-prem server from self-inflicted
   fan-out — concrete systems thinking with a single tunable safety valve.
2. **Deterministic-core / AI-at-the-edge.** The clearest evidence of applying AI
   with judgment rather than as a wrapper.
3. **Secure-by-default TLS change.** A real before→after security improvement with
   the reasoning documented.
4. **Working-hours metric design.** Domain empathy — building a number that
   survives a management conversation.
5. **Intellectual honesty (the naming ADR + this file).** Willingness to flag
   one's own overreach is itself a leadership signal.
