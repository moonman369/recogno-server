/**
 * Placeholder identity. There is no auth system yet (F1.x is scoped without
 * one), so the user is whoever the `x-user-id` header claims to be, falling
 * back to a fixed development user.
 *
 * Swap the hook body for real JWT verification via `request.jwtVerify()` — the
 * `@fastify/jwt` plugin is already registered in `app.ts`.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

export const STUB_USER_ID = '00000000-0000-0000-0000-000000000001';

export const USER_ID_HEADER = 'x-user-id';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * `guid`, not `uuid`: the strict check enforces RFC 9562 version and variant
 * bits, which rejects perfectly usable identifiers — including STUB_USER_ID and
 * any hand-typed test ID. Postgres's own `uuid` type accepts any well-formed
 * 8-4-4-4-12 hex string, so this matches what the column will actually store.
 */
const userIdSchema = z.guid();

const stubAuth: FastifyPluginAsync = async (app) => {
  app.decorateRequest('userId', '');

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers[USER_ID_HEADER];
    const raw = Array.isArray(header) ? header[0] : header;

    if (!raw) {
      request.userId = STUB_USER_ID;
      return;
    }

    const parsed = userIdSchema.safeParse(raw);
    if (!parsed.success) {
      return reply.code(400).send({ error: `${USER_ID_HEADER} must be a UUID` });
    }

    request.userId = parsed.data;
  });
};

export default fp(stubAuth, { name: 'stub-auth' });
