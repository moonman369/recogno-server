import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env, logger } from '@recogno/shared';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import auth from './plugins/auth.js';
import errorHandler from './plugins/errorHandler.js';
import swagger from './plugins/swagger.js';
import { accountRoutes, authRoutes } from './routes/auth.js';
import { deckRoutes } from './routes/decks.js';
import { drillRoutes } from './routes/drill.js';
import { healthRoutes } from './routes/health.js';
import { reviewRoutes } from './routes/review.js';
import { submissionRoutes } from './routes/submissions.js';

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

  // Response schemas exist to document the API, not to police it. Fastify would
  // otherwise hand them to fast-json-stringify, which cannot read Zod — and a
  // slightly wrong schema would silently drop fields or 500 a working endpoint.
  // Serialising exactly as an unschema'd route does keeps the docs zero-risk.
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  await app.register(errorHandler);
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Must precede the routes: @fastify/swagger collects schemas as they register.
  await app.register(swagger);
  // Guards everything registered after it, except the routes named in
  // `isPublicRoute`. New routes are protected by default.
  await app.register(auth);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(drillRoutes);
  await app.register(deckRoutes);
  await app.register(submissionRoutes);
  await app.register(reviewRoutes);

  return app;
}
