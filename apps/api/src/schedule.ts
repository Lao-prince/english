import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { availability, type Publication } from './availability.js';
import { readSession } from './session.js';

const uuid = { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' };
const publication = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'startsAt', 'durationMinutes', 'timeZone'],
  properties: {
    id: uuid,
    startsAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' },
    durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
    timeZone: { type: 'string', minLength: 1, maxLength: 100 },
  },
};

export async function scheduleRoutes(
  app: FastifyInstance,
  { prisma, secret }: { prisma: PrismaClient; secret?: string },
) {
  const schedule = availability(prisma);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = secret && readSession(request.headers.authorization, secret, Math.floor(Date.now() / 1000));
    const account = id && await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!account) return reply.code(401).send({ error: 'Sign-in required' });
    if (request.method === 'POST' && account.role !== 'TEACHER') {
      return reply.code(403).send({ error: 'Teacher access required' });
    }
  });

  app.get('/slots', async () => schedule.list());
  app.post<{ Body: Publication }>('/slots', { schema: { body: publication } },
    async (request) => schedule.publish(request.body));
  app.post<{ Params: { id: string } }>('/slots/:id/close', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: uuid } } },
  }, async (request) => schedule.close(request.params.id));
}
