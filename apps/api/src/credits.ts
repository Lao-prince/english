import type { Prisma, PrismaClient } from '@prisma/client';
import { packageExpiry, type PackageTerms } from './credit-package.js';

export class CreditError extends Error {
  constructor(readonly statusCode: 400 | 404 | 409, message: string) {
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

const entryFields = {
  id: true, bookingId: true, reversesId: true, packageId: true, amount: true, reason: true, createdAt: true,
  validThrough: true, packageTimeZone: true, expiresAt: true,
} as const;

async function creditBalances(tx: Prisma.TransactionClient, studentId: string, now: Date) {
  const [grants, changes] = await Promise.all([
    tx.creditEntry.findMany({
      where: { studentId, expiresAt: { not: null } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, expiresAt: true, validThrough: true, packageTimeZone: true },
    }),
    tx.creditEntry.groupBy({
      by: ['packageId'], where: { studentId, expiresAt: null }, _sum: { amount: true },
    }),
  ]);
  const totals = new Map(changes.map(({ packageId, _sum }) => [packageId, _sum.amount ?? 0]));
  const nonExpiringBalance = totals.get(null) ?? 0;
  const packages = grants.flatMap(({ id, amount, expiresAt, validThrough, packageTimeZone }) =>
    expiresAt && validThrough && packageTimeZone ? [{
      id, amount, expiresAt, validThrough, timeZone: packageTimeZone,
      remaining: amount + (totals.get(id) ?? 0), expired: expiresAt <= now,
    }] : []);
  return {
    balance: packages.reduce((total, pack) => total + (pack.expired ? 0 : pack.remaining), nonExpiringBalance),
    nonExpiringBalance, packages,
  };
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
        const [balances, entries, pending] = await Promise.all([
          creditBalances(tx, studentId, now),
          tx.creditEntry.findMany({
            where: { studentId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { ...entryFields, reversal: { select: { id: true } } }, take: 30,
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
          ...balances, entries: entries.map(({ reversal, ...entry }) => ({ ...entry, reversed: reversal !== null })),
          ...(includePending && { pending: pending.map((booking) => ({
            bookingId: booking.id, startsAt: booking.slot.startsAt, reason: settlementReason(booking, now),
          })) }),
        };
      }, { isolationLevel: 'RepeatableRead' });
    },
    grant(studentId: string, id: string, amount: number, terms?: PackageTerms) {
      return writeForStudent(studentId, async (tx) => {
        const existing = await tx.creditEntry.findUnique({ where: { id }, select: { ...entryFields, studentId: true } });
        if (existing) {
          const { studentId: owner, ...entry } = existing;
          if (owner !== studentId || entry.reason !== 'GRANT' || entry.amount !== amount ||
              entry.validThrough !== (terms?.validThrough ?? null) || entry.packageTimeZone !== (terms?.timeZone ?? null)) {
            throw new CreditError(409, 'This credit request ID is already in use.');
          }
          return entry;
        }
        const now = new Date();
        const expiresAt = terms ? packageExpiry(terms) : null;
        if (terms && !expiresAt) throw new CreditError(400, 'Enter a valid package date and time zone.');
        if (expiresAt && expiresAt <= now) throw new CreditError(409, 'The package expiry must be in the future.');
        const inserted = await tx.creditEntry.createMany({
          data: {
            id, studentId, amount, reason: 'GRANT', createdAt: now, expiresAt,
            validThrough: terms?.validThrough, packageTimeZone: terms?.timeZone,
          },
          skipDuplicates: true,
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
        const now = new Date();
        const reason = settlementReason(booking, now);
        if (!reason) throw new CreditError(409, 'This lesson is not eligible for settlement.');
        const { balance, packages } = await creditBalances(tx, studentId, now);
        if (balance < 1) throw new CreditError(409, 'Add lesson credits before settling this lesson.');
        const pack = packages.find(({ expired, remaining }) => !expired && remaining > 0);
        return tx.creditEntry.create({
          data: { studentId, bookingId, packageId: pack?.id, amount: -1, reason }, select: entryFields,
        });
      });
    },
    reverse(studentId: string, entryId: string) {
      return writeForStudent(studentId, async (tx) => {
        const debit = await tx.creditEntry.findFirst({
          where: { id: entryId, studentId },
          select: { amount: true, bookingId: true, packageId: true, reversal: { select: entryFields } },
        });
        if (!debit) throw new CreditError(404, 'Credit entry not found.');
        if (debit.amount !== -1 || !debit.bookingId) {
          throw new CreditError(409, 'Only a lesson debit can be reversed.');
        }
        if (debit.reversal) return debit.reversal;
        return tx.creditEntry.create({
          data: { studentId, reversesId: entryId, packageId: debit.packageId, amount: 1, reason: 'DEBIT_REVERSAL' },
          select: entryFields,
        });
      });
    },
  };
}
