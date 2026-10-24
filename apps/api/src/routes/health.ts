import type { FastifyInstance } from 'fastify';

/**
 * Health check endpoints.
 * GET /healthz — liveness: always returns 200 if the process is running.
 * GET /readyz  — readiness: checks DB and Redis connectivity (stubbed until Phase 2).
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/readyz', async (_request, reply) => {
    // TODO Phase 2: check Postgres and Redis connectivity
    const checks = {
      postgres: 'not_configured',
      redis: 'not_configured',
    };

    return reply.status(200).send({
      status: 'ok',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
