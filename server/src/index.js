import { API_HOST, API_PORT, CLAUDE_PROJECTS_DIR, DB_PATH } from './config.js';
import { openDb } from './db.js';
import { createScanService } from './scan-service.js';
import { createApp } from './app.js';
import { logger } from './logger.js';

const db = openDb(DB_PATH);
const scanService = createScanService(db, CLAUDE_PROJECTS_DIR);
const app = createApp(db, scanService);

app.listen(API_PORT, API_HOST, () => {
  logger.info('api listening', { host: API_HOST, port: API_PORT, db: DB_PATH });
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n > 0;
  logger.info(hasData ? 'existing analysis found — refreshing incrementally' : 'first run — analysing all sessions', {
    projectsDir: CLAUDE_PROJECTS_DIR,
  });
  scanService.trigger({ force: false });
});
