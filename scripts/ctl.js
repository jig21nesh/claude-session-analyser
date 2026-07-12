#!/usr/bin/env node
// Background process control for the analyser: start | stop | status | restart | logs.
// Cross-platform (macOS / Windows / Linux) — pid files and logs live in .run/.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = path.join(ROOT, '.run');
const IS_WINDOWS = process.platform === 'win32';
const START_TIMEOUT_MS = 20000;
const STOP_TIMEOUT_MS = 8000;
const LOG_TAIL_LINES = 40;

function readDotEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const dotEnv = readDotEnv();
const WEB_PORT = Number.parseInt(process.env.PORT || dotEnv.PORT || '15800', 10);
const API_PORT = Number.parseInt(process.env.API_PORT || dotEnv.API_PORT || '15801', 10);

function viteBin() {
  const requireFromClient = createRequire(path.join(ROOT, 'client', 'package.json'));
  const pkgPath = requireFromClient.resolve('vite/package.json');
  const { bin } = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return path.join(path.dirname(pkgPath), typeof bin === 'string' ? bin : bin.vite);
}

const SERVICES = [
  {
    name: 'api',
    cwd: path.join(ROOT, 'server'),
    args: () => ['--env-file-if-exists=../.env', 'src/index.js'],
    port: API_PORT,
    url: [`http://127.0.0.1:${API_PORT}/api/refresh-status`],
    display: `http://127.0.0.1:${API_PORT} (API)`,
  },
  {
    name: 'web',
    cwd: path.join(ROOT, 'client'),
    args: () => [viteBin()],
    port: WEB_PORT,
    // Vite binds localhost, which may be IPv4 or IPv6 depending on the OS.
    url: [`http://127.0.0.1:${WEB_PORT}/`, `http://[::1]:${WEB_PORT}/`],
    display: `http://localhost:${WEB_PORT} (dashboard)`,
  },
];

const pidFile = (name) => path.join(RUN_DIR, `${name}.pid`);
const logFile = (name) => path.join(RUN_DIR, `${name}.log`);

function readPid(name) {
  try {
    const pid = Number.parseInt(fs.readFileSync(pidFile(name), 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function probe(urls) {
  for (const candidate of urls) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      // try the next address family
    }
  }
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  for (const svc of SERVICES) {
    const existing = readPid(svc.name);
    if (existing && isAlive(existing)) {
      console.log(`${svc.name}: already running (pid ${existing})`);
      continue;
    }
    const fd = fs.openSync(logFile(svc.name), 'a');
    const child = spawn(process.execPath, svc.args(), {
      cwd: svc.cwd,
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    });
    fs.closeSync(fd);
    fs.writeFileSync(pidFile(svc.name), String(child.pid));
    child.unref();
    console.log(`${svc.name}: started (pid ${child.pid}, log ${path.relative(ROOT, logFile(svc.name))})`);
  }
  const deadline = Date.now() + START_TIMEOUT_MS;
  for (const svc of SERVICES) {
    while (!(await probe(svc.url)) && Date.now() < deadline) await sleep(300);
  }
  return status();
}

async function stop() {
  let failed = 0;
  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    if (!pid || !isAlive(pid)) {
      console.log(`${svc.name}: not running`);
      fs.rmSync(pidFile(svc.name), { force: true });
      continue;
    }
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // Detached children lead their own process group — signal the whole group.
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (isAlive(pid) && Date.now() < deadline) await sleep(200);
    if (isAlive(pid)) {
      if (!IS_WINDOWS) process.kill(pid, 'SIGKILL');
      await sleep(300);
    }
    if (isAlive(pid)) {
      console.log(`${svc.name}: FAILED to stop (pid ${pid})`);
      failed++;
    } else {
      console.log(`${svc.name}: stopped (pid ${pid})`);
      fs.rmSync(pidFile(svc.name), { force: true });
    }
  }
  return failed ? 1 : 0;
}

async function status() {
  let running = 0;
  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    const alive = pid !== null && isAlive(pid);
    const responding = alive && (await probe(svc.url));
    if (responding) {
      console.log(`${svc.name}: running — pid ${pid} — ${svc.display}`);
      running++;
    } else if (alive) {
      console.log(`${svc.name}: starting — pid ${pid} — not responding yet on port ${svc.port}`);
    } else {
      console.log(`${svc.name}: not running${pid ? ' (stale pid file removed)' : ''}`);
      if (pid) fs.rmSync(pidFile(svc.name), { force: true });
    }
  }
  return running === SERVICES.length ? 0 : 1;
}

function logs(only) {
  for (const svc of SERVICES) {
    if (only && svc.name !== only) continue;
    console.log(`\n===== ${svc.name} — ${path.relative(ROOT, logFile(svc.name))} =====`);
    try {
      const lines = fs.readFileSync(logFile(svc.name), 'utf8').trimEnd().split('\n');
      console.log(lines.slice(-LOG_TAIL_LINES).join('\n'));
    } catch {
      console.log('(no log yet)');
    }
  }
  return 0;
}

function usage() {
  console.log(`Usage: node scripts/ctl.js <command>

Commands:
  start     Start API + web UI in the background (idempotent)
  stop      Stop both background processes
  status    Show pid + port health for each process (exit 0 = all running)
  restart   stop, then start
  logs      Print the last ${LOG_TAIL_LINES} lines of each log (optionally: logs api | logs web)`);
  return 2;
}

const command = process.argv[2];
switch (command) {
  case 'start':
    process.exitCode = await start();
    break;
  case 'stop':
    process.exitCode = await stop();
    break;
  case 'status':
    process.exitCode = await status();
    break;
  case 'restart':
    await stop();
    process.exitCode = await start();
    break;
  case 'logs':
    process.exitCode = logs(process.argv[3]);
    break;
  default:
    process.exitCode = usage();
}
