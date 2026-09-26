import { ERROR_STATUS, type ErrorCode } from '@stocksense/shared';

/** A failure with a stable code the UI can act on. The error middleware turns it into the standard error body. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
