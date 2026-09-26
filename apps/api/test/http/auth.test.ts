import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db';
import { errorHandler } from '../../src/middleware/errors';
import { createLimits } from '../../src/middleware/security';
import { resetDb } from '../factories';
import { app, makeLoginUser, ORIGIN, PASSWORD, signedIn } from './helpers';

beforeEach(resetDb);

const post = (path: string, body: object, agent = request(app)) => agent.post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);

describe('sign-up', () => {
  it('creates a Staff user whatever role is sent, and logs them in', async () => {
    const agent = request.agent(app);
    const res = await post('/auth/signup', { name: 'Asha', email: ' Asha@Example.com ', password: 'long-enough-pass', role: 'MANAGER' }, agent);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Asha', email: 'asha@example.com', role: 'STAFF' });
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('asha@example.com');
  });

  it('refuses an email that is already registered with 409 EMAIL_TAKEN', async () => {
    const user = await makeLoginUser('STAFF');
    const res = await post('/auth/signup', { name: 'Dup', email: user.email.toUpperCase(), password: 'long-enough-pass' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('refuses a password shorter than 10 characters', async () => {
    const res = await post('/auth/signup', { name: 'Short', email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('password');
  });
});

describe('log-in', () => {
  it('logs in and /me returns the role and the permission list', async () => {
    const { agent, user } = await signedIn('STAFF');
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: user.id, role: 'STAFF' });
    expect(me.body.data.permissions).toContain('stock.view');
    expect(me.body.data.permissions).not.toContain('masterdata.edit');
  });

  it('gives the same 401 for a wrong password, an unknown email and a deactivated user', async () => {
    const active = await makeLoginUser('STAFF');
    const inactive = await makeLoginUser('STAFF', { isActive: false });
    const wrong = await post('/auth/login', { email: active.email, password: 'not-the-password' });
    const unknown = await post('/auth/login', { email: 'nobody@stocksense.test', password: PASSWORD });
    const off = await post('/auth/login', { email: inactive.email, password: PASSWORD });
    for (const res of [wrong, unknown, off]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe(wrong.body.error.message);
    }
  });

  it('rate-limits log-in to 10 tries per 15 minutes per IP and email, with Retry-After', async () => {
    const email = 'bruteforce@stocksense.test';
    for (let i = 0; i < 10; i++) expect((await post('/auth/login', { email, password: 'guess-guess' })).status).toBe(401);
    const res = await post('/auth/login', { email, password: 'guess-guess' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBe('900');
  });

  it('stores only a hash of the session token', async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    const cookie = (await post('/auth/login', { email: (await makeLoginUser()).email, password: PASSWORD })).headers['set-cookie'];
    const token = String(cookie).match(/sid=([^;]+)/)![1]!;
    expect((await prisma.session.findMany()).map((s) => s.id)).not.toContain(token);
  });
});

describe('abuse limits', () => {
  it('rate-limits sign-up to 20 per hour per IP', async () => {
    const fresh = createApp();
    const signup = (i: number) => post('/auth/signup', { name: 'Flood', email: `flood${i}@stocksense.test`, password: 'long-enough-pass' }, request(fresh));
    for (let i = 0; i < 20; i++) expect((await signup(i)).status).toBe(201);
    const res = await signup(20);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it("counts password-code checks per IP and email, so one person's typos can't lock out a shared network", async () => {
    const limits = createLimits();
    const a = express();
    a.use(express.json());
    a.post('/verify', limits.verify, (_req, res) => {
      res.status(204).end();
    });
    a.use(errorHandler);
    const verify = (email: string) => request(a).post('/verify').send({ email });
    for (let i = 0; i < 10; i++) expect((await verify('a@stocksense.test')).status).toBe(204);
    expect((await verify('a@stocksense.test')).status).toBe(429);
    expect((await verify('b@stocksense.test')).status).toBe(204);
  });
});

describe('sessions', () => {
  it('refuses /me without a session', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs out: the session row is deleted and the cookie no longer works', async () => {
    const { agent } = await signedIn();
    const out = await post('/auth/logout', {}, agent);
    expect(out.status).toBe(204);
    expect(await prisma.session.count()).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('ends a session idle for more than 24 hours with SESSION_EXPIRED', async () => {
    const { agent } = await signedIn();
    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 25 * 3600_000) } });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect(await prisma.session.count()).toBe(0);
  });

  it('ends a session past its 7-day limit', async () => {
    const { agent } = await signedIn();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await agent.get('/api/v1/auth/me')).body.error.code).toBe('SESSION_EXPIRED');
  });

  it('reloads the user on every request, so deactivation takes effect at once', async () => {
    const { agent, user } = await signedIn();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    // The web app sends SESSION_EXPIRED back to log-in; UNAUTHENTICATED is left to the page.
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('treats a cookie whose session is gone (db:reset, another device) as SESSION_EXPIRED', async () => {
    const { agent } = await signedIn();
    await prisma.session.deleteMany();
    const res = await agent.get('/api/v1/operations');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('reloads the role on every request', async () => {
    const { agent, user } = await signedIn('MANAGER');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'STAFF' } });
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('STAFF');
  });
});
