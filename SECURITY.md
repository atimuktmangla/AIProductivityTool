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
