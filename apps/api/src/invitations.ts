import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const inviteCodePattern = '^invite_[A-Za-z0-9_-]{24}$';
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

export function invitations(prisma: PrismaClient) {
  const select = { id: true, role: true } as const;
  return {
    async create() {
      const code = `invite_${randomBytes(18).toString('base64url')}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.studentInvitation.create({ data: { codeHash: hashCode(code), expiresAt } });
      return { code, expiresAt };
    },
    redeem(code: string, telegramId: bigint) {
      return prisma.$transaction(async (tx) => {
        // Serialize invitation changes for the single-teacher pilot.
        await tx.$executeRaw`LOCK TABLE "StudentInvitation" IN SHARE ROW EXCLUSIVE MODE`;
        const existing = await tx.user.findUnique({ where: { telegramId }, select });
        if (existing) return existing;
        const now = new Date();
        const { count } = await tx.studentInvitation.updateMany({
          where: { codeHash: hashCode(code), expiresAt: { gt: now }, redeemedAt: null },
          data: { redeemedAt: now },
        });
        if (!count) return null;
        return tx.user.upsert({
          where: { telegramId },
          create: { telegramId, role: 'STUDENT' },
          update: {},
          select,
        });
      }, { isolationLevel: 'ReadCommitted' });
    },
  };
}
