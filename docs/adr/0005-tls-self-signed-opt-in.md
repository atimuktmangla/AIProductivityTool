# ADR-0005: TLS verification on by default, self-signed opt-in

**Status:** Accepted

## Context

On-prem Jira and Bitbucket Server instances very often present self-signed or
internal-CA TLS certificates that Node's default trust store rejects
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN`). An earlier
version of the HTTP client hard-coded `rejectUnauthorized: false`, silently
disabling certificate verification for all outbound Atlassian calls. This "just
works" but is insecure by default and was undocumented.

## Decision

Default to secure (`rejectUnauthorized: true`). Introduce an explicit opt-out
env flag `ALLOW_SELF_SIGNED_CERTS` (default `false`). When set to `true`, the
dedicated HTTPS agent in `atlassianFetch.ts` disables verification **for
Atlassian calls only**, and the server logs a warning at startup so the choice
is never silent. Document the risk and the secure alternative
(`NODE_EXTRA_CA_CERTS`) in `SECURITY.md`.

## Alternatives considered

- **Keep `rejectUnauthorized: false` hard-coded.** Rejected: insecure by
  default, hides a real risk from anyone reading the repo, and looks like a
  concealed shortcut to a security reviewer.
- **Require `NODE_EXTRA_CA_CERTS` always (no bypass flag).** More secure, but
  raises the barrier for a quick internal spin-up. The opt-in flag keeps the
  fast path available while making it a conscious, logged decision.

## Trade-offs

- (+) Secure default; the insecure mode is explicit, logged, and documented.
- (+) The proper fix (`NODE_EXTRA_CA_CERTS`) is documented as the recommended
  path.
- (−) Operators on self-signed on-prem servers must set one extra flag — an
  acceptable, honest cost.

## Consequences

- New config field `allowSelfSignedCerts` in the typed `AppConfig`.
- `SECURITY.md` documents the flag, the MITM risk, and the CA-trust alternative.
