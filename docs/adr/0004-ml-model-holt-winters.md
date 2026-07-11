# ADR 0004 — Cost forecasting with Holt-Winters triple exponential smoothing

**Status:** Accepted · 2026-07-11

## Context
Requirement 8: predict future Claude Code spend from historical daily costs. The data
has specific properties that constrain the model choice:

- **Small:** weeks-to-months of daily points (30–300 observations), not thousands.
- **Weekly seasonality:** developer activity drops at weekends and spikes midweek.
- **Trend:** usage typically grows (or decays) as adoption changes.
- **Noisy and bursty:** a single heavy refactor day can be a 10× outlier.
- **Local-first product:** the forecast must compute in-process, instantly, on every
  refresh, with no Python runtime, no GPU, no training pipeline.

Candidates evaluated:

| Model | Verdict |
|---|---|
| Naive mean / last-value | Baseline only — ignores trend and weekday pattern |
| Linear regression | Captures trend, blind to seasonality; fine fallback for tiny histories |
| **Holt-Winters (triple exponential smoothing, additive, damped trend)** | **Chosen** — explicitly models level + trend + weekly season, works from ~2 weeks of data, closed-form, interpretable |
| ARIMA / SARIMA | Comparable accuracy but needs order selection (p,d,q) and more data to be stable; heavy to implement correctly in JS |
| Prophet | Great with holidays/changepoints but drags in a Python/Stan runtime — kills the single-`npm install` story |
| LSTM / gradient boosting | Needs orders of magnitude more data than a personal usage history provides; opaque; training infra for marginal gain |

## Decision
Implement **Holt-Winters additive with a damped trend and weekly (m=7) seasonality**
in pure JavaScript (`server/src/predictor.js`), with automatic degradation:

1. **≥ 14 daily points** → Holt-Winters. Smoothing parameters (α, β, γ, φ) are chosen
   by grid search minimising one-step-ahead RMSE over the history (a rolling-origin
   backtest, i.e. time-series cross-validation).
2. **5–13 points** → ordinary least-squares linear regression on day index.
3. **< 5 points** → historical mean.

The API reports which model ran, its backtest MAE/RMSE, and an 80% / 95% prediction
interval derived from the backtest residual standard deviation (widening with √h for
horizon h). Forecasts are clamped at ≥ 0 (cost cannot be negative).

## Consequences
- Forecasts are interpretable ("level + trend + weekday effect") and the Help page
  can explain them honestly — a stated project requirement.
- Grid search over a small parameter lattice is O(few-thousand fits) on ≤365 points:
  milliseconds in practice.
- Known limits, documented in the UI: no holiday awareness, additive seasonality
  assumes roughly constant weekly amplitude, regime changes (new job, new model
  pricing) take ~a season to absorb.
- **Revisit trigger:** once a user has >6 months of dense history, SARIMA or Prophet
  (as an optional Python sidecar) would likely beat Holt-Winters; that change would
  supersede this ADR.
