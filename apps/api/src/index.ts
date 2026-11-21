import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ status: 'ok' }));

try {
  await app.listen({ host: '127.0.0.1', port: 3000 });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
