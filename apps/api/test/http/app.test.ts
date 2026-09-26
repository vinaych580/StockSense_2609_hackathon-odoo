import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errors';
import { AppError } from '../../src/lib/errors';
import { resetDb } from '../factories';
import { app, ORIGIN } from './helpers';

beforeEach(resetDb);

/** A throwaway app whose only route throws `err`, to check the error handler's mapping. */
function throwing(err: unknown) {
  const a = express();
  a.get('/boom', () => {
    throw err;
  });
  a.use(errorHandler);
  return request(a).get('/boom');
}

describe('app', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
  });

  it('returns NOT_FOUND in the standard error body for an unknown route, with a request id', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('refuses a change that is not sent as JSON', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).type('form').send('email=a');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a change from an origin that is not on the allowlist', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('reports malformed JSON as VALIDATION_FAILED', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('error handler', () => {
  it('passes an AppError through with its code, status and details', async () => {
    const res = await throwing(new AppError('INSUFFICIENT_STOCK', 'Short', [{ sku: 'A' }]));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', message: 'Short', details: [{ sku: 'A' }] });
  });

  it('turns a zod error into 400 VALIDATION_FAILED with a path per issue', async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const res = await throwing(parsed.error);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('maps a unique violation on sku to 409 SKU_TAKEN', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'x', meta: { target: ['sku'] } });
    const res = await throwing(err);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SKU_TAKEN');
  });

  it('maps any other unique violation to 409 ALREADY_EXISTS naming the field', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'x', meta: { target: ['code'] } });
    const res = await throwing(err);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'ALREADY_EXISTS', details: { fields: ['code'] } });
  });

  it('maps a foreign-key violation to 422 INACTIVE_REFERENCE', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'x', meta: {} });
    const res = await throwing(err);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INACTIVE_REFERENCE');
  });

  it('maps a check violation (the stock backstop) to 409 INSUFFICIENT_STOCK', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('check', { code: 'P2010', clientVersion: 'x', meta: { code: '23514' } });
    const res = await throwing(err);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('hides anything else behind 500 INTERNAL', async () => {
    const res = await throwing(new Error('secret stack detail'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
