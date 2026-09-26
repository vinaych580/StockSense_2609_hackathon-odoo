/** `pnpm db:start`: run the embedded Postgres in the foreground until Ctrl+C. */
import { isPortOpen, PG_PORT, startEmbedded } from './pg';

if (await isPortOpen()) {
  console.log(`Something is already listening on port ${PG_PORT} (Docker or a previous db:start). Nothing to do.`);
  process.exit(0);
}

const stop = await startEmbedded();
console.log(`Postgres 16 running on localhost:${PG_PORT} (databases stocksense, stocksense_test). Ctrl+C to stop.`);

const shutdown = async () => {
  await stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
