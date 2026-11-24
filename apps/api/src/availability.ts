import type { Prisma, PrismaClient } from '@prisma/client';

export type Publication = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
};

export class ScheduleError extends Error {
  constructor(readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export function slotInterval(input: Publication) {
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || startsAt.toISOString() !== input.startsAt) {
    throw new ScheduleError(400, 'Use a canonical UTC start time.');
  }
  try {
    if (/^[+-]/.test(input.timeZone)) throw new RangeError();
    new Intl.DateTimeFormat('en', { timeZone: input.timeZone });
  } catch {
    throw new ScheduleError(400, 'Enter a valid IANA time zone.');
  }
  return { startsAt, endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000) };
}

export function sameLessonDay(now: Date, startsAt: Date, timeZone: string) {
  const calendar = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
  return calendar.format(now) === calendar.format(startsAt);
}

const activeBookings = { where: { cancelledAt: null }, take: 1 };

export function availability(prisma: PrismaClient) {
  const slots = prisma.availabilitySlot;
  function writeCalendar<T>(write: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      // One teacher owns the calendar. Serialize writes while keeping reads concurrent.
      await tx.$executeRaw`LOCK TABLE "AvailabilitySlot" IN SHARE ROW EXCLUSIVE MODE`;
      return write(tx);
    }, { isolationLevel: 'ReadCommitted' });
  }

  return {
    list: () => slots.findMany({
      where: { closedAt: null, startsAt: { gt: new Date() }, bookings: { none: { cancelledAt: null } } },
      orderBy: { startsAt: 'asc' },
    }),
    async publish(input: Publication) {
      const { startsAt, endsAt } = slotInterval(input);
      return writeCalendar(async (tx) => {
        const existing = await tx.availabilitySlot.findUnique({ where: { id: input.id } });
        if (existing) {
          if (existing.startsAt.getTime() !== startsAt.getTime() ||
              existing.endsAt.getTime() !== endsAt.getTime() || existing.timeZone !== input.timeZone) {
            throw new ScheduleError(409, 'This publication ID already belongs to a different slot.');
          }
          return existing;
        }
        if (input.durationMinutes !== 60) throw new ScheduleError(400, 'New lessons must last 60 minutes.');
        if (startsAt <= new Date()) throw new ScheduleError(400, 'A new slot must start in the future.');
        const overlap = await tx.availabilitySlot.findFirst({
          where: { closedAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          select: { id: true },
        });
        if (overlap) throw new ScheduleError(409, 'This time overlaps an open slot.');
        return tx.availabilitySlot.create({ data: { id: input.id, startsAt, endsAt, timeZone: input.timeZone } });
      });
    },
    close(id: string) {
      return writeCalendar(async (tx) => {
        const slot = await tx.availabilitySlot.findUnique({
          where: { id }, include: { bookings: { ...activeBookings, select: { id: true } } },
        });
        if (!slot) throw new ScheduleError(404, 'This slot does not exist.');
        if (slot.bookings.length) throw new ScheduleError(409, 'A booked slot cannot be closed.');
        if (slot.closedAt) {
          const { bookings: _bookings, ...closed } = slot;
          return closed;
        }
        return tx.availabilitySlot.update({ where: { id }, data: { closedAt: new Date() } });
      });
    },
    book(slotId: string, studentId: string, requestId?: string) {
      return writeCalendar(async (tx) => {
        const slot = await tx.availabilitySlot.findUnique({ where: { id: slotId }, include: { bookings: activeBookings } });
        if (!slot) throw new ScheduleError(404, 'This slot does not exist.');
        const times = { slotId, startsAt: slot.startsAt, endsAt: slot.endsAt };
        const previous = requestId
          ? await tx.booking.findUnique({ where: { id: requestId } })
          : await tx.booking.findFirst({ where: { slotId, studentId }, orderBy: { createdAt: 'desc' } });
        if (previous) {
          if (previous.slotId !== slotId || previous.studentId !== studentId) {
            throw new ScheduleError(409, 'This booking request ID is already in use.');
          }
          return { id: previous.id, ...times };
        }
        const [active] = slot.bookings;
        if (active || slot.closedAt || slot.startsAt <= new Date()) {
          throw new ScheduleError(409, 'This time is no longer available.');
        }
        const { id } = await tx.booking.create({ data: { id: requestId, slotId, studentId }, select: { id: true } });
        return { id, ...times };
      });
    },
    cancel(id: string, studentId: string, acceptSameDayCharge: boolean) {
      return writeCalendar(async (tx) => {
        const booking = await tx.booking.findFirst({
          where: { id, studentId },
          include: { slot: { select: { startsAt: true, timeZone: true } } },
        });
        if (!booking) throw new ScheduleError(404, 'This booking does not exist.');
        const { cancelledAt, chargeApplies } = booking;
        if (cancelledAt) return { id, cancelledAt, chargeApplies };

        const now = new Date();
        if (booking.slot.startsAt <= now) throw new ScheduleError(409, 'The lesson has already started.');
        const charge = sameLessonDay(now, booking.slot.startsAt, booking.slot.timeZone);
        if (charge && !acceptSameDayCharge) {
          throw new ScheduleError(409, 'Same-day cancellation is chargeable. Review and confirm the charge.');
        }
        if (charge) await tx.availabilitySlot.update({ where: { id: booking.slotId }, data: { closedAt: now } });
        return tx.booking.update({
          where: { id },
          data: { cancelledAt: now, chargeApplies: charge },
          select: { id: true, cancelledAt: true, chargeApplies: true },
        });
      });
    },
    async upcoming(account: { id: string; role: 'TEACHER' | 'STUDENT' }) {
      const teacher = account.role === 'TEACHER';
      const now = new Date();
      const bookings = await prisma.booking.findMany({
        where: { studentId: teacher ? undefined : account.id, cancelledAt: null, slot: { startsAt: { gt: now } } },
        orderBy: { slot: { startsAt: 'asc' } },
        select: {
          id: true, slotId: true, slot: { select: { startsAt: true, endsAt: true, timeZone: true } },
          student: teacher ? { select: { id: true, telegramId: true, displayName: true } } : false,
        },
      });
      return bookings.map(({ id, slotId, slot, student }) => ({
        id, slotId, startsAt: slot.startsAt, endsAt: slot.endsAt,
        ...(student
          ? { studentReference: student.telegramId?.toString() ?? student.id, studentDisplayName: student.displayName }
          : { cancellationChargeApplies: sameLessonDay(now, slot.startsAt, slot.timeZone) }),
      }));
    },
  };
}
