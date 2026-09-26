/**
 * Local Postgres without Docker: runs the PostgreSQL 16 binaries shipped in the
 * embedded-postgres package, with data in apps/api/.pgdata, on PG_PORT (5433).
 */
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '../.pgdata');
export const PG_PORT = Number(process.env.PG_PORT ?? 5433);
export const DATABASES = ['stocksense', 'stocksense_test'];

export function isPortOpen(port = PG_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.end(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** Starts the embedded server (initialising it on first run) and creates the app databases. */
export async function startEmbedded(): Promise<() => Promise<void>> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PG_PORT,
    user: 'stocksense',
    password: 'stocksense',
    persistent: true,
    onLog: process.env.PG_VERBOSE ? console.log : () => {},
    onError: console.error,
  });
  const fresh = !existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();

  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  const { rows } = (await client.query('SELECT datname FROM pg_database')) as { rows: Array<{ datname: string }> };
  const existing = new Set(rows.map((r) => r.datname));
  for (const db of DATABASES) if (!existing.has(db)) await pg.createDatabase(db);
  await client.end();

  return () => pg.stop();
}
