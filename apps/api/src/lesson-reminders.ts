import type { PrismaClient } from '@prisma/client';
import { reminderText, sendReminder } from './telegram-reminder.js';

type Claim = { bookingId: string; recipientId: string; attempts: number };
const hour = 3_600_000;
const pollInterval = 30_000;

export function lessonReminders(prisma: PrismaClient, token: string, warn: () => void, send = sendReminder) {
  const reminders = prisma.lessonReminder;

  async function enqueue(now: Date) {
    const horizon = new Date(now.getTime() + hour);
    await prisma.$executeRaw`
      INSERT INTO "LessonReminder" ("bookingId", "recipientId", "nextAttemptAt", "updatedAt")
      SELECT b."id", u."id", ${now}, ${now}
      FROM "Booking" b
      JOIN "AvailabilitySlot" s ON s."id" = b."slotId"
      JOIN "User" u ON (u."id" = b."studentId" AND u."role" = 'STUDENT') OR u."role" = 'TEACHER'
      WHERE b."cancelledAt" IS NULL AND s."startsAt" > ${now} AND s."startsAt" <= ${horizon}
        AND u."telegramId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "LessonReminder" n WHERE n."bookingId" = b."id" AND n."recipientId" = u."id"
        )
      ORDER BY s."startsAt", b."id", u."id"
      LIMIT 100
      ON CONFLICT ("bookingId", "recipientId") DO NOTHING
    `;
  }

  async function claim(now: Date) {
    const [job] = await prisma.$queryRaw<Claim[]>`
      WITH due AS (
        SELECT n."bookingId", n."recipientId"
        FROM "LessonReminder" n
        JOIN "Booking" b ON b."id" = n."bookingId"
        JOIN "AvailabilitySlot" s ON s."id" = b."slotId"
        WHERE n."state" = 'PENDING' AND n."nextAttemptAt" <= ${now}
          AND b."cancelledAt" IS NULL AND s."startsAt" > ${now}
        ORDER BY s."startsAt", n."nextAttemptAt"
        LIMIT 1
        FOR UPDATE OF n SKIP LOCKED
      )
      UPDATE "LessonReminder" n
      SET "state" = 'SENDING', "updatedAt" = ${now}, "attempts" = n."attempts" + 1
      FROM due
      WHERE n."bookingId" = due."bookingId" AND n."recipientId" = due."recipientId"
      RETURNING n."bookingId", n."recipientId", n."attempts"
    `;
    return job;
  }

  async function deliver({ bookingId, recipientId, attempts }: Claim) {
    const key = { bookingId, recipientId };
    const row = await reminders.findUnique({
      where: { bookingId_recipientId: key },
      select: {
        recipient: { select: { telegramId: true } },
        booking: { select: { cancelledAt: true, slot: { select: { startsAt: true, timeZone: true } } } },
      },
    });
    if (!row) return;
    const { booking, recipient } = row;
    const { startsAt, timeZone } = booking.slot;
    const result = booking.cancelledAt || startsAt <= new Date() || !recipient.telegramId
      ? { state: 'SKIPPED' as const }
      : await send(token, recipient.telegramId, reminderText(startsAt, timeZone));
    const updatedAt = new Date();
    const nextAttemptAt = result.state === 'PENDING'
      ? new Date(updatedAt.getTime() + result.retrySeconds * 1000) : updatedAt;
    const state = result.state === 'PENDING'
      ? attempts >= 3 ? 'FAILED' : nextAttemptAt >= startsAt ? 'SKIPPED' : 'PENDING'
      : result.state;
    await reminders.updateMany({ where: { ...key, state: 'SENDING' }, data: { state, nextAttemptAt, updatedAt } });
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    try {
      const now = new Date();
      await reminders.updateMany({
        where: { state: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 120_000) } },
        data: { state: 'UNKNOWN', updatedAt: now },
      });
      await reminders.updateMany({
        where: { state: 'PENDING', booking: { OR: [
          { cancelledAt: { not: null } }, { slot: { startsAt: { lte: now } } },
        ] } },
        data: { state: 'SKIPPED', updatedAt: now },
      });
      await enqueue(now);
      for (let index = 0; index < 10 && !stopped; index += 1) {
        const job = await claim(new Date());
        if (!job) break;
        await deliver(job);
      }
    } catch {
      warn();
    } finally {
      if (!stopped) timer = setTimeout(() => { current = tick(); }, pollInterval).unref();
    }
  }

  let current = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await current;
  };
}
