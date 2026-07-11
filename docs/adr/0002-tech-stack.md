# ADR 0002 — Node/Express API + React/Vite client, non-default ports

**Status:** Accepted · 2026-07-11

## Context
The analyser must (a) stream-parse ~2 GB of JSONL transcripts in `~/.claude/projects/`
quickly, (b) serve a rich dashboard, (c) install with a single `npm install` on any
machine that already runs Claude Code (which guarantees Node.js is present), and
(d) avoid the default web ports per project requirements (must sit in 11000–17999).

## Decision
- **Backend:** Node.js ≥22.5 + Express 4, ES modules, listening on **127.0.0.1:15801**.
  Single language across the repo; Node's stream/readline handles multi-GB JSONL
  without loading files in memory.
- **Frontend:** React 18 + Vite dev server on **port 15800**, proxying `/api` → 15801.
  Recharts for charts, react-router for pages.
- **No Python service for the ML part** — the forecaster is implemented in pure JS
  (see ADR 0004), keeping the install to one `npm install`.
- Dependencies are deliberately minimal: `express` (server); `react`, `react-dom`,
  `react-router-dom`, `recharts` (client); dev-only `vite`, `vitest`,
  `@testing-library/react`, `c8`, `concurrently`.

## Consequences
- One-command start (`npm run dev`), no toolchain beyond Node.
- Ports 15800/15801 are fixed in `server/src/config.js` and `client/vite.config.js`;
  both are overridable via `PORT`/`API_PORT` env vars but stay inside 11000–17999
  by default.
- If the ML needs outgrow JS (see ADR 0004 alternatives), a Python sidecar becomes
  a new ADR.
