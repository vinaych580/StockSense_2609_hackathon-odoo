import pino from 'pino';

const inTests = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';

/** One logger for the process. Never log passwords, OTP codes or session tokens. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (inTests ? 'silent' : 'info'),
  redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(process.env.NODE_ENV !== 'production' && !inTests
    ? { transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } } }
    : {}),
});
