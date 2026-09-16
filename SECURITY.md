# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
privately. **Do not open a public issue for security problems.**

- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  (Security tab → "Report a vulnerability"), or
- Contact the maintainer directly through the email on their GitHub profile.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected version(s) or commit
- Any suggested remediation

## Response

- We aim to acknowledge reports within a few business days.
- Once confirmed, we will work on a fix and coordinate a disclosure timeline
  with you.
- Please give us reasonable time to address the issue before any public
  disclosure.

## Supported Versions

Security fixes are applied to the latest release on the default branch.
Older versions are not guaranteed to receive patches.

## Handling Secrets

Never commit secrets (tokens, API keys, passwords, connection strings) to this
repository. Use the `.env` file (git-ignored) for local configuration and refer
to `.env.example` for the required variables.

Credentials handled by this app:

- **Jira / Bitbucket Personal Access Tokens** — read from `JIRA_TOKEN` /
  `BITBUCKET_TOKEN`, sent as `Authorization: Bearer` headers to your on-prem
  servers only. Never logged.
- **`API_KEY`** — a shared secret every `/api` request must send in the
  `X-Api-Key` header. This is the app's only authentication mechanism (see
  Authentication below).
- **`AI_API_KEY`** — optional LLM provider key, used only when
  `AI_INSIGHTS_ENABLED=true`.

## Authentication model

The API is protected by a single shared secret (`API_KEY`) enforced on all
`/api` routes, plus a CORS allowlist (`ALLOWED_ORIGIN`), Helmet security
headers, a request rate limiter, and a 64 KB JSON body cap. The server binds to
`127.0.0.1` by default. This model is appropriate for an internal,
single-tenant, on-prem deployment. It is **not** multi-user auth — there is no
per-user identity, RBAC, or session management, and that is a deliberate scope
decision (see `docs/adr/`). Do not expose this service directly to the public
internet without adding a proper auth layer in front of it.

## TLS certificate verification (self-signed on-prem certs)

TLS certificate verification is **ON by default**. On-prem Jira and Bitbucket
Server instances frequently use self-signed or internal-CA certificates that
Node will reject. To tolerate them, set:

```
ALLOW_SELF_SIGNED_CERTS=true
```

When enabled, certificate validation is disabled **for outbound Jira/Bitbucket
calls only** (via a dedicated HTTPS agent in
`databaselayer/client/atlassianFetch.ts`). The app logs a warning at startup so
this is never silent.

**Risk:** disabling verification means a man-in-the-middle on the network path
to your Atlassian servers would not be detected. Only enable this on a trusted
internal network. The secure alternative is to add your internal CA to Node's
trust store (`NODE_EXTRA_CA_CERTS=/path/to/ca.pem`) and leave
`ALLOW_SELF_SIGNED_CERTS=false`.

## Data sent to third-party LLMs

When `AI_INSIGHTS_ENABLED=true`, the insights feature sends a prompt to the
configured provider (Anthropic / OpenAI / Gemini). The prompt contains
**aggregated, numeric team metrics** (per-developer commit counts, cycle-time
hours, work-type totals, spec-adherence scores) and developer display names — it
does **not** send source code, commit diffs, Jira ticket bodies, or credentials.
The feature is **off by default**; with it off, a local rule-based summary is
used and nothing leaves your network. See `docs/AI_ARCHITECTURE.md` for the full
data-flow boundary.
