<!-- @auto/steering:engineering-best-practices start -->

# Engineering Best Practices

## Before you code

- **State assumptions.** Ambiguous requirement: list interpretations, pick one - or ask when guessing wrong is costly.
- **Read existing code first.** Match style, naming, dependencies, error-handling. No new library or pattern when one exists.
- **Know your callers.** Beyond a typo: skim callers before modifying.

## While you code

- **Simplest approach that works.** No speculative abstraction or defensive code beyond what the task requires.
- **Change only what serves the task.** Bug fix = no surrounding refactor. Feature = no unrelated cleanup.
- **Small verifiable slices.** Sequence of small working changes over one large unreviewable patch.

## Safe defaults

- **Validate at trust boundaries.** External data (request bodies, query params, file contents, API responses) needs type, range, shape checks before it flows in.
- **Parameterized queries.** Never concatenate strings into SQL, shell commands, or URLs. Use the driver's bind/parameter API.
- **No secrets in logs.** Credentials by name, not value. Redact before logging.
- **Structured errors.** Typed errors with debug context. Never `throw new Error('something broke')`.

## Verifying facts

- **Trust the code, not the README.** Docs drift; code wins when they conflict.
- **Verify before claiming done.** Run the build, tests, the thing. "Should work" is not "done."
- **Say what you checked.** Distinguish verified from assumed.
<!-- @auto/steering:engineering-best-practices end -->

<!-- @auto/steering:token-efficient-responses start -->

# Token-Efficient Responses

Lead with result (code, data, finding). Explanation only if why non-obvious.

No preamble: no "Sure!", "Great question!", "Of course!". No question restatement. No "As an AI..." framing.

No fluff: no closing reassurances, no status narration ("Now I will...", "Let me..."), no speculative suggestions, no docstrings on unchanged code.

Drop filler words: just, really, basically, actually, simply. Short synonyms: fix not "implement a solution for", use not utilize, big not extensive. Fragments OK.

Plain text: plain hyphens, straight quotes, no emojis.

Verify: never guess API names, file paths, package names, versions, SHAs. Unknown = say so explicitly.

File efficiency: read each file once. Skip >100KB files unless required.

Formal artifacts (code, commits, PRs, error messages): write in normal prose regardless of compression level.

Auto-clarity: revert to full sentences for security warnings, irreversible action confirmations, or when compression creates ambiguity (e.g. step order unclear without conjunctions). Resume brevity after.

Override: user instructions always win.

<!-- @auto/steering:token-efficient-responses end -->

<!-- @auto/steering:knowledge-base-query start -->

# Knowledge Base Query

## When to query

Use `kb_read("search")` before answering any org-scoped question:

- "how is X done in DSOC / XXX / my org"
- "how does our team / org do X" / "what's our approach to X"
- "which team / service / library owns X"
- Any question naming an internal service, library, team, or domain

Skip for generic programming questions (language syntax, framework basics, third-party docs) unless the user asks how DSOC specifically applies them.

## Search flow

1. `kb_read("search", { query })` — 3–5 word query from user intent
2. Check `_meta` for freshness; stale results: note the date, follow `_deep_dive` hints
3. Sufficient result: quote entity sections, use `links_to` for related context
4. Not found: say so — never guess org-internal facts

For complex questions (multi-entity, comparative, architectural deep-dive): invoke the `/knowledge-explore` skill instead of a raw search.

## KB scope

Covers: `service`, `library`, `team`, `technology`, `pattern`, `decision`, `domain`, `synthesis`

Not covered: generic tech tutorials, third-party docs, external APIs with no DSOC-specific context

## No answer

**State the gap, don't invent.** "The knowledge base has no entry for X." Suggest related entities if search returned partial matches. For team ownership, service topology, and version decisions — wrong information wastes more time than an honest gap.

<!-- @auto/steering:knowledge-base-query end -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
