import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { invitations } from '../src/invitations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL allows only one student to redeem an invitation',
  { skip: !databaseUrl && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database' },
  async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const service = invitations(prisma);
    const ids = [BigInt(randomInt(2 ** 40)), BigInt(randomInt(2 ** 40) + 2 ** 40)];
    const invitation = await service.create();
    const codeHash = createHash('sha256').update(invitation.code).digest('hex');
    try {
      const results = await Promise.all(ids.map((id) => service.redeem(invitation.code, id)));
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(results.find(Boolean)?.role, 'STUDENT');
      const winner = results.findIndex(Boolean);
      assert.deepEqual(await service.redeem(invitation.code, ids[winner]), results[winner]);
      assert.equal(await prisma.user.count({ where: { telegramId: { in: ids } } }), 1);
    } finally {
      try {
        await prisma.studentInvitation.delete({ where: { codeHash } });
        await prisma.user.deleteMany({ where: { telegramId: { in: ids } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
