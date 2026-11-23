import type { FastifyInstance } from 'fastify';
import { readSession } from './session.js';
import { normalizeDisplayName, type studentRoster } from './students.js';

type Options = {
  secret?: string;
  findRole: (id: string) => Promise<'TEACHER' | 'STUDENT' | null>;
  roster: ReturnType<typeof studentRoster>;
};

const renameSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' } },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['displayName'],
    properties: { displayName: { type: ['string', 'null'], maxLength: 80 } },
  },
};

export async function studentRoutes(app: FastifyInstance, { findRole, roster, secret }: Options) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = secret && readSession(request.headers.authorization, secret, Math.floor(Date.now() / 1000));
    const role = id && await findRole(id);
    if (!role) return reply.code(401).send({ message: 'Sign-in required.' });
    if (role !== 'TEACHER') return reply.code(403).send({ message: 'Teacher access required.' });
  });

  app.get('/', async () => roster.list());
  app.patch<{ Params: { id: string }; Body: { displayName: string | null } }>('/:id',
    { schema: renameSchema }, async (request, reply) => {
      const name = normalizeDisplayName(request.body.displayName);
      if (name === undefined) return reply.code(400).send({ message: 'Enter a valid display name.' });
      const student = await roster.rename(request.params.id, name);
      if (!student) return reply.code(404).send({ message: 'Student account not found.' });
      return student;
    });
}
