import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { availability, type Publication } from './availability.js';
import { readSession } from './session.js';

const uuid = { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' };
const slotParams = { type: 'object', required: ['id'], properties: { id: uuid } };
type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
const accountFor = (request: FastifyRequest) => request.getDecorator<Account>('scheduleAccount');
const requireRole = (role: Account['role']) => async (request: FastifyRequest, reply: FastifyReply) => {
  if (accountFor(request).role !== role) {
    return reply.code(403).send({ message: role === 'TEACHER' ? 'Teacher access required' : 'Student access required' });
  }
};
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
  app.decorateRequest('scheduleAccount', null);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = secret && readSession(request.headers.authorization, secret, Math.floor(Date.now() / 1000));
    const account = id && await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!account) return reply.code(401).send({ error: 'Sign-in required' });
    request.setDecorator('scheduleAccount', account);
  });

  app.get('/slots', async () => schedule.list());
  app.get('/bookings', async (request) => schedule.upcoming(accountFor(request)));
  app.get('/bookings/history', { onRequest: requireRole('STUDENT') },
    async (request) => schedule.history(accountFor(request).id));
  app.post<{ Body: Publication }>('/slots', { onRequest: requireRole('TEACHER'), schema: { body: publication } },
    async (request) => schedule.publish(request.body));
  app.post<{ Params: { id: string } }>('/slots/:id/close', {
    onRequest: requireRole('TEACHER'), schema: { params: slotParams },
  }, async (request) => schedule.close(request.params.id));
  app.post<{ Params: { id: string }; Querystring: { requestId?: string } }>('/slots/:id/book', {
    onRequest: requireRole('STUDENT'),
    schema: { params: slotParams, querystring: {
      type: 'object', additionalProperties: false, properties: { requestId: uuid },
    } },
  }, async (request) => schedule.book(request.params.id, accountFor(request).id, request.query.requestId));
  app.post<{ Params: { id: string }; Body: { acceptSameDayCharge: boolean } }>('/bookings/:id/cancel', {
    onRequest: requireRole('STUDENT'),
    schema: {
      params: slotParams,
      body: {
        type: 'object', additionalProperties: false, required: ['acceptSameDayCharge'],
        properties: { acceptSameDayCharge: { type: 'boolean' } },
      },
    },
  }, async (request) => schedule.cancel(request.params.id, accountFor(request).id, request.body.acceptSameDayCharge));
  app.post<{ Params: { id: string }; Body: { reopenSlot: boolean; reason?: string } }>('/bookings/:id/teacher-cancel', {
    onRequest: requireRole('TEACHER'),
    schema: {
      params: slotParams,
      body: {
        type: 'object', additionalProperties: false, required: ['reopenSlot'],
        properties: { reopenSlot: { type: 'boolean' }, reason: { type: 'string', maxLength: 200 } },
      },
    },
  }, async (request) => schedule.cancelByTeacher(request.params.id, request.body.reopenSlot, request.body.reason));
  app.post<{ Params: { id: string }; Body: { requestId: string; slotId: string; reopenPreviousSlot: boolean } }>(
    '/bookings/:id/reschedule', {
      onRequest: requireRole('TEACHER'),
      schema: { params: slotParams, body: {
        type: 'object', additionalProperties: false, required: ['requestId', 'slotId', 'reopenPreviousSlot'],
        properties: { requestId: uuid, slotId: uuid, reopenPreviousSlot: { type: 'boolean' } },
      } },
    }, async (request) => schedule.reschedule(request.params.id, accountFor(request).id, request.body));
}
