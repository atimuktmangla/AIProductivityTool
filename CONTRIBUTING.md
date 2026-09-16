# Contributing

Thanks for your interest in contributing. This guide covers setup, the local
workflow, and the checks that must pass before a pull request is merged.

## Prerequisites

- Node.js 20+
- Git

## Setup

```bash
git clone <your-fork-url>
cd AIProductivityTool
npm install --legacy-peer-deps
cp .env.example .env          # fill in your Jira/Bitbucket tokens
```

For the frontend:

```bash
cd frontend
npm install --legacy-peer-deps
```

## Local workflow

- `npm run dev` — start the backend
- `npm test` — run the test suite
- `npm run test:coverage` — run tests with coverage
- `npx tsc --noEmit` — type-check (run in both root and `frontend/`)
- `npm run build` — build

## Before opening a pull request

Run and confirm all of these pass locally:

```bash
npx tsc --noEmit
npm run build
npm run test:coverage
```

Both root and `frontend/` must type-check and build with zero errors, and the
coverage gate must pass.

## Pull request conventions

- Branch from `main` using a descriptive name (`fix/...`, `feat/...`, `docs/...`).
- Keep changes focused; one logical change per PR.
- Write a clear PR description: what changed, why, and how you tested it.
- Do not commit secrets. Keep tokens in `.env` (git-ignored).
- Ensure CI is green before requesting review.

## Reporting issues

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
