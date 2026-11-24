import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { availability, ScheduleError, slotInterval } from '../src/availability.js';

test('slot intervals use elapsed minutes and reject invalid calendar input', () => {
  const input = {
    id: randomUUID(),
    startsAt: '2035-03-25T00:30:00.000Z',
    durationMinutes: 60,
    timeZone: 'Europe/Berlin',
  };
  assert.equal(slotInterval(input).endsAt.toISOString(), '2035-03-25T01:30:00.000Z');
  assert.throws(() => slotInterval({ ...input, startsAt: '2035-02-31T00:30:00.000Z' }), ScheduleError);
  assert.throws(() => slotInterval({ ...input, timeZone: 'Invalid/Zone' }), ScheduleError);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL serializes overlapping publications and preserves mutation retries',
  { skip: !databaseUrl && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' },
  async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const schedule = availability(prisma);
    const startsAt = new Date(Date.now() + 86400_000).toISOString();
    const first = { id: randomUUID(), startsAt, durationMinutes: 60, timeZone: 'UTC' };
    const second = { ...first, id: randomUUID() };
    try {
      await assert.rejects(schedule.publish({ ...first, durationMinutes: 30 }), { statusCode: 400 });
      const attempts = await Promise.allSettled([schedule.publish(first), schedule.publish(second)]);
      const winners = attempts.flatMap((attempt) => attempt.status === 'fulfilled' ? [attempt.value] : []);
      const losers = attempts.flatMap((attempt) => attempt.status === 'rejected' ? [attempt.reason] : []);
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.ok(losers[0] instanceof ScheduleError && losers[0].statusCode === 409);
      const [winner] = winners;
      const retry = winner.id === first.id ? first : second;
      assert.deepEqual(await schedule.publish(retry), winner);
      const closed = await schedule.close(winner.id);
      assert.ok(closed.closedAt);
      assert.deepEqual(await schedule.close(winner.id), closed);
      assert.deepEqual(await schedule.publish(retry), closed);
      const replacement = winner.id === first.id ? second : first;
      assert.equal((await schedule.publish(replacement)).id, replacement.id);
    } finally {
      try {
        await prisma.availabilitySlot.deleteMany({ where: { id: { in: [first.id, second.id] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
