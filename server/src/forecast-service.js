import { forecastCosts } from './predictor.js';
import { getMeta } from './db.js';
import { FORECAST_DAYS_DEFAULT } from './config.js';

function dailyCostRows(db) {
  return db.prepare(`
    SELECT date, SUM(cost_usd) AS cost
    FROM session_daily_usage
    GROUP BY date
    ORDER BY date
  `).all().map((r) => ({ date: r.date, cost: r.cost }));
}

/** Compute a forecast from stored daily costs and persist it as a report. */
export function computeAndStoreForecast(db, horizonDays = FORECAST_DAYS_DEFAULT) {
  const result = forecastCosts(dailyCostRows(db), horizonDays);
  const generatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO forecasts
      (horizon_days, generated_at, model, history_days, total_forecast, params_json, metrics_json, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(horizon_days) DO UPDATE SET
      generated_at = excluded.generated_at,
      model = excluded.model,
      history_days = excluded.history_days,
      total_forecast = excluded.total_forecast,
      params_json = excluded.params_json,
      metrics_json = excluded.metrics_json,
      result_json = excluded.result_json
  `).run(
    horizonDays, generatedAt, result.model, result.historyDays, result.totalForecast,
    result.params ? JSON.stringify(result.params) : null,
    JSON.stringify(result.metrics),
    JSON.stringify(result)
  );
  return { ...result, generatedAt };
}

/**
 * Serve the stored forecast report for a horizon; recompute (and store) only
 * when no report exists or the analysis has been refreshed since it was built.
 */
export function getForecast(db, horizonDays = FORECAST_DAYS_DEFAULT) {
  const row = db.prepare(
    'SELECT generated_at, result_json FROM forecasts WHERE horizon_days = ?'
  ).get(horizonDays);
  const lastRefresh = getMeta(db, 'last_refresh_at');
  if (row && (!lastRefresh || row.generated_at >= lastRefresh)) {
    return { ...JSON.parse(row.result_json), generatedAt: row.generated_at, fromStore: true };
  }
  return { ...computeAndStoreForecast(db, horizonDays), fromStore: false };
}
