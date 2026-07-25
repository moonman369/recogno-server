import { checkDatabaseConnection, type HealthResponse } from '@recogno/shared';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    const db = await checkDatabaseConnection();

    if (!db) {
      return reply.code(503).send({ ok: false, db: false });
    }

    return { ok: true, db: true };
  });
};
