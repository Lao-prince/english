import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import Fastify from 'fastify';
import { authRoutes } from '../src/auth.js';
import { issueSession, readSession, sessionLifetime } from '../src/session.js';
import { verifyTelegramId } from '../src/telegram.js';

const botToken = 'synthetic-test-key';
const secret = 'synthetic-session-key';
const student = { id: '00000000-0000-4000-8000-000000000001', role: 'STUDENT' } as const;

function launch(telegramId: number, date: number) {
  const fields = new URLSearchParams({
    auth_date: String(date),
    signature: 'synthetic',
    user: JSON.stringify({ id: telegramId }),
  });
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const check = `auth_date=${date}\nsignature=synthetic\nuser=${fields.get('user')}`;
  fields.set('hash', createHmac('sha256', key).update(check).digest('hex'));
  return fields.toString();
}

test('Telegram launch validation rejects forged, expired, future and duplicate fields', () => {
  const now = 1_800_000_000;
  const valid = launch(1, now);
  assert.equal(verifyTelegramId(valid, botToken, now), 1n);
  assert.equal(verifyTelegramId(valid.replace('%3A1', '%3A2'), botToken, now), null);
  assert.equal(verifyTelegramId(launch(1, now - 301), botToken, now), null);
  assert.equal(verifyTelegramId(launch(1, now + 31), botToken, now), null);
  assert.equal(verifyTelegramId(valid + '&user=duplicate', botToken, now), null);
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
