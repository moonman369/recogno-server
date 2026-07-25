import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env, logger } from '@recogno/shared';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import { healthRoutes } from './routes/health.js';

export type AppInstance = FastifyInstance;

export async function buildApp(): Promise<AppInstance> {
  const app = Fastify({
    // Widened to Fastify's own logger interface so the instance type stays the
    // plain `FastifyInstance` rather than leaking pino's generics into callers.
    loggerInstance: logger as FastifyBaseLogger,
  });

  // Route `schema` objects are plain Zod schemas rather than JSON Schema.
  app.setValidatorCompiler(({ schema }) => (data) => {
    const result = (schema as unknown as ZodType).safeParse(data);
    return result.success ? { value: result.data } : { error: result.error };
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });

  await app.register(healthRoutes);

  return app;
}
