import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, isApiError, setSessionExpiredHandler } from './api';

const fetchMock = vi.fn<typeof fetch>();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function caught(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to throw');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(undefined);
});

describe('api errors', () => {
  it('throws the server ErrorBody as an ApiError', async () => {
    const details = [{ productId: 'p1', requested: '10', available: '4' }];
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock', details, requestId: 'req-1' } }),
    );

    const e = await caught(api.post('/operations/op1/validate', { version: 3 }));

    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      status: 409,
      message: 'Not enough stock',
      error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock', details, requestId: 'req-1' },
    });
    expect(isApiError(e, 'INSUFFICIENT_STOCK')).toBe(true);
    expect(isApiError(e, 'STALE_VERSION')).toBe(false);
  });

  it('maps a non-JSON error response to INTERNAL', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const e = await caught(api.get('/stock'));
    expect(e).toMatchObject({ status: 502, error: { code: 'INTERNAL' } });
  });

  it('maps JSON that is not an ErrorBody to INTERNAL', async () => {
    fetchMock.mockResolvedValue(json(500, { message: 'oops' }));
    const e = await caught(api.get('/stock'));
    expect(e).toMatchObject({ status: 500, error: { code: 'INTERNAL' } });
  });

  it('maps a network failure to INTERNAL with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await caught(api.get('/stock'));
    expect(e).toMatchObject({ status: 0, error: { code: 'INTERNAL' } });
  });

  it('calls the session-expired handler on 401 SESSION_EXPIRED and still throws', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    fetchMock.mockResolvedValue(json(401, { error: { code: 'SESSION_EXPIRED', message: 'Log in again' } }));

    expect(isApiError(await caught(api.get('/operations/op1')), 'SESSION_EXPIRED')).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not call the handler when skipped, or for UNAUTHENTICATED', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'SESSION_EXPIRED', message: 'Log in again' } }));
    await caught(api.get('/auth/me', undefined, { skipSessionHandler: true }));
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Wrong password' } }));
    await caught(api.post('/auth/login', { email: 'a@b.test', password: 'x' }));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('api success', () => {
  it('unwraps data for one item and sends cookies', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { id: 'op1' } }));
    await expect(api.get('/operations/op1')).resolves.toEqual({ id: 'op1' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/operations/op1', expect.objectContaining({ credentials: 'include' }));
  });

  it('keeps page for lists and drops undefined query values', async () => {
    const body = { data: [{ id: 'op1' }], page: { page: 1, pageSize: 20, total: 1 } };
    fetchMock.mockResolvedValue(json(200, body));
    await expect(api.list('/operations', { type: 'RECEIPT', status: '', late: undefined })).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/operations?type=RECEIPT&status=');
  });

  it('sends a JSON body and resolves undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
    await api.patch('/operations/op1', { version: 2 }).catch(() => undefined);
    const init = fetchMock.mock.calls[1]?.[1];
    expect(init).toMatchObject({ method: 'PATCH', body: '{"version":2}', headers: { 'Content-Type': 'application/json' } });
  });
});
