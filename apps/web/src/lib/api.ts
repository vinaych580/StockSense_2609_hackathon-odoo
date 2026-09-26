import type { ErrorBody, ErrorCode, ListResponse } from '@stocksense/shared';

const BASE = '/api/v1';

/**
 * Thrown for every failed call. It has the API's ErrorBody shape (`err.error.code`), so screens
 * switch on the code, never the message. `status` is 0 when the server couldn't be reached.
 */
export class ApiError extends Error implements ErrorBody {
  readonly error: ErrorBody['error'];
  readonly status: number;

  constructor(status: number, error: ErrorBody['error']) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

export function isApiError(e: unknown, code?: ErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.error.code === code);
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | undefined;

/** The auth provider registers this; it runs on any 401 SESSION_EXPIRED before the error is thrown. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | undefined) {
  onSessionExpired = handler;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** For GET /auth/me, where being signed out is a normal answer rather than an expired session. */
  skipSessionHandler?: boolean;
}

function toUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

function isErrorBody(value: unknown): value is ErrorBody {
  const error = (value as ErrorBody | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}

const unreachable = (status: number) =>
  new ApiError(status, { code: 'INTERNAL', message: "Can't reach the server. Try again in a moment." });

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipSessionHandler } = options;
  let res: Response;
  try {
    res = await fetch(toUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw unreachable(0);
  }

  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => undefined);

  if (res.ok) return json as T;
  // Anything that isn't our error shape (e.g. the dev proxy's 502 when the API is down).
  if (!isErrorBody(json)) throw unreachable(res.status);

  const err = new ApiError(res.status, json.error);
  if (err.error.code === 'SESSION_EXPIRED' && !skipSessionHandler) onSessionExpired?.();
  throw err;
}

export const api = {
  /** One item: resolves to `data`. */
  get: async <T>(path: string, query?: Query, options?: Omit<RequestOptions, 'query' | 'body'>) =>
    (await request<{ data: T }>('GET', path, { ...options, query })).data,
  /** A list: resolves to `{ data, page }`. */
  list: <T>(path: string, query?: Query) => request<ListResponse<T>>('GET', path, { query }),
  /** Resolves to `data`, or undefined for a 204. */
  post: async <T = void>(path: string, body?: unknown) =>
    (await request<{ data: T } | undefined>('POST', path, { body }))?.data as T,
  patch: async <T>(path: string, body: unknown) =>
    (await request<{ data: T }>('PATCH', path, { body })).data,
  put: async <T>(path: string, body: unknown) =>
    (await request<{ data: T }>('PUT', path, { body })).data,
  delete: (path: string) => request<void>('DELETE', path),
};
