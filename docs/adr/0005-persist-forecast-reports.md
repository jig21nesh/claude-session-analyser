# ADR 0005 — Persist forecast reports in the database

**Status:** Accepted · 2026-07-11

## Context
ADR 0003 stores all *analysis* (sessions, per-model usage, per-day usage, improvements) in
SQLite, but forecasts were computed on demand per API request and discarded. That left one
report class outside the database, contradicting the "store everything so nothing re-loads"
requirement, and meant the grid-search re-ran on every dashboard visit.

## Decision
Add a `forecasts` table keyed by `horizon_days`, holding the model name, fit window,
backtest metrics, fitted parameters and the full serialized report (`result_json`), plus
`generated_at`.

- Every successful scan ends by recomputing and storing the default 30-day report
  (`scan-service` → `computeAndStoreForecast`).
- `GET /api/predictions` serves the stored report and recomputes only when none exists for
  the requested horizon or the analysis has been refreshed since (`generated_at` older than
  `meta.last_refresh_at`). Responses carry `fromStore` for observability.

## Consequences
- All analysis artefacts — sessions, model usage, daily usage, improvements, forecasts —
  now live in SQLite; API reads are instant and reproducible between refreshes.
- One stored report per horizon (replaced in place). If forecast *history* auditing is ever
  wanted (comparing what was predicted vs what happened), switch to append-plus-latest —
  that change would supersede this ADR.
