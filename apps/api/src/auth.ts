import type { FastifyInstance } from 'fastify';
import { inviteCodePattern, type invitations } from './invitations.js';
import { issueSession, readSession, sessionLifetime } from './session.js';
import { verifyTelegramId } from './telegram.js';

type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
type AuthOptions = {
  botToken?: string;
  secret?: string;
  findByTelegramId: (id: bigint) => Promise<Account | null>;
  findById: (id: string) => Promise<Account | null>;
  invitations?: ReturnType<typeof invitations>;
  botUsername?: string;
};

const now = () => Math.floor(Date.now() / 1000);
const body = {
  type: 'object',
  required: ['initData'],
  additionalProperties: false,
  properties: {
    initData: { type: 'string', minLength: 1, maxLength: 8192 },
    inviteCode: { type: 'string', pattern: inviteCodePattern },
  },
};

export async function authRoutes(app: FastifyInstance, options: AuthOptions) {
  const { botToken, secret, findByTelegramId, findById } = options;
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.post<{ Body: { initData: string; inviteCode?: string } }>('/telegram', {
    schema: { body },
    bodyLimit: 64 * 1024,
  }, async (request, reply) => {
    if (typeof request.body?.initData !== 'string') {
      return reply.code(400).send({ error: 'Telegram launch data is required' });
    }
    if (!botToken || !secret) return reply.code(503).send({ error: 'Sign-in unavailable' });
    const telegramId = verifyTelegramId(request.body.initData, botToken, now());
    if (telegramId === null) return reply.code(401).send({ error: 'Invalid Telegram launch data' });

    const inviteCode = request.body.inviteCode ?? new URLSearchParams(request.body.initData).get('start_param');
    let account = await findByTelegramId(telegramId);
    if (!account && inviteCode && new RegExp(inviteCodePattern).test(inviteCode)) {
      account = await options.invitations?.redeem(inviteCode, telegramId) ?? null;
    }
    if (!account) return reply.code(403).send({ error: 'Account has not been approved' });
    const token = issueSession(account.id, secret, now());
    return reply.send({ token, expiresIn: sessionLifetime });
  });

  app.post('/invitations', async (request, reply) => {
    const id = secret ? readSession(request.headers.authorization, secret, now()) : null;
    const account = id ? await findById(id) : null;
    if (!account) return reply.code(401).send({ error: 'Sign-in required' });
    if (account.role !== 'TEACHER') return reply.code(403).send({ error: 'Teacher access required' });
    if (!options.invitations) return reply.code(503).send({ error: 'Invitations unavailable' });
    const invitation = await options.invitations.create();
    const username = options.botUsername;
    const link = username && /^[A-Za-z0-9_]{5,32}$/.test(username)
      ? `https://t.me/${username}?startapp=${invitation.code}`
      : undefined;
    return reply.code(201).send({ ...invitation, link });
  });

  app.get('/me', async (request, reply) => {
    const id = secret ? readSession(request.headers.authorization, secret, now()) : null;
    const account = id ? await findById(id) : null;
    if (!account) return reply.code(401).send({ error: 'Sign-in required' });
    return { id: account.id, role: account.role };
  });
}
