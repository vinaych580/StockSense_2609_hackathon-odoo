import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from './errors';
import { publish, type AppEvent } from './events';

export const prisma = new PrismaClient();

export type Tx = Prisma.TransactionClient;

/** Collects events during a transaction; they are published only after it commits. */
export interface TxContext {
  publishAfterCommit(event: AppEvent): void;
}

/** Retried deadlocks and serialization failures since start; a lock-order regression shows up here first. */
export const txStats = { retries: 0 };

const TX_OPTIONS = { timeout: 10_000, maxWait: 5_000 } as const;
const MAX_RETRIES = 3;

/** Deadlock (40P01), serialization failure (40001), or a Prisma transaction timeout / write conflict. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2028' || err.code === 'P2034') return true;
    const meta = err.meta as { code?: string } | undefined;
    if (meta?.code === '40P01' || meta?.code === '40001') return true;
  }
  const message = err instanceof Error ? err.message : '';
  return /40P01|40001|deadlock detected|could not serialize/i.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs fn in one interactive transaction at READ COMMITTED. The retry wraps the whole
 * $transaction call: Postgres refuses further queries in a failed transaction, so retrying
 * inside the callback can't work. After 3 retries a retryable failure becomes 503 BUSY_RETRY.
 */
export async function withTx<T>(fn: (tx: Tx, ctx: TxContext) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const pending: AppEvent[] = [];
    const ctx: TxContext = { publishAfterCommit: (e) => pending.push(e) };
    try {
      const result = await prisma.$transaction((tx) => fn(tx, ctx), TX_OPTIONS);
      for (const e of pending) publish(e);
      return result;
    } catch (err) {
      if (!isRetryable(err)) throw err;
      if (attempt >= MAX_RETRIES) {
        throw new AppError('BUSY_RETRY', 'The database is busy. Please try again.');
      }
      txStats.retries++;
      await sleep(20 * 2 ** attempt + Math.random() * 30);
    }
  }
}
