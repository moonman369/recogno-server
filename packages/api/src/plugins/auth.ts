/**
 * Real authentication. Every route requires a valid access token except the
 * handful listed in `PUBLIC_ROUTES` — sign-in itself, the health probe and the
 * docs.
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
 * Exactly the routes reachable without a token. Listed individually rather than
 * by `/auth/` prefix, because `/auth/me` and `/auth/logout-all` must stay
 * protected — a prefix rule would silently expose them, and would expose any
 * future `/auth/*` route too.
 */
const PUBLIC_ROUTES = new Set([
  '/',
  '/health',
  '/auth/providers',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/google',
  '/auth/google/callback',
]);

/** The docs bundle is many static assets, so this one stays a prefix. */
const PUBLIC_PREFIXES = ['/docs'] as const;

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
    if (isPublicRoute(pathname)) return;

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
