# ADR-0004: Shared-secret API key auth for an internal single-tenant tool

**Status:** Accepted

## Context

The backend exposes `/api` routes that return aggregated team metrics. It is
designed to run inside an organisation's network as a single-tenant internal
tool, alongside on-prem Jira and Bitbucket. It has no concept of individual
end-user accounts — everyone who can reach it is a trusted internal operator.

## Decision

Protect all `/api` routes with a single shared secret (`API_KEY`) sent in the
`X-Api-Key` header, enforced by `api/middleware/apiKeyAuth.ts`, combined with:
Helmet security headers, a CORS allowlist (`ALLOWED_ORIGIN`), a request rate
limiter, a 64 KB JSON body cap, and binding to `127.0.0.1` by default.

## Alternatives considered

- **OAuth2 / OIDC with per-user identity + RBAC.** Rejected for now: correct for
  a multi-tenant SaaS, but heavy over-engineering for a single-tenant internal
  dashboard with no per-user authorization requirement. Would add an identity
  provider dependency.
- **No auth (network-only).** Rejected: a shared key is a cheap, meaningful
  barrier and prevents accidental cross-origin or curious-colleague access.

## Trade-offs

- (+) Trivial to configure and operate; no identity infrastructure.
- (+) Adequate for the stated deployment model.
- (−) No per-user identity, RBAC, audit-by-user, or key rotation workflow.
- (−) A single leaked key grants full read access — mitigated by network
  placement and the ability to rotate the key.

## Consequences

- **Do not expose this service directly to the public internet** without adding
  a real auth layer in front of it. This limitation is stated plainly in
  `SECURITY.md`.
- If multi-user access is ever needed, that is a new ADR introducing OIDC + RBAC.
