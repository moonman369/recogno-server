import { checkDatabaseConnection, type HealthResponse } from '@recogno/shared';
import type { FastifyPluginAsync } from 'fastify';
import { healthResponseSchema } from './schemas.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        // Infrastructure, not a user resource: load balancers and uptime checks
        // have no token to present.
        security: [],
        summary: 'Readiness probe',
        description:
          'Runs `SELECT 1` against Postgres. Returns 503 if the database is unreachable.',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply): Promise<HealthResponse> => {
      const db = await checkDatabaseConnection();

      if (!db) {
        return reply.code(503).send({ ok: false, db: false });
      }

      return { ok: true, db: true };
    },
  );
};
