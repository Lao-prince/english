import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { availability, sameLessonDay, ScheduleError } from '../src/availability.js';
import { scheduleRoutes } from '../src/schedule.js';
import { issueSession } from '../src/session.js';

test('cancellation day follows the teacher calendar across midnight and daylight saving', () => {
  const now = new Date('2030-03-31T21:30:00Z');
  const lesson = new Date('2030-03-31T22:30:00Z');
  assert.equal(sameLessonDay(now, lesson, 'Europe/Berlin'), false);
  assert.equal(sameLessonDay(now, lesson, 'UTC'), true);
  assert.equal(sameLessonDay(now, lesson, 'Europe/Moscow'), true);
});

test('schedule mutations enforce roles before handling a booking', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const secret = 'synthetic-schedule-key';
  const prisma = {
    user: { findUnique: async ({ where }: { where: { id: string } }) =>
      ({ id: where.id, role: where.id === teacherId ? 'TEACHER' : 'STUDENT' }) },
  } as unknown as PrismaClient;
  app.register(scheduleRoutes, { prisma, secret });
  const request = (url: string, id?: string) => app.inject({
    method: 'POST', url,
    headers: id ? { authorization: `Bearer ${issueSession(id, secret, Math.floor(Date.now() / 1000))}` } : {},
  });
  assert.equal((await request('/slots/invalid/book')).statusCode, 401);
  assert.equal((await request('/slots/invalid/book', teacherId)).statusCode, 403);
  assert.equal((await request('/slots/invalid/book', studentId)).statusCode, 400);
  assert.equal((await request('/slots/invalid/close', studentId)).statusCode, 403);
  assert.equal((await request('/bookings/invalid/teacher-cancel', studentId)).statusCode, 403);
  assert.equal((await request('/bookings/invalid/reschedule', studentId)).statusCode, 403);
  assert.equal((await request('/bookings/invalid/reschedule', teacherId)).statusCode, 400);
  assert.equal((await request('/slots/invalid/teacher-book', studentId)).statusCode, 403);
});

test('teacher assignment uses the chosen student and returns the shared booking response', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const slotId = randomUUID();
  const requestId = randomUUID();
  const secret = 'synthetic-teacher-booking-key';
  const startsAt = new Date(Date.now() + 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  const tx = {
    $executeRaw: async () => 0,
    user: { findFirst: async ({ where }: { where: { id: string; role: string } }) =>
      where.id === studentId && where.role === 'STUDENT' ? { id: studentId } : null },
    availabilitySlot: { findUnique: async () => ({ startsAt, endsAt, bookings: [], closedAt: null }) },
    booking: {
      findUnique: async () => null,
      create: async ({ data }: { data: unknown }) => {
        assert.deepEqual(data, { id: requestId, slotId, studentId });
        return { id: requestId };
      },
    },
  };
  const prisma = {
    user: { findUnique: async () => ({ id: teacherId, role: 'TEACHER' }) },
    $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaClient;
  app.register(scheduleRoutes, { prisma, secret });
  const book = (target: string) => app.inject({
    method: 'POST', url: `/slots/${slotId}/teacher-book`,
    headers: { authorization: `Bearer ${issueSession(teacherId, secret, Math.floor(Date.now() / 1000))}` },
    payload: { studentId: target, requestId },
  });
  assert.equal((await book(teacherId)).statusCode, 404);
  const result = await book(studentId);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), { id: requestId, slotId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
});

test('lesson history queries only the student from the verified session', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const secret = 'synthetic-history-key';
  const day = new Date('2030-01-01T10:00:00Z');
  let queries = 0;
  const prisma = {
    user: { findUnique: async ({ where }: { where: { id: string } }) =>
      ({ id: where.id, role: where.id === teacherId ? 'TEACHER' : 'STUDENT' }) },
    booking: { findMany: async (query: { where: { studentId: string }; take: number }) => {
      assert.equal(query.where.studentId, studentId);
      assert.equal(query.take, 30);
      queries += 1;
      return [
        { id: 'completed', cancelledAt: null, slot: { startsAt: day, endsAt: day } },
        { id: 'cancelled', cancelledAt: day, slot: { startsAt: day, endsAt: day } },
      ];
    } },
  } as unknown as PrismaClient;
  app.register(scheduleRoutes, { prisma, secret });
  const path = '/bookings/history';
  const headers = (id: string) => ({
    authorization: `Bearer ${issueSession(id, secret, Math.floor(Date.now() / 1000))}`,
  });
  assert.equal((await app.inject(path)).statusCode, 401);
  assert.equal((await app.inject({ url: path, headers: headers(teacherId) })).statusCode, 403);
  const result = await app.inject({ url: `${path}?studentId=${teacherId}`, headers: headers(studentId) });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(result.json().map(({ status }: { status: string }) => status), ['COMPLETED', 'CANCELLED_BY_STUDENT']);
  assert.equal(queries, 1);
});

