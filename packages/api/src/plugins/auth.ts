/**
 * Real authentication. Every route requires a valid access token unless it
 * declares itself public.
 *
 * A route is public when its schema says `security: []` — the same annotation
 * that already tells OpenAPI the endpoint needs no credentials. Reading the
 * route definition instead of matching the request URL against a hand-kept list
 * means the two can never disagree, and a new route is protected by default
 * because omitting the annotation leaves it guarded.
 *
 * The previous URL list also could not tell "unknown path" from "protected
 * path", so `/health/` and `/HEALTH` answered 401 when they should have been a
 * plain 404.
 *
 * `request.userId` keeps the same name and meaning it had under the old stub, so
 * every deck, drill, submission and review handler is unchanged.
 */

import { db, users } from '@recogno/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AccessTokenPayload } from '../services/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated user's id. Empty string only on public routes. */
    userId: string;
    userEmail: string;
  }
}

/**
 * Swagger UI registers its own routes and static assets, which we do not define
 * and therefore cannot annotate. This stays a prefix rule.
 */
const PUBLIC_PREFIXES = ['/docs'] as const;

/** Put this on a route's schema to make it reachable without a token. */
export const PUBLIC_ROUTE = { security: [] as never[] };

export function isPublicPrefix(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * True when the matched route opted out of authentication. An empty `security`
 * array is OpenAPI's own way of saying "no credentials required here".
 */
function routeIsPublic(request: FastifyRequest): boolean {
  const schema = request.routeOptions?.schema as { security?: unknown } | undefined;
  return Array.isArray(schema?.security) && schema.security.length === 0;
}

/**
 * No route matched, so this is a 404. Letting it through means Fastify answers
 * "not found" rather than the auth layer answering "unauthenticated" about a
 * path that does not exist.
 */
function routeIsUnmatched(request: FastifyRequest): boolean {
  return !request.routeOptions?.url;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : undefined;
}

const auth: FastifyPluginAsync = async (app) => {
  app.decorateRequest('userId', '');
  app.decorateRequest('userEmail', '');

  app.addHook('onRequest', async (request, reply) => {
    const [pathname = request.url] = request.url.split('?');

    if (routeIsUnmatched(request) || routeIsPublic(request) || isPublicPrefix(pathname)) {
      return;
    }

    const token = bearerToken(request);
    if (!token) {
      return reply.code(401).send({ error: 'Missing bearer token', code: 'UNAUTHENTICATED' });
    }

    let payload: AccessTokenPayload;
    try {
      payload = app.jwt.verify<AccessTokenPayload>(token);
    } catch {
      return reply
        .code(401)
        .send({ error: 'Invalid or expired access token', code: 'UNAUTHENTICATED' });
    }

    // A token can outlive the account it names, so confirm the user still exists
    // rather than trusting the claim alone.
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      return reply.code(401).send({ error: 'Account no longer exists', code: 'UNAUTHENTICATED' });
    }

    request.userId = user.id;
    request.userEmail = user.email;
  });
};

export default fp(auth, { name: 'auth' });
