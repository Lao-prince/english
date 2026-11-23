import type { Prisma, PrismaClient } from '@prisma/client';

const rosterFields = { id: true, displayName: true, telegramId: true, createdAt: true } as const;

function rosterEntry(student: Prisma.UserGetPayload<{ select: typeof rosterFields }>) {
  return { ...student, telegramId: student.telegramId?.toString() ?? null };
}

export function normalizeDisplayName(name: string | null) {
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > 80 || /\p{Cc}/u.test(trimmed)) return undefined;
  return trimmed;
}

export function studentRoster(prisma: PrismaClient) {
  return {
    async list() {
      const students = await prisma.user.findMany({
        where: { role: 'STUDENT' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: rosterFields,
      });
      return students.map(rosterEntry);
    },
    async rename(id: string, displayName: string | null) {
      const [student] = await prisma.user.updateManyAndReturn({
        where: { id, role: 'STUDENT' }, data: { displayName }, select: rosterFields,
      });
      return student ? rosterEntry(student) : null;
    },
  };
}
