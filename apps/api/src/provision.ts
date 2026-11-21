import { PrismaClient, Role } from '@prisma/client';

const [roleInput, idInput, extra] = process.argv.slice(2);
const role = roleInput?.toUpperCase();

if ((role !== Role.TEACHER && role !== Role.STUDENT) ||
    !idInput || !/^[1-9]\d{0,15}$/.test(idInput) ||
    !Number.isSafeInteger(Number(idInput)) || extra !== undefined) {
  console.error('Usage: npm run user:provision -- <teacher|student> <telegram-id>');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const telegramId = BigInt(idInput);
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { role, telegramId },
    update: {},
    select: { role: true },
  });
  if (user.role !== role) throw new Error('This Telegram account already has a different role');
  console.log(`Provisioned ${role.toLowerCase()} account.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Provisioning failed');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
