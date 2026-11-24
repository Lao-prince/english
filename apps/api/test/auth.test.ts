import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import Fastify from 'fastify';
import { authRoutes } from '../src/auth.js';
import { issueSession, readSession, sessionLifetime } from '../src/session.js';
import { verifyTelegramProfile } from '../src/telegram.js';

const botToken = 'synthetic-test-key';
const secret = 'synthetic-session-key';
const student = { id: '00000000-0000-4000-8000-000000000001', role: 'STUDENT' } as const;

function launch(telegramId: number, date: number, startParam?: string, profile?: Record<string, string>) {
  const fields = new URLSearchParams({
    auth_date: String(date),
    signature: 'synthetic',
    user: JSON.stringify({ id: telegramId, ...profile }),
  });
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  if (startParam) fields.set('start_param', startParam);
  fields.sort();
  const check = [...fields].map(([name, value]) => `${name}=${value}`).join('\n');
  fields.set('hash', createHmac('sha256', key).update(check).digest('hex'));
  return fields.toString();
}

test('Telegram launch validation rejects forged, expired, future and duplicate fields', () => {
  const now = 1_800_000_000;
  const valid = launch(1, now);
  assert.equal(verifyTelegramProfile(valid, botToken, now)?.id, 1n);
  assert.equal(verifyTelegramProfile(valid.replace('%3A1', '%3A2'), botToken, now), null);
  assert.equal(verifyTelegramProfile(launch(1, now - 301), botToken, now), null);
  assert.equal(verifyTelegramProfile(launch(1, now + 31), botToken, now), null);
  assert.equal(verifyTelegramProfile(valid + '&user=duplicate', botToken, now), null);
});

test('profile sync verifies identity and only accepts Telegram userpic URLs', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const now = Math.floor(Date.now() / 1000);
  const avatar = 'https://t.me/i/userpic/320/synthetic.svg';
  const initData = launch(1, now, undefined, {
    first_name: 'Synthetic', last_name: 'Profile', username: 'FixtureStudent', photo_url: avatar,
  });
  assert.equal(verifyTelegramProfile(launch(1, now, undefined, {
    photo_url: 'https://t.me.example.invalid/i/userpic/test.svg',
  }), botToken, now)?.telegramAvatarUrl, null);
  let synced = 0;
  app.register(authRoutes, {
    botToken, secret,
    findByTelegramId: async (id) => id === 1n ? student : null,
    findById: async () => student,
    syncStudentProfile: async (id, profile) => {
      assert.equal(id, student.id);
      assert.equal(profile.telegramName, 'Synthetic Profile');
      assert.equal(profile.telegramUsername, 'FixtureStudent');
      assert.equal(profile.telegramAvatarUrl, avatar);
      synced += 1;
    },
  });
  const sync = (accountId: string) => app.inject({
    method: 'POST', url: '/profile', payload: { initData },
    headers: { authorization: `Bearer ${issueSession(accountId, secret, now)}` },
  });
  assert.equal((await sync('00000000-0000-4000-8000-000000000002')).statusCode, 401);
  assert.equal(synced, 0);
  assert.equal((await sync(student.id)).statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/telegram', payload: { initData } })).statusCode, 200);
  assert.equal(synced, 2);
});

test('teachers issue invites and verified Telegram launches redeem them', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const teacher = { id: '00000000-0000-4000-8000-000000000002', role: 'TEACHER' } as const;
  const code = 'invite_abcdefghijklmnopqrstuvwx';
  const now = Math.floor(Date.now() / 1000);
  let redeemed = false;
  app.register(authRoutes, {
    botToken, secret, botUsername: 'SyntheticBot',
    findById: async (id) => id === teacher.id ? teacher : student,
    findByTelegramId: async (id) => id === 1n ? teacher : id === 2n && redeemed ? student : null,
    invitations: {
      create: async () => ({ code, expiresAt: new Date() }),
      redeem: async (submitted, id) => {
        if (submitted !== code || redeemed) return null;
        assert.equal(id, 2n);
        redeemed = true;
        return student;
      },
    },
  });
  const create = (id: string) => app.inject({
    method: 'POST', url: '/invitations', headers: { authorization: `Bearer ${issueSession(id, secret, now)}` },
  });
  const signIn = (initData: string) => app.inject({ method: 'POST', url: '/telegram', payload: { initData } });
  assert.equal((await create(student.id)).statusCode, 403);
  const created = await create(teacher.id);
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().link, `https://t.me/SyntheticBot?startapp=${code}`);
  assert.equal((await signIn(launch(2, now) + '&start_param=' + code)).statusCode, 401);
  assert.equal((await signIn(launch(1, now, code))).statusCode, 200);
  assert.equal(redeemed, false);
  assert.equal((await signIn(launch(2, now, code))).statusCode, 200);
  assert.equal((await signIn(launch(2, now))).statusCode, 200);
  assert.equal((await signIn(launch(3, now, code))).statusCode, 403);
});

test('session claims expire and cannot be altered', () => {
  const now = 1_800_000_000;
  const token = issueSession(student.id, secret, now);
  assert.equal(readSession(`Bearer ${token}`, secret, now), student.id);
  assert.equal(readSession(`Bearer ${token}`, secret, now + sessionLifetime), null);
  assert.equal(readSession(`Bearer ${token}`, 'another-key', now), null);
  assert.equal(readSession(`Bearer ${token.replace('0001.', '0002.')}`, secret, now), null);
});

test('auth routes require an approved identity and read the current role', async (t) => {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  t.after(() => app.close());
  let account: { id: string; role: 'TEACHER' | 'STUDENT' } | null = student;
  app.register(authRoutes, {
    prefix: '/api/auth',
    botToken,
    secret,
    findByTelegramId: async (id) => id === 1n ? account : null,
    findById: async (id) => account?.id === id ? account : null,
  });
  const me = '/api/auth/me';
  const telegram = '/api/auth/telegram';
  const signIn = (initData: string) => app.inject({ method: 'POST', url: telegram, payload: { initData } });
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await app.inject(me)).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: telegram, payload: { initData: 1 } })).statusCode, 400);
  assert.equal((await signIn('garbage')).statusCode, 401);
  assert.equal((await signIn(launch(2, now))).statusCode, 403);
  const result = await signIn(launch(1, now));
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  const request = { url: me, headers: { authorization: `Bearer ${result.json().token}` } };
  assert.deepEqual((await app.inject(request)).json(), student);
  account = { ...student, role: 'TEACHER' };
  assert.deepEqual((await app.inject(request)).json(), account);
  account = null;
  assert.equal((await app.inject(request)).statusCode, 401);
});
