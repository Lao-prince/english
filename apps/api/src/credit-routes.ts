import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { creditLedger } from './credits.js';
import type { PackageTerms } from './credit-package.js';
import { readSession } from './session.js';

type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
type Options = {
  secret?: string;
  findAccount: (id: string) => Promise<Account | null>;
  ledger: ReturnType<typeof creditLedger>;
};

const uuid = { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' };
const params = { type: 'object', required: ['id'], properties: { id: uuid } };
const accountFor = (request: FastifyRequest) => request.getDecorator<Account>('creditAccount');
const requireRole = (role: Account['role']) => async (request: FastifyRequest, reply: FastifyReply) => {
  if (accountFor(request).role !== role) return reply.code(403).send({ message: 'Access denied.' });
};

export async function creditRoutes(app: FastifyInstance, { secret, ledger, findAccount }: Options) {
  app.decorateRequest('creditAccount', null);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = secret && readSession(request.headers.authorization, secret, Math.floor(Date.now() / 1000));
    const account = id && await findAccount(id);
    if (!account) return reply.code(401).send({ message: 'Sign-in required.' });
    request.setDecorator('creditAccount', account);
  });

  const teacherOnly = requireRole('TEACHER');
  app.get('/me', { onRequest: requireRole('STUDENT') }, async (request) => ledger.summary(accountFor(request).id, false));
  app.get<{ Params: { id: string } }>('/students/:id', {
    onRequest: teacherOnly, schema: { params },
  }, async (request) => ledger.summary(request.params.id, true));
  app.post<{ Params: { id: string }; Body: { id: string; amount: number; package?: PackageTerms } }>('/students/:id/grant', {
    onRequest: teacherOnly,
    schema: { params, body: {
      type: 'object', additionalProperties: false, required: ['id', 'amount'],
      properties: {
        id: uuid, amount: { type: 'integer', minimum: 1, maximum: 100 },
        package: {
          type: 'object', additionalProperties: false, required: ['validThrough', 'timeZone'],
          properties: {
            validThrough: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
            timeZone: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    } },
  }, async (request) => ledger.grant(request.params.id, request.body.id, request.body.amount, request.body.package));
  app.post<{ Params: { id: string }; Body: { bookingId: string } }>('/students/:id/settle', {
    onRequest: teacherOnly,
    schema: { params, body: {
      type: 'object', additionalProperties: false, required: ['bookingId'], properties: { bookingId: uuid },
    } },
  }, async (request) => ledger.settle(request.params.id, request.body.bookingId));
  app.post<{ Params: { id: string }; Body: { bookingId: string } }>('/students/:id/complete', {
    onRequest: teacherOnly,
    schema: { params, body: {
      type: 'object', additionalProperties: false, required: ['bookingId'], properties: { bookingId: uuid },
    } },
  }, async (request) => ledger.complete(request.params.id, request.body.bookingId));
  app.post<{ Params: { id: string }; Body: { entryId: string } }>('/students/:id/reverse', {
    onRequest: teacherOnly,
    schema: { params, body: {
      type: 'object', additionalProperties: false, required: ['entryId'],
      properties: { entryId: uuid },
    } },
  }, async (request) => ledger.reverse(request.params.id, request.body.entryId));
}
