# ADR 0003 — SQLite storage via the Node built-in `node:sqlite`

**Status:** Accepted · 2026-07-11

## Context
Requirement 7: analysis results must be persisted in a database so the dashboard does
not re-parse ~2 GB of transcripts on every load, with a Refresh action that
re-analyses on demand. Candidates: `better-sqlite3` (native addon), `sql.js` (wasm),
Postgres (server), a JSON cache file, or Node's built-in `node:sqlite`.

## Decision
Use **`node:sqlite` (`DatabaseSync`)**, available unflagged since Node 23.4 and
present in the Node 22.5+ line we target.

- Zero third-party/native dependencies — no node-gyp, no prebuilt-binary matrix,
  which matters for an open-source install-and-run tool.
- Synchronous API is a good fit: the analyser is a batch writer, the API layer does
  small indexed reads.
- Real SQL with prepared statements satisfies the parameterised-query rule and makes
  aggregations (daily costs, per-model rollups) trivial.

Schema (see `server/src/db.js`): `projects`, `sessions`, `session_model_usage`,
`daily_usage`, `improvements`, `meta`. Incremental refresh keys on
`(file_mtime_ms, file_size)` per transcript file; unchanged files are skipped.

## Consequences
- Requires Node ≥22.5 (enforced via `engines`).
- `node:sqlite` is newer than `better-sqlite3`; if a missing feature bites us we can
  swap drivers behind `db.js` — the SQL itself is portable.
- DB file lives at `server/data/analyser.db`, gitignored; deleting it is a safe
  "full reset" (next refresh rebuilds it).
