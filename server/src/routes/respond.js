export function ok(res, data, status = 200) {
  res.status(status).json({
    status: 'ok',
    data,
    error: null,
    timestamp: new Date().toISOString(),
  });
}

export function fail(res, status, message) {
  res.status(status).json({
    status: 'error',
    data: null,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

/** Coerce a query/path value to a bounded positive integer, or return null. */
export function toBoundedInt(value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d{1,10}$/.test(String(value))) return undefined; // undefined = invalid
  const n = Number.parseInt(value, 10);
  if (n < min || n > max) return undefined;
  return n;
}

const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

export function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}
