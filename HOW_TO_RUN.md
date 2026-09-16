# How to run

AI-assisted developer-productivity dashboard: an Express + TypeScript backend
and a React (Vite) frontend that pull metrics from on-prem Jira and Bitbucket.

## Prerequisites

- Node.js 20+
- A `.env` file in the repo root (copy from the documented variables in
  `README.md` / `.env.example`). Required: `JIRA_BASE_URL`, `JIRA_TOKEN`,
  `BITBUCKET_BASE_URL`, `BITBUCKET_TOKEN`, `API_KEY`.

## Install

```bash
npm install
cd frontend && npm install && cd ..
```

## Run (development)

Backend (port 3000) and frontend (port 5173) run in two terminals:

```bash
# terminal 1 — backend
npm run dev

# terminal 2 — frontend
cd frontend
npm run dev
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` to the
backend automatically.

`run.cmd` (Windows) automates the above: it installs if needed, then starts the
backend and frontend in separate windows and opens the browser.

## Build (production)

```bash
npm run build                 # backend -> dist/
cd frontend && npm run build  # frontend -> frontend/dist/
```

## Test

```bash
npm test        # vitest (255 tests) + spec-to-test traceability gate
cd frontend && npm test   # frontend vitest (104 tests)
```

## Docker

```bash
docker compose up --build   # api on :3000, ui on :5173
```
