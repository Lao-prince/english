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
const slotTimes = { startsAt: true, endsAt: true } as const;
const moveHistory = {
  orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  select: { id: true, fromStartsAt: true, fromEndsAt: true, toStartsAt: true, toEndsAt: true, createdAt: true },
};

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
        const student = await tx.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true } });
        if (!student) throw new ScheduleError(404, 'Student account not found.');
        const slot = await tx.availabilitySlot.findUnique({ where: { id: slotId }, include: { bookings: activeBookings } });
        if (!slot) throw new ScheduleError(404, 'This slot does not exist.');
        const times = { slotId, startsAt: slot.startsAt, endsAt: slot.endsAt };
        const previous = requestId
          ? await tx.booking.findUnique({ where: { id: requestId }, include: { slot: { select: slotTimes } } })
          : await tx.booking.findFirst({
            where: { studentId, OR: [{ slotId }, { originalSlotId: slotId }] },
            orderBy: { createdAt: 'desc' }, include: { slot: { select: slotTimes } },
          });
        if (previous) {
          if (previous.studentId !== studentId || (requestId && (previous.originalSlotId ?? previous.slotId) !== slotId)) {
            throw new ScheduleError(409, 'This booking request ID is already in use.');
          }
          return { id: previous.id, slotId: previous.slotId, ...previous.slot };
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
        if (booking.cancelledByTeacher) throw new ScheduleError(409, 'The teacher already cancelled this lesson.');
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
    cancelByTeacher(id: string, reopenSlot: boolean, reason?: string) {
      return writeCalendar(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id }, include: { slot: { select: { startsAt: true } } },
        });
        if (!booking) throw new ScheduleError(404, 'This booking does not exist.');
        if (booking.cancelledAt) {
          if (!booking.cancelledByTeacher) throw new ScheduleError(409, 'The student already cancelled this lesson.');
          return {
            id, cancelledAt: booking.cancelledAt, reopenedSlot: booking.reopenedOnCancellation,
            reason: booking.cancellationReason,
          };
        }
        const cancelledAt = new Date();
        if (booking.completedAt || booking.slot.startsAt <= cancelledAt) {
          throw new ScheduleError(409, 'The lesson has already started.');
        }
        const sharedReason = reason?.trim() || null;
        await tx.booking.update({ where: { id }, data: {
          cancelledAt, cancelledByTeacher: true, reopenedOnCancellation: reopenSlot,
          cancellationReason: sharedReason, chargeApplies: false,
        } });
        await tx.availabilitySlot.update({
          where: { id: booking.slotId }, data: { closedAt: reopenSlot ? null : cancelledAt },
        });
        return { id, cancelledAt, reopenedSlot: reopenSlot, reason: sharedReason };
      });
    },
    reschedule(id: string, teacherId: string, input: { requestId: string; slotId: string; reopenPreviousSlot: boolean }) {
      return writeCalendar(async (tx) => {
        const previous = await tx.bookingMove.findUnique({ where: { id: input.requestId } });
        if (previous) {
          if (previous.bookingId !== id || previous.teacherId !== teacherId || previous.toSlotId !== input.slotId ||
              previous.reopenedPreviousSlot !== input.reopenPreviousSlot) {
            throw new ScheduleError(409, 'This reschedule request ID is already in use.');
          }
          return previous;
        }
        const booking = await tx.booking.findUnique({ where: { id }, include: { slot: { select: slotTimes } } });
        if (!booking) throw new ScheduleError(404, 'This booking does not exist.');
        const now = new Date();
        if (booking.cancelledAt || booking.completedAt || booking.slot.startsAt <= now) {
          throw new ScheduleError(409, 'Only upcoming lessons can be rescheduled.');
        }
        if (booking.slotId === input.slotId) throw new ScheduleError(409, 'Choose a different slot.');
        const target = await tx.availabilitySlot.findUnique({
          where: { id: input.slotId }, include: { bookings: activeBookings },
        });
        if (!target) throw new ScheduleError(404, 'This slot does not exist.');
        if (target.closedAt || target.startsAt <= new Date() || target.bookings.length) {
          throw new ScheduleError(409, 'This time is no longer available.');
        }
        await tx.booking.update({ where: { id }, data: {
          slotId: target.id, originalSlotId: booking.originalSlotId ?? booking.slotId,
        } });
        await tx.availabilitySlot.update({ where: { id: booking.slotId }, data: {
          closedAt: input.reopenPreviousSlot ? null : now,
        } });
        return tx.bookingMove.create({ data: {
          id: input.requestId, bookingId: id, teacherId, fromSlotId: booking.slotId, toSlotId: target.id,
          fromStartsAt: booking.slot.startsAt, fromEndsAt: booking.slot.endsAt,
          toStartsAt: target.startsAt, toEndsAt: target.endsAt, reopenedPreviousSlot: input.reopenPreviousSlot,
          createdAt: now,
        } });
      });
    },
    async history(studentId: string) {
      const bookings = await prisma.booking.findMany({
        where: { studentId, OR: [
          { cancelledAt: { not: null } }, { completedAt: { not: null } },
        ] },
        orderBy: [{ slot: { startsAt: 'desc' } }, { id: 'desc' }],
        take: 30,
        select: {
          id: true, cancelledAt: true, cancelledByTeacher: true, cancellationReason: true,
          slot: { select: { startsAt: true, endsAt: true } },
          moves: moveHistory,
        },
      });
      return bookings.map(({ id, cancelledAt, cancelledByTeacher, cancellationReason, slot, moves }) => ({
        id, ...slot, cancelledAt, cancellationReason, ...(moves?.length && { moves }),
        status: cancelledByTeacher ? 'CANCELLED_BY_TEACHER' as const
          : cancelledAt ? 'CANCELLED_BY_STUDENT' as const : 'COMPLETED' as const,
      }));
    },
    async upcoming(account: { id: string; role: 'TEACHER' | 'STUDENT' }) {
      const teacher = account.role === 'TEACHER';
      const now = new Date();
      const bookings = await prisma.booking.findMany({
        where: { studentId: teacher ? undefined : account.id, cancelledAt: null, slot: { startsAt: { gt: now } } },
        orderBy: { slot: { startsAt: 'asc' } },
        select: {
          id: true, slotId: true, slot: { select: { startsAt: true, endsAt: true, timeZone: true } },
          moves: moveHistory,
          student: teacher ? { select: {
            id: true, telegramId: true, displayName: true, telegramName: true, telegramUsername: true, telegramAvatarUrl: true,
          } } : false,
        },
      });
      return bookings.map(({ id, slotId, slot, student, moves }) => ({
        id, slotId, startsAt: slot.startsAt, endsAt: slot.endsAt,
        ...(moves.length && { moves }),
        ...(student
          ? {
            studentReference: student.telegramId?.toString() ?? student.id,
            studentDisplayName: student.displayName ?? student.telegramName ??
              (student.telegramUsername ? `@${student.telegramUsername}` : null),
            studentAvatarUrl: student.telegramAvatarUrl,
          }
          : { cancellationChargeApplies: sameLessonDay(now, slot.startsAt, slot.timeZone) }),
      }));
    },
  };
}
