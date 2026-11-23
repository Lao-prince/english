import type { PrismaClient } from '@prisma/client';

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

export function availability(prisma: PrismaClient) {
  const slots = prisma.availabilitySlot;
  return {
    list: () => slots.findMany({
      where: { closedAt: null, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
    }),
    async publish(input: Publication) {
      const { startsAt, endsAt } = slotInterval(input);
      return prisma.$transaction(async (tx) => {
        // One teacher owns the calendar. Serialize writes while keeping reads concurrent.
        await tx.$executeRaw`LOCK TABLE "AvailabilitySlot" IN SHARE ROW EXCLUSIVE MODE`;
        const existing = await tx.availabilitySlot.findUnique({ where: { id: input.id } });
        if (existing) {
          if (existing.startsAt.getTime() !== startsAt.getTime() ||
              existing.endsAt.getTime() !== endsAt.getTime() || existing.timeZone !== input.timeZone) {
            throw new ScheduleError(409, 'This publication ID already belongs to a different slot.');
          }
          return existing;
        }
        if (startsAt <= new Date()) throw new ScheduleError(400, 'A new slot must start in the future.');
        const overlap = await tx.availabilitySlot.findFirst({
          where: { closedAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          select: { id: true },
        });
        if (overlap) throw new ScheduleError(409, 'This time overlaps an open slot.');
        return tx.availabilitySlot.create({ data: { id: input.id, startsAt, endsAt, timeZone: input.timeZone } });
      }, { isolationLevel: 'ReadCommitted' });
    },
    async close(id: string) {
      await slots.updateMany({ where: { id, closedAt: null }, data: { closedAt: new Date() } });
      const slot = await slots.findUnique({ where: { id } });
      if (!slot) throw new ScheduleError(404, 'This slot does not exist.');
      return slot;
    },
  };
}
