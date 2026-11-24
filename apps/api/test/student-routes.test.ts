import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import Fastify from 'fastify';
import { issueSession } from '../src/session.js';
import { studentRoutes } from '../src/student-routes.js';

test('the teacher can list and rename students while other accounts are denied', async (t) => {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  t.after(() => app.close());
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const secret = 'synthetic-roster-secret';
  let student = {
    id: studentId, displayName: null as string | null, telegramId: '123', createdAt: new Date(),
    telegramName: 'Synthetic Student', telegramUsername: 'FixtureStudent', telegramAvatarUrl: null,
  };
  await app.register(studentRoutes, {
    prefix: '/api/students',
    secret,
    findRole: async (id) => id === teacherId ? 'TEACHER' : id === studentId ? 'STUDENT' : null,
    roster: {
      list: async () => [student],
      rename: async (id, displayName) => {
        if (id !== studentId) return null;
        student = { ...student, displayName };
        return student;
      },
    },
  });
  const headers = (id: string) => ({
    authorization: `Bearer ${issueSession(id, secret, Math.floor(Date.now() / 1000))}`,
  });
  const path = '/api/students';
  const rename = (actor: string, target: string, displayName: unknown) =>
    app.inject({ method: 'PATCH', url: `${path}/${target}`, headers: headers(actor), payload: { displayName } });
  assert.equal((await app.inject(path)).statusCode, 401);
  assert.equal((await app.inject({ url: path, headers: headers(studentId) })).statusCode, 403);
  const roster = await app.inject({ url: path, headers: headers(teacherId) });
  assert.equal(roster.statusCode, 200);
  assert.equal(roster.headers['cache-control'], 'no-store');
  assert.equal(roster.json()[0].telegramId, '123');
  assert.equal((await rename(studentId, studentId, 'Test name')).statusCode, 403);
  assert.equal((await rename(teacherId, teacherId, 'Test name')).statusCode, 404);
  assert.equal((await rename(teacherId, studentId, '   ')).statusCode, 400);
  assert.equal((await rename(teacherId, studentId, 123)).statusCode, 400);
  assert.equal((await rename(teacherId, studentId, '  Test name  ')).json().displayName, 'Test name');
  assert.equal((await rename(teacherId, studentId, 'Test name')).json().displayName, 'Test name');
  assert.equal((await rename(teacherId, studentId, null)).json().displayName, null);
});
