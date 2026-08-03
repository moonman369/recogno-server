/**
 * Google sign-in, using the standard authorization-code flow.
 *
 * Registered unconditionally so the OpenAPI surface is stable, but returns 501
 * until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set — a missing credential
 * disables one provider rather than stopping the API from booting.
 *
 * CSRF protection is the `state` parameter, carried as a short-lived JWT signed
 * with the key already in the process. That keeps the flow stateless: no cookie
 * and no server-side session store just to survive one redirect.
 */

import {
  createLogger,
  db,
  env,
  isGoogleOAuthConfigured,
  userIdentities,
  users,
} from '@recogno/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { issueSession, toPublicUser } from '../services/tokens.js';
import { sessionResponseSchema } from './authSchemas.js';
import { errorResponseSchema } from './schemas.js';

const log = createLogger('auth:google');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const STATE_TTL_SECONDS = 600;
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function redirectUri(): string {
  return env.GOOGLE_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;
}

export const googleRoutes: FastifyPluginAsync = async (app) => {
  const unavailable = {
    error:
      'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and ' +
      'GOOGLE_CLIENT_SECRET to enable it.',
  };

  app.get(
    '/auth/google',
    {
      schema: {
        tags: ['auth'],
        summary: 'Begin Google sign-in',
        description:
          'Redirects to Google. Returns 501 when the server has no Google credentials — call ' +
          '`GET /auth/providers` first to find out.',
        security: [],
        response: { 302: { type: 'null' }, 501: errorResponseSchema },
      },
    },
    async (_request, reply) => {
      if (!isGoogleOAuthConfigured || !env.GOOGLE_CLIENT_ID) {
        return reply.code(501).send(unavailable);
      }

      const state = app.jwt.sign({ purpose: 'google-oauth' }, { expiresIn: STATE_TTL_SECONDS });

      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      // Without this Google omits refresh grants, and we would silently rely on
      // an access token we never store anyway.
      url.searchParams.set('access_type', 'online');
      url.searchParams.set('prompt', 'select_account');

      return reply.redirect(url.toString(), 302);
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    {
      schema: {
        tags: ['auth'],
        summary: 'Google sign-in callback',
        description:
          'Exchanges the authorization code for a Recogno session. Redirects to ' +
          'OAUTH_SUCCESS_REDIRECT when set, otherwise returns the session as JSON.',
        security: [],
        response: {
          200: sessionResponseSchema,
          302: { type: 'null' },
          400: errorResponseSchema,
          501: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isGoogleOAuthConfigured || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return reply.code(501).send(unavailable);
      }

      const { code, state, error } = request.query;

      if (error) {
        return reply.code(400).send({ error: `Google returned an error: ${error}` });
      }
      if (!code || !state) {
        return reply.code(400).send({ error: 'Missing code or state' });
      }

      try {
        app.jwt.verify(state);
      } catch {
        return reply.code(400).send({ error: 'Invalid or expired state; restart the sign-in' });
      }

      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri(),
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

      if (!tokenResponse.ok || !tokens.access_token) {
        log.error(
          { status: tokenResponse.status, error: tokens.error },
          'Google token exchange failed',
        );
        return reply.code(400).send({
          error: `Could not exchange the code: ${tokens.error_description ?? tokens.error ?? tokenResponse.status}`,
        });
      }

      const infoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!infoResponse.ok) {
        return reply.code(400).send({ error: 'Could not read the Google profile' });
      }

      const profile = (await infoResponse.json()) as GoogleUserInfo;

      if (!profile.sub || !profile.email) {
        return reply.code(400).send({ error: 'Google did not return an email address' });
      }

      const email = profile.email.trim().toLowerCase();
      const user = await linkOrCreateUser({
        providerAccountId: profile.sub,
        email,
        displayName: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
        emailVerified: profile.email_verified === true,
      });

      const session = await issueSession(app, user);

      if (env.OAUTH_SUCCESS_REDIRECT) {
        const target = new URL(env.OAUTH_SUCCESS_REDIRECT);
        target.searchParams.set('accessToken', session.accessToken);
        target.searchParams.set('refreshToken', session.refreshToken);
        return reply.redirect(target.toString(), 302);
      }

      return { user: toPublicUser(user), ...session };
    },
  );
};

/**
 * Finds the identity, or links it to an existing account with the same verified
 * email, or creates a new account.
 *
 * Linking on email is only safe because Google tells us whether it verified the
 * address; an unverified one gets its own account rather than being handed the
 * keys to a matching password account.
 */
async function linkOrCreateUser(input: {
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}) {
  const [identity] = await db
    .select({ user: users })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(
      and(
        eq(userIdentities.provider, 'google'),
        eq(userIdentities.providerAccountId, input.providerAccountId),
      ),
    )
    .limit(1);

  if (identity) return identity.user;

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (existing) {
      if (!input.emailVerified) {
        throw new Error('Google reported an unverified email; refusing to link it to an account');
      }

      await tx
        .insert(userIdentities)
        .values({
          userId: existing.id,
          provider: 'google',
          providerAccountId: input.providerAccountId,
        })
        .onConflictDoNothing();

      const [updated] = await tx
        .update(users)
        .set({
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          displayName: existing.displayName ?? input.displayName,
          avatarUrl: existing.avatarUrl ?? input.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      log.info({ userId: existing.id }, 'Linked Google to an existing account');
      return updated ?? existing;
    }

    const [created] = await tx
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
      })
      .returning();

    if (!created) throw new Error('Failed to create an account from the Google profile');

    await tx.insert(userIdentities).values({
      userId: created.id,
      provider: 'google',
      providerAccountId: input.providerAccountId,
    });

    log.info({ userId: created.id }, 'Created an account from Google');
    return created;
  });
}
