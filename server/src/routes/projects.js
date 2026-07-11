import { Router } from 'express';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../config.js';
import { ok, fail, toBoundedInt, isValidSessionId } from './respond.js';

const SESSION_COLUMNS = `
  s.id, s.session_id, s.project_id, s.started_at, s.ended_at,
  s.user_messages, s.assistant_messages, s.tool_calls, s.requests,
  s.input_tokens, s.output_tokens, s.cache_read_tokens,
  s.cache_5m_tokens, s.cache_1h_tokens, s.cost_usd, s.sidechain_cost_usd,
  s.models, s.git_branch, s.cli_version
`;

export function projectRoutes(db) {
  const router = Router();

  router.get('/projects', (req, res) => {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.path,
             COUNT(s.id) AS sessions,
             COALESCE(SUM(s.requests), 0) AS requests,
             COALESCE(SUM(s.input_tokens), 0) AS input_tokens,
             COALESCE(SUM(s.output_tokens), 0) AS output_tokens,
             COALESCE(SUM(s.cache_read_tokens), 0) AS cache_read_tokens,
             COALESCE(SUM(s.cost_usd), 0) AS cost_usd,
             MAX(s.ended_at) AS last_activity
      FROM projects p
      LEFT JOIN sessions s ON s.project_id = p.id
      GROUP BY p.id
      ORDER BY cost_usd DESC
    `).all();
    ok(res, { projects: rows });
  });

  router.get('/projects/:id', (req, res) => {
    const projectId = toBoundedInt(req.params.id);
    if (projectId === undefined || projectId === null) {
      return fail(res, 400, 'project id must be a positive integer');
    }
    const project = db.prepare('SELECT id, name, path, dir_name FROM projects WHERE id = ?').get(projectId);
    if (!project) return fail(res, 404, 'project not found');

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
      FROM sessions WHERE project_id = ?
    `).get(projectId);

    const byModel = db.prepare(`
      SELECT u.model,
             SUM(u.requests) AS requests,
             SUM(u.input_tokens) AS input_tokens,
             SUM(u.output_tokens) AS output_tokens,
             SUM(u.cache_read_tokens) AS cache_read_tokens,
             SUM(u.cost_usd) AS cost_usd
      FROM session_model_usage u
      JOIN sessions s ON s.id = u.session_id
      WHERE s.project_id = ?
      GROUP BY u.model
      ORDER BY cost_usd DESC
    `).all(projectId);

    ok(res, { project, totals, by_model: byModel });
  });

  router.get('/projects/:id/sessions', (req, res) => {
    const projectId = toBoundedInt(req.params.id);
    if (projectId === undefined || projectId === null) {
      return fail(res, 400, 'project id must be a positive integer');
    }
    const rawPage = toBoundedInt(req.query.page, { min: 1, max: 1e6 });
    const rawPageSize = toBoundedInt(req.query.page_size, { min: 1, max: PAGE_SIZE_MAX });
    if (rawPage === undefined || rawPageSize === undefined) {
      return fail(res, 400, `page must be >= 1 and page_size between 1 and ${PAGE_SIZE_MAX}`);
    }
    const page = rawPage ?? 1;
    const pageSize = rawPageSize ?? PAGE_SIZE_DEFAULT;
    const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!exists) return fail(res, 404, 'project not found');

    const total = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE project_id = ?').get(projectId).n;
    const rows = db.prepare(`
      SELECT ${SESSION_COLUMNS}
      FROM sessions s
      WHERE s.project_id = ?
      ORDER BY s.started_at DESC
      LIMIT ? OFFSET ?
    `).all(projectId, pageSize, (page - 1) * pageSize);

    ok(res, { sessions: rows, page, page_size: pageSize, total });
  });

  router.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (!isValidSessionId(sessionId)) return fail(res, 400, 'invalid session id');

    const session = db.prepare(`
      SELECT ${SESSION_COLUMNS}, p.name AS project_name, p.path AS project_path
      FROM sessions s
      JOIN projects p ON p.id = s.project_id
      WHERE s.session_id = ?
    `).get(sessionId);
    if (!session) return fail(res, 404, 'session not found');

    const byModel = db.prepare(`
      SELECT model, requests, input_tokens, output_tokens, cache_read_tokens,
             cache_5m_tokens, cache_1h_tokens, cost_usd
      FROM session_model_usage
      WHERE session_id = ?
      ORDER BY cost_usd DESC
    `).all(session.id);

    const improvements = db.prepare(`
      SELECT category, severity, title, description, estimated_savings_usd
      FROM improvements
      WHERE session_id = ?
    `).all(session.id);

    const daily = db.prepare(`
      SELECT date, requests, cost_usd, input_tokens, output_tokens, cache_read_tokens
      FROM session_daily_usage
      WHERE session_id = ?
      ORDER BY date
    `).all(session.id);

    ok(res, { session, by_model: byModel, improvements, daily });
  });

  return router;
}
