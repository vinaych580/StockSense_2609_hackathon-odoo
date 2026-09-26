#!/usr/bin/env node
/**
 * `pnpm start`: runs the whole app locally with one command, no Docker needed.
 *
 *   1. Postgres 16 (embedded, data in apps/api/.pgdata) on :5433
 *   2. Migrations, plus the demo data on the very first run
 *   3. Local mailbox (SMTP :1025, inbox at http://localhost:8025) for password-reset codes
 *   4. API on :3000 and the web app on :5173
 *
 * Ctrl+C stops everything. Pass --no-open to skip opening the browser.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');
const envFile = path.join(apiDir, '.env');
const isWin = process.platform === 'win32';
const color = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);

function say(msg) {
  console.log(`${paint('1', '[start]')} ${msg}`);
}
function fail(msg) {
  console.error(`\n${paint('31;1', 'Cannot start:')} ${msg}\n`);
  process.exit(1);
}

// ---- Preflight -------------------------------------------------------------------------------

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) fail(`StockSense needs Node.js 22 or newer; this is ${process.version}. Install it from https://nodejs.org.`);

const tsx = path.join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const vite = path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(tsx) || !existsSync(vite)) fail('Dependencies are not installed. Run `pnpm install` first, then `pnpm start`.');

if (!existsSync(envFile)) {
  copyFileSync(path.join(root, '.env.example'), envFile);
  say('Created apps/api/.env from .env.example.');
}
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const PG_PORT = Number(env.PG_PORT ?? 5433);
const API_PORT = Number(env.PORT ?? 3000);
const WEB_PORT = 5173;
const MAIL_PORT = Number(env.MAILBOX_PORT ?? 8025);

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      // Vite listens on ::1 only on some systems, so check IPv6 too.
      const v6 = net.connect({ port, host: '::1' });
      v6.once('connect', () => {
        v6.end();
        resolve(true);
      });
      v6.once('error', () => resolve(false));
    });
  });
}

for (const [port, what] of [
  [API_PORT, 'the API'],
  [WEB_PORT, 'the web app'],
]) {
  if (await isPortOpen(port)) {
    fail(
      `port ${port} (needed by ${what}) is already in use. Is StockSense already running in another terminal? ` +
        `Stop it (Ctrl+C there), or close whatever program is using port ${port}, then try again.`,
    );
  }
}

// ---- Child processes ---------------------------------------------------------------------------

const children = new Set();
let stopping = false;

/** Runs `node <args>` in cwd with its output prefixed by a coloured label. */
function run(label, tint, cwd, args, { critical = true } = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: color ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = paint(tint, `[${label}]`.padEnd(6));
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', (line) => console.log(`${tag} ${line}`));
  }
  child.done = new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
  children.add(child);
  child.done.then((code) => {
    children.delete(child);
    if (stopping || !critical) return;
    console.error(`\n${paint('31;1', `[${label}] stopped unexpectedly (exit code ${code}).`)} Look at the lines above for the reason.`);
    void stopAll(1);
  });
  return child;
}

function kill(child) {
  if (child.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function within(ms, promise) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r('timeout'), ms))]);
}

async function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  say('Stopping StockSense...');
  const db = [...children].find((c) => c.label === 'db');
  const apps = [...children].filter((c) => c !== db);
  // A Ctrl+C in the terminal reaches every child on its own; give them a moment to exit cleanly.
  if (code !== 0) apps.forEach(kill);
  if ((await within(5_000, Promise.all(apps.map((c) => c.done)))) === 'timeout') apps.forEach(kill);
  if (db) {
    if (code !== 0 && !isWin) db.kill('SIGTERM');
    if ((await within(10_000, db.done)) === 'timeout') kill(db);
  }
  process.exit(code);
}
process.on('SIGINT', () => void stopAll(0));
process.on('SIGTERM', () => void stopAll(0));

async function waitForPort(port, label, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (stopping) return;
    if (await isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(paint('31;1', `[${label}] did not start within ${Math.round(timeoutMs / 1000)} s.`));
  await stopAll(1);
}

function openBrowser(url) {
  if (process.argv.includes('--no-open') || process.env.CI) return;
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // No browser available; the URL is printed below anyway.
  }
}

// ---- Boot ------------------------------------------------------------------------------------

say('Starting the database (the first run takes up to a minute to set it up)...');
const pgWasRunning = await isPortOpen(PG_PORT);
if (pgWasRunning) {
  say(`Something is already listening on port ${PG_PORT}; using it as the database.`);
} else {
  const db = run('db', '34', apiDir, [tsx, 'scripts/db.ts']);
  db.label = 'db';
  await waitForPort(PG_PORT, 'db', 120_000);
}

say('Preparing the database...');
const prepare = run('db', '34', apiDir, [tsx, 'scripts/prepare.ts'], { critical: false });
if ((await prepare.done) !== 0) {
  console.error(paint('31;1', 'Database preparation failed; see the lines above.'));
  await stopAll(1);
}

run('mail', '35', apiDir, [tsx, 'scripts/mailbox.ts'], { critical: false });
run('api', '32', apiDir, [tsx, 'src/server.ts']);
run('web', '36', webDir, [vite, '--port', String(WEB_PORT), '--strictPort']);

await Promise.all([waitForPort(API_PORT, 'api', 60_000), waitForPort(WEB_PORT, 'web', 60_000)]);
if (stopping) await new Promise(() => {});

const appUrl = `http://localhost:${WEB_PORT}`;
const rows = [
  ['App', appUrl],
  ['Inbox', `http://localhost:${MAIL_PORT}   (password-reset emails arrive here)`],
  ['API', `http://localhost:${API_PORT}/api/v1`],
  ['Manager', 'manager@stocksense.test'],
  ['Staff', 'staff@stocksense.test'],
  ['Password', `${env.SEED_PASSWORD ?? '(SEED_PASSWORD in apps/api/.env)'}   (same for every demo account)`],
];
console.log(
  [
    '',
    paint('1;33', '  StockSense is running'),
    ...rows.map(([k, v]) => `  ${paint('2', k.padEnd(9))} ${v}`),
    '',
    `  Press ${paint('1', 'Ctrl+C')} to stop everything.`,
    '',
  ].join('\n'),
);
openBrowser(appUrl);
