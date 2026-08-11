/**
 * Sign-up, sign-in, session refresh, email verification, password reset and
 * Google OAuth.
 *
 * These are the only routes reachable without a token (see `plugins/auth.ts`).
 */

import { createLogger, db, isGoogleOAuthConfigured, users } from '@recogno/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { hashPassword, verifyPassword } from '../services/password.js';
import {
  issueSession,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateSession,
  toPublicUser,
} from '../services/tokens.js';
import { accountRecoveryRoutes, sendVerificationEmail } from './accountRecovery.js';
import {
  authProvidersResponseSchema,
  type LoginBody,
  loginBodySchema,
  meResponseSchema,
  type RefreshBody,
  type RegisterBody,
  refreshBodySchema,
  registerBodySchema,
  sessionResponseSchema,
} from './authSchemas.js';
import { googleRoutes } from './googleAuth.js';
import { errorResponseSchema } from './schemas.js';

const log = createLogger('auth');

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/auth/providers',
    {
      schema: {
        tags: ['auth'],
        summary: 'Which sign-in methods this deployment supports',
        description: 'Lets a client hide a Google button that would not work.',
        security: [],
        response: { 200: authProvidersResponseSchema },
      },
    },
    async () => ({ password: true, google: isGoogleOAuthConfigured }),
  );

  app.post<{ Body: RegisterBody }>(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create an account with email and password',
        security: [],
        body: registerBodySchema,
        response: { 201: sessionResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password, displayName } = request.body;

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        return reply.code(409).send({ error: 'An account with that email already exists' });
      }

      const passwordHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({ email, passwordHash, displayName: displayName ?? null })
        .returning();

      if (!user) return reply.code(500).send({ error: 'Failed to create the account' });

      log.info({ userId: user.id }, 'Registered a new account');

      // Awaited, not fired and forgotten: an unhandled rejection after the
      // response would take the process down. `sendVerificationEmail` swallows
      // its own failures, so a dead mail provider costs a few hundred
      // milliseconds and a log line, never the registration.
      await sendVerificationEmail(user);

      const session = await issueSession(app, user);
      return reply.code(201).send({ user: toPublicUser(user), ...session });
    },
  );

  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password',
        security: [],
        body: loginBodySchema,
        response: { 200: sessionResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      // Hash even when the account is unknown so a missing email and a wrong
      // password take comparable time.
      const ok = await verifyPassword(password, user?.passwordHash ?? null);

      if (!user || !ok) {
        return reply.code(401).send({ error: 'Incorrect email or password' });
      }

      const session = await issueSession(app, user);
      return { user: toPublicUser(user), ...session };
    },
  );

  app.post<{ Body: RefreshBody }>(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange a refresh token for a new session',
        description: 'The presented token is revoked and replaced, so it cannot be reused.',
        security: [],
        body: refreshBodySchema,
        response: { 200: sessionResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const rotated = await rotateSession(app, request.body.refreshToken);

      if (!rotated) {
        return reply.code(401).send({ error: 'Refresh token is invalid, expired or already used' });
      }

      const { user, ...session } = rotated;
      return { user: toPublicUser(user), ...session };
    },
  );

  app.post<{ Body: RefreshBody }>(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        description: 'Idempotent. The access token remains valid until it expires.',
        security: [],
        body: refreshBodySchema,
        response: { 204: { type: 'null' } },
      },
    },
    async (request, reply) => {
      await revokeRefreshToken(request.body.refreshToken);
      return reply.code(204).send();
    },
  );

  await app.register(accountRecoveryRoutes);
  await app.register(googleRoutes);
};

/**
 * Routes that need a signed-in user. Registered separately from `authRoutes`
 * because these sit behind the same guard as everything else.
 */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'The signed-in user',
        response: { 200: meResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const [user] = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
      if (!user) return reply.code(401).send({ error: 'Account no longer exists' });
      return { user: toPublicUser(user) };
    },
  );

  app.post(
    '/auth/logout-all',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke every session for this account',
        response: { 204: { type: 'null' } },
      },
    },
    async (request, reply) => {
      await revokeAllRefreshTokens(request.userId);
      return reply.code(204).send();
    },
  );
};