const url = process.env.TEST_DATABASE_URL;
test('PostgreSQL booking is exclusive, retry-safe and visible only to the permitted accounts',
  { skip: !url && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' }, async () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const calendar = availability(prisma);
    const students = [randomUUID(), randomUUID()];
    const slotIds = [randomUUID(), randomUUID()];
    try {
      await prisma.user.createMany({ data: students.map((id) => ({ id, role: 'STUDENT' })) });
      await Promise.all(slotIds.map((id, index) => calendar.publish({
        id, startsAt: new Date(Date.now() + 3 * 86400_000 + index * 7200_000).toISOString(),
        durationMinutes: 60, timeZone: 'UTC',
      })));
      const [slot, secondSlot] = slotIds;
      const attempts = await Promise.allSettled(students.map((id) => calendar.book(slot, id)));
      const winner = attempts.findIndex((attempt) => attempt.status === 'fulfilled');
      assert.ok(winner >= 0);
      const winning = attempts[winner];
      const losing = attempts[1 - winner];
      assert.equal(winning.status, 'fulfilled');
      assert.equal(losing.status, 'rejected');
      assert.ok(losing.reason instanceof ScheduleError && losing.reason.statusCode === 409);
      assert.deepEqual(await calendar.book(slot, students[winner]), winning.value);
      await assert.rejects(calendar.close(slot), { statusCode: 409 });
      assert.ok(!(await calendar.list()).some(({ id }) => id === slot));
      assert.deepEqual(await calendar.upcoming({ id: students[winner], role: 'STUDENT' }),
        [{ ...winning.value, cancellationChargeApplies: false }]);
      assert.deepEqual(await calendar.upcoming({ id: students[1 - winner], role: 'STUDENT' }), []);
      const race = await Promise.allSettled([calendar.close(secondSlot), calendar.book(secondSlot, students[winner])]);
      assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
      assert.ok(race.some((result) => result.status === 'rejected' && result.reason instanceof ScheduleError &&
        result.reason.statusCode === 409));
      const cancelled = await calendar.cancel(winning.value.id, students[winner], false);
      assert.equal(cancelled.chargeApplies, false);
      assert.deepEqual(await calendar.cancel(winning.value.id, students[winner], true), cancelled);
      assert.deepEqual((await calendar.history(students[winner])).map(({ id, status }) => ({ id, status })),
        [{ id: winning.value.id, status: 'CANCELLED_BY_STUDENT' }]);
      assert.deepEqual(await calendar.history(students[1 - winner]), []);
      assert.ok((await calendar.list()).some(({ id }) => id === slot));
      assert.deepEqual(await calendar.book(slot, students[winner], winning.value.id), winning.value);
      const replacement = await calendar.book(slot, students[winner], randomUUID());
      assert.notEqual(replacement.id, winning.value.id);
      const byTeacher = await calendar.cancelByTeacher(replacement.id, true, '  Test reason  ');
      assert.equal(byTeacher.reason, 'Test reason');
      assert.deepEqual(await calendar.cancelByTeacher(replacement.id, false), byTeacher);
      await assert.rejects(calendar.cancel(replacement.id, students[winner], true), { statusCode: 409 });
      assert.ok((await calendar.list()).some(({ id }) => id === slot));
      const history = await calendar.history(students[winner]);
      assert.ok(history.some(({ id, status, cancellationReason }) =>
        id === replacement.id && status === 'CANCELLED_BY_TEACHER' && cancellationReason === 'Test reason'));
      const newBooking = await calendar.book(slot, students[1 - winner], randomUUID());
      await calendar.cancelByTeacher(newBooking.id, false);
      assert.ok(!(await calendar.list()).some(({ id }) => id === slot));
      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: newBooking.id } });
      assert.equal(stored.chargeApplies, false);
    } finally {
      try {
        await prisma.booking.deleteMany({ where: { slotId: { in: slotIds } } });
        await prisma.availabilitySlot.deleteMany({ where: { id: { in: slotIds } } });
        await prisma.user.deleteMany({ where: { id: { in: students } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });

test('same-day cancellation requires consent, records the charge, and keeps the slot closed',
  { skip: !url && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' }, async () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const calendar = availability(prisma);
    const studentId = randomUUID();
    const slotId = randomUUID();
    const now = new Date();
    const startsAt = new Date(now.getTime() + 3600_000);
    const timeZone = sameLessonDay(now, startsAt, 'UTC') ? 'UTC' : 'Europe/Moscow';
    try {
      await prisma.user.create({ data: { id: studentId, role: 'STUDENT' } });
      await calendar.publish({ id: slotId, startsAt: startsAt.toISOString(), durationMinutes: 60, timeZone });
      const booking = await calendar.book(slotId, studentId, randomUUID());
      await assert.rejects(calendar.cancel(booking.id, randomUUID(), true), { statusCode: 404 });
      await assert.rejects(calendar.cancel(booking.id, studentId, false), { statusCode: 409 });
      const result = await calendar.cancel(booking.id, studentId, true);
      assert.equal(result.chargeApplies, true);
      assert.ok(result.cancelledAt);
      assert.deepEqual(await calendar.cancel(booking.id, studentId, false), result);
      assert.ok(!(await calendar.list()).some(({ id }) => id === slotId));
    } finally {
      try {
        await prisma.booking.deleteMany({ where: { slotId } });
        await prisma.availabilitySlot.deleteMany({ where: { id: slotId } });
        await prisma.user.deleteMany({ where: { id: studentId } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
