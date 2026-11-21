import type { FastifyInstance } from 'fastify';
import { issueSession, readSession, sessionLifetime } from './session.js';
import { verifyTelegramId } from './telegram.js';

type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
type AuthOptions = {
  botToken?: string;
  secret?: string;
  findByTelegramId: (id: bigint) => Promise<Account | null>;
  findById: (id: string) => Promise<Account | null>;
};

const now = () => Math.floor(Date.now() / 1000);
const body = {
  type: 'object',
  required: ['initData'],
  additionalProperties: false,
  properties: { initData: { type: 'string', minLength: 1, maxLength: 8192 } },
};

export async function authRoutes(app: FastifyInstance, options: AuthOptions) {
  const { botToken, secret, findByTelegramId, findById } = options;
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.post<{ Body: { initData: string } }>('/telegram', {
    schema: { body },
    bodyLimit: 64 * 1024,
  }, async (request, reply) => {
    if (typeof request.body?.initData !== 'string') {
      return reply.code(400).send({ error: 'Telegram launch data is required' });
    }
    if (!botToken || !secret) return reply.code(503).send({ error: 'Sign-in unavailable' });
    const telegramId = verifyTelegramId(request.body.initData, botToken, now());
    if (telegramId === null) return reply.code(401).send({ error: 'Invalid Telegram launch data' });

    const account = await findByTelegramId(telegramId);
    if (!account) return reply.code(403).send({ error: 'Account has not been approved' });
    const token = issueSession(account.id, secret, now());
    return reply.send({ token, expiresIn: sessionLifetime });
  });

  app.get('/me', async (request, reply) => {
    const id = secret ? readSession(request.headers.authorization, secret, now()) : null;
    const account = id ? await findById(id) : null;
    if (!account) return reply.code(401).send({ error: 'Sign-in required' });
    return { id: account.id, role: account.role };
  });
}
