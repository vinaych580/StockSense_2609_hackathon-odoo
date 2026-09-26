import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './lib/db';
import { logger } from './lib/logger';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => logger.info(`StockSense API on http://localhost:${port}/api/v1`));

async function shutdown(signal: string) {
  logger.info(`${signal}: shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
