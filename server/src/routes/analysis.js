import { Router } from 'express';
import { getMeta } from '../db.js';
import { cacheSavings } from '../pricing.js';
import { getForecast } from '../forecast-service.js';
import { FORECAST_DAYS_DEFAULT, FORECAST_DAYS_MAX } from '../config.js';
import { ok, fail, toBoundedInt } from './respond.js';

export function analysisRoutes(db, scanService) {
  const router = Router();

  router.get('/summary', (req, res) => {
    const totals = db.prepare(`
      SELECT COUNT(*) AS sessions,
             COALESCE(SUM(requests), 0) AS requests,
             COALESCE(SUM(user_messages), 0) AS user_messages,
             COALESCE(SUM(tool_calls), 0) AS tool_calls,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens,
             COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
             COALESCE(SUM(cache_5m_tokens + cache_1h_tokens), 0) AS cache_create_tokens,
             COALESCE(SUM(cost_usd), 0) AS cost_usd,
             MIN(started_at) AS first_activity,
             MAX(ended_at) AS last_activity
      FROM sessions
    `).get();
    const projectCount = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;

    const byModel = db.prepare(`
      SELECT model,
             SUM(requests) AS requests,
             SUM(input_tokens) AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cache_read_tokens) AS cache_read_tokens,
             SUM(cache_5m_tokens + cache_1h_tokens) AS cache_create_tokens,
             SUM(cost_usd) AS cost_usd
      FROM session_model_usage
      GROUP BY model
      ORDER BY cost_usd DESC
    `).all();

    let cacheSavedUsd = 0;
    for (const row of byModel) {
      cacheSavedUsd += cacheSavings(row.model, row.cache_read_tokens);
    }

    ok(res, {
      totals: { ...totals, projects: projectCount },
      by_model: byModel,
      cache_saved_usd: cacheSavedUsd,
      last_refresh_at: getMeta(db, 'last_refresh_at'),
    });
  });

  router.get('/daily-costs', (req, res) => {
    const projectId = toBoundedInt(req.query.project_id);
    if (projectId === undefined) return fail(res, 400, 'project_id must be a positive integer');
    const days = toBoundedInt(req.query.days, { min: 1, max: 730 });
    if (days === undefined) return fail(res, 400, 'days must be between 1 and 730');

    const base = `
      SELECT d.date AS date,
             SUM(d.cost_usd) AS cost,
             SUM(d.requests) AS requests,
             SUM(d.input_tokens) AS input_tokens,
             SUM(d.output_tokens) AS output_tokens,
             SUM(d.cache_read_tokens) AS cache_read_tokens,
             SUM(d.cache_create_tokens) AS cache_create_tokens
      FROM session_daily_usage d
      JOIN sessions s ON s.id = d.session_id
    `;
    const rows = projectId === null
      ? db.prepare(`${base} GROUP BY d.date ORDER BY d.date`).all()
      : db.prepare(`${base} WHERE s.project_id = ? GROUP BY d.date ORDER BY d.date`).all(projectId);

    const sliced = days === null ? rows : rows.slice(-days);
    ok(res, { days: sliced });
  });

  router.get('/predictions', (req, res) => {
    const horizon = toBoundedInt(req.query.days, { min: 1, max: FORECAST_DAYS_MAX });
    if (horizon === undefined) {
      return fail(res, 400, `days must be between 1 and ${FORECAST_DAYS_MAX}`);
    }
    // Served from the forecasts table; recomputed only after a fresh analysis.
    ok(res, getForecast(db, horizon ?? FORECAST_DAYS_DEFAULT));
  });

  router.get('/improvements', (req, res) => {
    const projectId = toBoundedInt(req.query.project_id);
    if (projectId === undefined) return fail(res, 400, 'project_id must be a positive integer');

    const base = `
      SELECT i.id, i.scope, i.project_id, i.session_id, i.category, i.severity,
             i.title, i.description, i.estimated_savings_usd,
             p.name AS project_name, s.session_id AS session_uuid
      FROM improvements i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN sessions s ON s.id = i.session_id
    `;
    const order = `
      ORDER BY CASE i.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               i.estimated_savings_usd DESC
    `;
    const rows = projectId === null
      ? db.prepare(base + order).all()
      : db.prepare(`${base} WHERE i.project_id = ? ${order}`).all(projectId);

    const totalSavings = rows.reduce((a, r) => a + (r.estimated_savings_usd || 0), 0);
    ok(res, { improvements: rows, total_estimated_savings_usd: totalSavings });
  });

  router.post('/refresh', (req, res) => {
    const force = req.query.force === 'true' || req.body?.force === true;
    const started = scanService.trigger({ force });
    if (!started) return fail(res, 409, 'a scan is already running');
    ok(res, { started: true, force }, 202);
  });

  router.get('/refresh-status', (req, res) => {
    ok(res, scanService.status());
  });

  return router;
}
