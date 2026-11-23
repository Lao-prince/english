import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { creditRoutes } from '../src/credit-routes.js';
import { creditLedger, CreditError, settlementReason } from '../src/credits.js';
import { issueSession } from '../src/session.js';

test('settlement distinguishes completed lessons, chargeable cancellations and free cancellations', () => {
  const now = new Date('2030-01-01T11:00:00Z');
  const lesson = { slot: { endsAt: now }, cancelledAt: null, chargeApplies: false };
  assert.equal(settlementReason(lesson, now), 'COMPLETED_LESSON');
  assert.equal(settlementReason({ ...lesson, slot: { endsAt: new Date(now.getTime() + 1) } }, now), null);
  assert.equal(settlementReason({ ...lesson, cancelledAt: now }, now), null);
  assert.equal(settlementReason({ ...lesson, cancelledAt: now, chargeApplies: true }, now), 'SAME_DAY_CANCELLATION');
});

test('credit routes scope student balance to the session and restrict grants to teachers', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const student = { id: randomUUID(), role: 'STUDENT' } as const;
  const teacher = { id: randomUUID(), role: 'TEACHER' } as const;
  const secret = 'synthetic-credit-secret';
  await app.register(creditRoutes, {
    secret,
    findAccount: async (id) => id === student.id ? student : id === teacher.id ? teacher : null,
    ledger: {
      summary: async (id, pending) => {
        assert.equal(id, student.id);
        return { balance: 1, entries: [], ...(pending && { pending: [] }) };
      },
      grant: async () => { throw new Error('Unexpected grant'); },
      settle: async () => { throw new Error('Unexpected settlement'); },
    },
  });
  const headers = (id: string) => ({
    authorization: `Bearer ${issueSession(id, secret, Math.floor(Date.now() / 1000))}`,
  });
  assert.equal((await app.inject('/me')).statusCode, 401);
  assert.deepEqual((await app.inject({ url: '/me', headers: headers(student.id) })).json(), { balance: 1, entries: [] });
  assert.equal((await app.inject({ url: `/students/${teacher.id}`, headers: headers(student.id) })).statusCode, 403);
  assert.equal((await app.inject({
    method: 'POST', url: `/students/${student.id}/grant`, headers: headers(student.id), payload: { id: randomUUID(), amount: 1 },
  })).statusCode, 403);
  assert.equal((await app.inject({ url: `/students/${student.id}`, headers: headers(teacher.id) })).statusCode, 200);
});

const url = process.env.TEST_DATABASE_URL;
test('credit settlement is exclusive and concurrent bookings cannot overspend',
  { skip: !url && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' }, async () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const ledger = creditLedger(prisma);
    const studentId = randomUUID();
    const grantId = randomUUID();
    const slotIds = [randomUUID(), randomUUID(), randomUUID()];
    const bookingIds = [randomUUID(), randomUUID(), randomUUID()];
    try {
      await prisma.user.create({ data: { id: studentId, role: 'STUDENT' } });
      const now = Date.now();
      await prisma.availabilitySlot.createMany({ data: slotIds.map((id, index) => ({
        id, startsAt: new Date(now - (index + 2) * 3600_000),
        endsAt: new Date(now - (index + 1) * 3600_000), timeZone: 'UTC',
      })) });
      await prisma.booking.createMany({ data: bookingIds.map((id, index) => ({
        id, studentId, slotId: slotIds[index],
        cancelledAt: index === 0 ? null : new Date(now - 10_800_000),
        chargeApplies: index === 1,
      })) });

      const grants = await Promise.all([ledger.grant(studentId, grantId, 1), ledger.grant(studentId, grantId, 1)]);
      assert.deepEqual(grants[0], grants[1]);
      await assert.rejects(ledger.grant(studentId, grantId, 2), { statusCode: 409 });
      await assert.rejects(ledger.settle(studentId, bookingIds[2]), { statusCode: 409 });
      const results = await Promise.allSettled(bookingIds.slice(0, 2).map((id) => ledger.settle(studentId, id)));
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      assert.equal(fulfilled.length, 1);
      assert.ok(results.some((result) => result.status === 'rejected' && result.reason instanceof CreditError &&
        result.reason.message.includes('Add lesson credits')));
      const debit = fulfilled[0].value;
      assert.ok(debit.bookingId);
      assert.deepEqual(await ledger.settle(studentId, debit.bookingId), debit);
      assert.equal((await ledger.summary(studentId, false)).balance, 0);
      assert.equal((await ledger.summary(studentId, true)).pending?.length, 1);
    } finally {
      try {
        await prisma.creditEntry.deleteMany({ where: { studentId } });
        await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await prisma.availabilitySlot.deleteMany({ where: { id: { in: slotIds } } });
        await prisma.user.deleteMany({ where: { id: studentId } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
