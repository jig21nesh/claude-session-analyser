import express from 'express';
import { analysisRoutes } from './routes/analysis.js';
import { projectRoutes } from './routes/projects.js';
import { fail } from './routes/respond.js';
import { logger } from './logger.js';

export function createApp(db, scanService) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', data: { healthy: true }, error: null, timestamp: new Date().toISOString() });
  });

  app.use('/api', analysisRoutes(db, scanService));
  app.use('/api', projectRoutes(db));

  app.use((req, res) => fail(res, 404, 'not found'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('unhandled error', { error: err.message, path: req.path });
    fail(res, err.type === 'entity.parse.failed' ? 400 : 500, err.type === 'entity.parse.failed' ? 'malformed JSON body' : 'internal server error');
  });

  return app;
}
