import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { openStreams } from '../../src/events/routes';
import { prisma } from '../../src/lib/db';
import { resetDb } from '../factories';
import { makeLoginUser, ORIGIN, PASSWORD, signedIn } from './helpers';

beforeEach(resetDb);

const send = (agent: ReturnType<typeof request.agent>, method: 'patch' | 'post', url: string, body: object) =>
  agent[method](`/api/v1${url}`).set('Origin', ORIGIN).send(body);

describe('users (Settings → Users)', () => {
  it('lists users for Managers only', async () => {
    const mgr = await signedIn('MANAGER');
    await makeLoginUser('STAFF');
    const res = await mgr.agent.get('/api/v1/users?role=STAFF');
    expect(res.status).toBe(200);
    expect(res.body.page.total).toBe(1);
    expect(res.body.data[0].passwordHash).toBeUndefined();
    const staff = await signedIn('STAFF');
    expect((await staff.agent.get('/api/v1/users')).status).toBe(403);
  });

  it('promotes, deactivates (ending their sessions) and reactivates', async () => {
    const mgr = await signedIn('MANAGER');
    const staff = await signedIn('STAFF');
    expect((await send(mgr.agent, 'patch', `/users/${staff.user.id}`, { role: 'MANAGER' })).body.data.role).toBe('MANAGER');
    expect((await staff.agent.get('/api/v1/auth/me')).body.data.role).toBe('MANAGER');

    expect((await send(mgr.agent, 'patch', `/users/${staff.user.id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect((await staff.agent.get('/api/v1/auth/me')).body.error.code).toBe('SESSION_EXPIRED');
    expect(await prisma.session.count({ where: { userId: staff.user.id } })).toBe(0);
    expect((await send(mgr.agent, 'patch', `/users/${staff.user.id}`, { isActive: true })).body.data.isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: 'user', entityId: staff.user.id } })).toBe(3);
  });

  it('never leaves the system without an active Manager', async () => {
    const mgr = await signedIn('MANAGER');
    const res = await send(mgr.agent, 'patch', `/users/${mgr.user.id}`, { role: 'STAFF' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LAST_MANAGER');
    expect((await send(mgr.agent, 'patch', `/users/${mgr.user.id}`, { isActive: false })).body.error.code).toBe('LAST_MANAGER');

    // Two Managers demoting each other at once: exactly one wins.
    const other = await signedIn('MANAGER');
    const [a, b] = await Promise.all([
      send(mgr.agent, 'patch', `/users/${other.user.id}`, { role: 'STAFF' }),
      send(other.agent, 'patch', `/users/${mgr.user.id}`, { role: 'STAFF' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    expect(await prisma.user.count({ where: { role: 'MANAGER', isActive: true } })).toBe(1);
  });
});

describe('My Profile', () => {
  it('renames the user', async () => {
    const { agent } = await signedIn('STAFF');
    const res = await send(agent, 'patch', '/auth/me', { name: '  Neha K ' });
    expect(res.body.data.name).toBe('Neha K');
  });

  it('changes the password, keeping this session and ending the others', async () => {
    const here = await signedIn('STAFF');
    const elsewhere = request.agent(createApp());
    await elsewhere.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: here.user.email, password: PASSWORD });
    expect((await elsewhere.get('/api/v1/auth/me')).status).toBe(200);

    expect((await send(here.agent, 'post', '/auth/me/password', { currentPassword: 'wrong-password', newPassword: 'a-new-password-1' })).body.error.details[0].path).toBe('currentPassword');
    expect((await send(here.agent, 'post', '/auth/me/password', { currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
    expect((await send(here.agent, 'post', '/auth/me/password', { currentPassword: PASSWORD, newPassword: 'a-new-password-1' })).status).toBe(204);

    expect((await here.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await elsewhere.get('/api/v1/auth/me')).body.error.code).toBe('SESSION_EXPIRED');
    const login = await request(createApp()).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: here.user.email, password: 'a-new-password-1' });
    expect(login.status).toBe(200);
  });
});

describe('GET /events (SSE)', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    server = createApp({ sseHeartbeatMs: 150 }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  async function login(role: 'MANAGER' | 'STAFF') {
    const user = await makeLoginUser(role);
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    return { user, cookie };
  }

  /** Opens the stream and collects its text; `until` resolves once the text matches. */
  async function open(cookie: string) {
    const res = await fetch(`${base}/events`, { headers: { Cookie: cookie } });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let done = false;
    const pump = (async () => {
      for (;;) {
        const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (chunk.done) { done = true; return; }
        text += decoder.decode(chunk.value);
      }
    })();
    const until = async (re: RegExp, ms = 3000) => {
      const end = Date.now() + ms;
      while (!re.test(text) && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
      if (!re.test(text)) throw new Error(`stream never matched ${re}: ${JSON.stringify(text)}`);
    };
    return { res, until, text: () => text, ended: () => done, close: () => reader.cancel().then(() => pump) };
  }

  it('refuses without a session and streams data.changed to everyone after a commit', async () => {
    expect((await fetch(`${base}/events`)).status).toBe(401);
    const mgr = await login('MANAGER');
    const staff = await login('STAFF');
    const a = await open(mgr.cookie);
    const b = await open(staff.cookie);
    expect(a.res.headers.get('content-type')).toContain('text/event-stream');
    expect(a.res.headers.get('x-accel-buffering')).toBe('no');
    await a.until(/event: ready/);

    await fetch(`${base}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: mgr.cookie },
      body: JSON.stringify({ name: 'Live' }),
    });
    await a.until(/event: data\.changed\ndata: .*"masterdata"/);
    await b.until(/event: data\.changed/);
    await a.until(/: ping/);
    await a.close();
    await b.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(openStreams.count).toBe(0);
  });

  it('sends session.updated only to that user, and ends the stream once the session is gone', async () => {
    const mgr = await login('MANAGER');
    const staff = await login('STAFF');
    const mine = await open(mgr.cookie);
    const theirs = await open(staff.cookie);
    await theirs.until(/event: ready/);

    await fetch(`${base}/users/${staff.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: mgr.cookie },
      body: JSON.stringify({ isActive: false }),
    });
    await theirs.until(/event: session\.updated/);
    await theirs.until(/event: session\.ended/);
    await new Promise((r) => setTimeout(r, 100));
    expect(theirs.ended()).toBe(true);
    expect(mine.text()).not.toMatch(/session\.updated/);
    await mine.close();
  });
});
