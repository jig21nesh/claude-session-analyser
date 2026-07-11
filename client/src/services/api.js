async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`API returned a non-JSON response (${res.status})`);
  }
  if (!res.ok || body.status !== 'ok') {
    throw new Error(body?.error || `API error (${res.status})`);
  }
  return body.data;
}

export const api = {
  summary: () => request('/summary'),
  projects: () => request('/projects'),
  project: (id) => request(`/projects/${encodeURIComponent(id)}`),
  projectSessions: (id, page = 1, pageSize = 25) =>
    request(`/projects/${encodeURIComponent(id)}/sessions?page=${page}&page_size=${pageSize}`),
  session: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}`),
  dailyCosts: (projectId) =>
    request(projectId ? `/daily-costs?project_id=${encodeURIComponent(projectId)}` : '/daily-costs'),
  predictions: (days = 30) => request(`/predictions?days=${days}`),
  improvements: (projectId) =>
    request(projectId ? `/improvements?project_id=${encodeURIComponent(projectId)}` : '/improvements'),
  refresh: (force = false) => request(`/refresh${force ? '?force=true' : ''}`, { method: 'POST' }),
  refreshStatus: () => request('/refresh-status'),
};
