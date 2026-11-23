import type { Prisma, PrismaClient } from '@prisma/client';

export class CreditError extends Error {
  constructor(readonly statusCode: 404 | 409, message: string) {
    super(message);
  }
}

export function settlementReason(booking: {
  cancelledAt: Date | null;
  chargeApplies: boolean;
  slot: { endsAt: Date };
}, now: Date) {
  if (booking.cancelledAt) return booking.chargeApplies ? 'SAME_DAY_CANCELLATION' : null;
  return booking.slot.endsAt <= now ? 'COMPLETED_LESSON' : null;
}

const entryFields = { id: true, bookingId: true, amount: true, reason: true, createdAt: true } as const;

async function balance(tx: Prisma.TransactionClient, studentId: string) {
  const result = await tx.creditEntry.aggregate({ where: { studentId }, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}

export function creditLedger(prisma: PrismaClient) {
  function writeForStudent<T>(studentId: string, write: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      const student = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User" WHERE "id" = ${studentId}::uuid AND "role" = 'STUDENT' FOR NO KEY UPDATE
      `;
      if (!student.length) throw new CreditError(404, 'Student account not found.');
      return write(tx);
    }, { isolationLevel: 'ReadCommitted' });
  }

  return {
    summary(studentId: string, includePending: boolean) {
      return prisma.$transaction(async (tx) => {
        const student = await tx.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true } });
        if (!student) throw new CreditError(404, 'Student account not found.');
        const now = new Date();
        const [remaining, entries, pending] = await Promise.all([
          balance(tx, studentId),
          tx.creditEntry.findMany({
            where: { studentId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: entryFields, take: 30,
          }),
          includePending ? tx.booking.findMany({
            where: { studentId, creditEntry: null, OR: [
              { cancelledAt: { not: null }, chargeApplies: true },
              { cancelledAt: null, slot: { endsAt: { lte: now } } },
            ] },
            orderBy: { slot: { startsAt: 'asc' } },
            select: { id: true, cancelledAt: true, chargeApplies: true, slot: { select: { startsAt: true, endsAt: true } } },
          }) : [],
        ]);
        return {
          balance: remaining, entries,
          ...(includePending && { pending: pending.map((booking) => ({
            bookingId: booking.id, startsAt: booking.slot.startsAt, reason: settlementReason(booking, now),
          })) }),
        };
      }, { isolationLevel: 'RepeatableRead' });
    },
    grant(studentId: string, id: string, amount: number) {
      return writeForStudent(studentId, async (tx) => {
        const existing = await tx.creditEntry.findUnique({ where: { id }, select: { ...entryFields, studentId: true } });
        if (existing) {
          const { studentId: owner, ...entry } = existing;
          if (owner !== studentId || entry.reason !== 'GRANT' || entry.amount !== amount) {
            throw new CreditError(409, 'This credit request ID is already in use.');
          }
          return entry;
        }
        const inserted = await tx.creditEntry.createMany({
          data: { id, studentId, amount, reason: 'GRANT' }, skipDuplicates: true,
        });
        if (!inserted.count) throw new CreditError(409, 'This credit request ID is already in use.');
        return tx.creditEntry.findUniqueOrThrow({ where: { id }, select: entryFields });
      });
    },
    settle(studentId: string, bookingId: string) {
      return writeForStudent(studentId, async (tx) => {
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, studentId },
          select: { cancelledAt: true, chargeApplies: true, slot: { select: { endsAt: true } }, creditEntry: { select: entryFields } },
        });
        if (!booking) throw new CreditError(404, 'Booking not found.');
        if (booking.creditEntry) return booking.creditEntry;
        const reason = settlementReason(booking, new Date());
        if (!reason) throw new CreditError(409, 'This lesson is not eligible for settlement.');
        if (await balance(tx, studentId) < 1) throw new CreditError(409, 'Add lesson credits before settling this lesson.');
        return tx.creditEntry.create({ data: { studentId, bookingId, amount: -1, reason }, select: entryFields });
      });
    },
  };
}
