import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { authRoutes } from './auth.js';
import { creditRoutes } from './credit-routes.js';
import { creditLedger } from './credits.js';
import { invitations } from './invitations.js';
import { lessonReminders } from './lesson-reminders.js';
import { scheduleRoutes } from './schedule.js';
import { studentRoutes } from './student-routes.js';
import { studentRoster } from './students.js';

const app = Fastify({
  logger: true,
  ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
});
const prisma = new PrismaClient();
const select = { id: true, role: true } as const;
const secret = process.env.SESSION_SECRET?.trim();
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

if ((secret || process.env.NODE_ENV === 'production') && !/^[a-f0-9]{64}$/i.test(secret ?? '')) {
  throw new Error('SESSION_SECRET must be a 32-byte hex value');
}
if (process.env.NODE_ENV === 'production' && !botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required in production');
}

app.get('/api/health', async () => ({ status: 'ok' }));
app.register(authRoutes, {
  prefix: '/api/auth',
  botToken,
  secret,
  invitations: invitations(prisma),
  botUsername: process.env.TELEGRAM_BOT_USERNAME?.trim(),
  findByTelegramId: (telegramId) => prisma.user.findUnique({ where: { telegramId }, select }),
  findById: (id) => prisma.user.findUnique({ where: { id }, select }),
});
let stopReminders: (() => Promise<void>) | undefined;
app.addHook('onClose', async () => {
  await stopReminders?.();
  await prisma.$disconnect();
});
app.register(scheduleRoutes, { prefix: '/api/schedule', prisma, secret });
app.register(studentRoutes, {
  prefix: '/api/students',
  secret,
  roster: studentRoster(prisma),
  findRole: async (id) => (await prisma.user.findUnique({ where: { id }, select: { role: true } }))?.role ?? null,
});
app.register(creditRoutes, {
  prefix: '/api/credits', secret, ledger: creditLedger(prisma),
  findAccount: (id) => prisma.user.findUnique({ where: { id }, select }),
});

try {
  await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port: 3000 });
  if (process.env.NODE_ENV === 'production' && botToken) {
    stopReminders = lessonReminders(prisma, botToken, () => app.log.warn('Lesson reminder cycle failed'));
  }
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
