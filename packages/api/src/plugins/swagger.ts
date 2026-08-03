/**
 * OpenAPI spec + Swagger UI.
 *
 * Routes in this service declare their schemas as plain Zod objects (see the
 * validator compiler in `app.ts`), which `@fastify/swagger` cannot read. The
 * `transform` below converts them on the way into the spec using Zod 4's native
 * `z.toJSONSchema`, so the docs are generated from the same schemas that
 * actually validate requests and can never drift from them.
 *
 * OpenAPI 3.1 is deliberate: it is the version aligned with JSON Schema draft
 * 2020-12, which is what Zod emits.
 */

import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

export const DOCS_ROUTE_PREFIX = '/docs';

/**
 * Note the trailing slash. The Swagger UI page loads its assets with relative
 * `./static/...` URLs, so a browser sitting on `/docs` resolves them against `/`
 * and renders a blank page. `/docs/` is the only form that works.
 */
export const DOCS_URL = `${DOCS_ROUTE_PREFIX}/`;

function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType;
}

/**
 * `io` matters: an input schema documents what a client may send (before
 * defaults and transforms), an output schema what the server sends back.
 */
function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    // Never abort spec generation over a type JSON Schema cannot express.
    unrepresentable: 'any',
  }) as Record<string, unknown>;

  // The dialect declaration is redundant inside an OpenAPI 3.1 document.
  delete converted.$schema;
  return converted;
}

const REQUEST_KEYS = ['body', 'querystring', 'params', 'headers'] as const;

/** Converts any Zod schema on a route into JSON Schema, leaving others untouched. */
function transformSchema({ schema, url }: { schema?: Record<string, unknown>; url: string }) {
  if (!schema) return { schema, url };

  const transformed: Record<string, unknown> = { ...schema };

  for (const key of REQUEST_KEYS) {
    const value = schema[key];
    if (isZodSchema(value)) transformed[key] = toJsonSchema(value, 'input');
  }

  const { response } = schema;
  if (response && typeof response === 'object') {
    transformed.response = Object.fromEntries(
      Object.entries(response as Record<string, unknown>).map(([status, value]) => [
        status,
        isZodSchema(value) ? toJsonSchema(value, 'output') : value,
      ]),
    );
  }

  return { schema: transformed, url };
}

const swagger: FastifyPluginAsync = async (app) => {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Recogno API',
        description:
          'Backend for Recogno, a spaced-repetition trainer for DSA and system-design pattern recognition.\n\n' +
          'The drill loop is: `GET /drill/next` for a problem stripped of its answer, ' +
          '`POST /drill/submit` to grade a guess and advance its FSRS card, ' +
          '`GET /drill/due-count` for the reps-due badge.',
        version: '1.0.0',
      },
      tags: [
        { name: 'auth', description: 'Sign-up, sign-in, sessions and Google OAuth' },
        { name: 'review', description: 'What is due now, across both review flows' },
        { name: 'drill', description: 'The Blind Recognition Drill loop (F1.1–F1.4)' },
        { name: 'decks', description: 'Deck containers and adding problems to them' },
        {
          name: 'submissions',
          description: 'Note + solution attempts, their AI evaluation, and committing a grade',
        },
        { name: 'system', description: 'Liveness and readiness' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'Access token from POST /auth/login, /auth/register or the Google callback. ' +
              'Paste just the token — Swagger adds the "Bearer " prefix.',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: transformSchema as never,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiConfig: {
      // Show each operation collapsed but its tag group open.
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
    },
  });

  // Typing the bare URL should land somewhere useful rather than on a 404.
  app.get('/', { schema: { hide: true } }, async (_request, reply) =>
    reply.redirect(DOCS_URL, 302),
  );

  // swagger-ui already owns a GET route at `/docs`, and it answers there with a
  // page whose relative asset URLs only resolve under `/docs/`. Declaring our
  // own `/docs` route would be a duplicate, so intercept it in a hook instead:
  // onRequest runs after routing but before the handler, so this wins.
  app.addHook('onRequest', async (request, reply) => {
    const [path] = request.url.split('?');
    if (path === DOCS_ROUTE_PREFIX) {
      return reply.redirect(DOCS_URL, 302);
    }
  });
};

export default fp(swagger, { name: 'swagger' });
