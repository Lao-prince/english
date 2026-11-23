import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { lessonReminders } from '../src/lesson-reminders.js';
import { reminderText, sendReminder } from '../src/telegram-reminder.js';

test('reminder text uses the lesson time zone', () => {
  const text = reminderText(new Date('2032-01-01T22:30:00Z'), 'Europe/Moscow');
  assert.match(text, /2 января/);
  assert.match(text, /01:30/);
  assert.match(text, /Europe\/Moscow/);
});

const url = process.env.TEST_DATABASE_URL;
test('two reminder workers claim the same booking only once per recipient',
  { skip: !url && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' }, async () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const teacher = randomUUID();
    const student = randomUUID();
    const slotId = randomUUID();
    const bookingId = randomUUID();
    const stops: (() => Promise<void>)[] = [];
    const sent: bigint[] = [];
    let failed = false;
    try {
      await prisma.user.createMany({ data: [
        { id: teacher, role: 'TEACHER', telegramId: 9007199000000001n },
        { id: student, role: 'STUDENT', telegramId: 9007199000000002n },
      ] });
      const now = Date.now();
      const startsAt = new Date(now + 600_000);
      await prisma.availabilitySlot.create({
        data: { id: slotId, startsAt, endsAt: new Date(now + 900_000), timeZone: 'UTC' },
      });
      await prisma.booking.create({ data: { id: bookingId, slotId, studentId: student } });
      const start = () => lessonReminders(prisma, 'synthetic-token', () => { failed = true; }, async (_token, chatId, text) => {
        if (text === reminderText(startsAt, 'UTC')) sent.push(chatId);
        return { state: 'SENT' };
      });
      stops.push(start(), start());
      for (let i = 0; i < 100 && sent.length < 2 && !failed; i += 1) await setTimeout(30);
      await Promise.all(stops.map((stop) => stop()));
      assert.equal(failed, false);
      assert.deepEqual(sent.sort(), [9007199000000001n, 9007199000000002n]);
      assert.equal(await prisma.lessonReminder.count({ where: { bookingId, state: 'SENT' } }), 2);
    } finally {
      await Promise.all(stops.map((stop) => stop()));
      try {
        await prisma.booking.deleteMany({ where: { id: bookingId } });
        await prisma.availabilitySlot.deleteMany({ where: { id: slotId } });
        await prisma.user.deleteMany({ where: { id: { in: [teacher, student] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });

test('Telegram reminders distinguish confirmed delivery, refusal, rate limits, and unknown delivery', async () => {
  const send = (status: number, body: object) =>
    sendReminder('synthetic-token', 123n, 'Synthetic reminder', async (url, init) => {
      assert.equal(url, 'https://api.telegram.org/botsynthetic-token/sendMessage');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { chat_id: 123, text: 'Synthetic reminder' });
      return Response.json(body, { status });
    });
  assert.deepEqual(await send(200, { ok: true }), { state: 'SENT' });
  assert.deepEqual(await send(403, { ok: false }), { state: 'FAILED' });
  assert.deepEqual(await send(429, { ok: false, parameters: { retry_after: 45 } }), { state: 'PENDING', retrySeconds: 45 });
  assert.deepEqual(await send(502, { ok: false }), { state: 'UNKNOWN' });
  assert.deepEqual(await send(200, {}), { state: 'UNKNOWN' });
  assert.deepEqual(await sendReminder('synthetic-token', 123n, 'Synthetic reminder', async () => {
    throw new Error('Synthetic timeout');
  }), { state: 'UNKNOWN' });
});
