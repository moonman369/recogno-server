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
 *
 * Both routes are entered by a top-level browser navigation, so when
 * OAUTH_SUCCESS_REDIRECT is set every outcome — success and failure alike —
 * leaves as a 302 back to the frontend. See `fail` below.
 */

import {
  createLogger,
  db,
  env,
  isGoogleOAuthConfigured,
  type User,
  userIdentities,
  users,
} from '@recogno/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
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

/** Stable codes the frontend switches on. Widen only alongside the client. */
type OAuthErrorCode =
  | 'access_denied'
  | 'unverified-email-conflict'
  | 'invalid-state'
  | 'exchange-failed'
  | 'not-configured';

interface Failure {
  status: number;
  code: OAuthErrorCode;
  /** Shown to the user on both paths, so it carries no upstream or attacker text. */
  description: string;
  /**
   * Overrides the JSON body's `error` when the two must differ — the JSON shape
   * is an existing contract, while the redirect is read by a browser.
   */
  jsonError?: string;
}

/**
 * These routes are reached by a top-level browser navigation, so answering a
 * failure with raw JSON on the API origin strands the user on a dead-end page
 * with no way back into the app.
 *
 * When the frontend has told us where it lives, hand the failure to it as query
 * parameters — the mirror image of how success already returns. With
 * OAUTH_SUCCESS_REDIRECT unset there is nowhere to send them, so the status code
 * and JSON body stay exactly as they were for non-browser callers.
 *
 * `description` is deliberately free of anything Google or the caller supplied:
 * it lands in a URL the frontend renders, and neither is a trustworthy source.
 * The detail worth keeping goes to the log instead.
 */
function fail(reply: FastifyReply, failure: Failure) {
  if (!env.OAUTH_SUCCESS_REDIRECT) {
    return reply.code(failure.status).send({ error: failure.jsonError ?? failure.description });
  }

  const target = new URL(env.OAUTH_SUCCESS_REDIRECT);
  target.searchParams.set('error', failure.code);
  target.searchParams.set('error_description', failure.description);
  return reply.redirect(target.toString(), 302);
}

export const googleRoutes: FastifyPluginAsync = async (app) => {
  const unavailable: Failure = {
    status: 501,
    code: 'not-configured',
    description:
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
          'Redirects to Google. When the server has no Google credentials this redirects to ' +
          'OAUTH_SUCCESS_REDIRECT with `?error=not-configured`, or returns 501 when that is ' +
          'unset — call `GET /auth/providers` first to find out.',
        security: [],
        response: { 302: { type: 'null' }, 501: errorResponseSchema },
      },
    },
    async (_request, reply) => {
      if (!isGoogleOAuthConfigured || !env.GOOGLE_CLIENT_ID) {
        return fail(reply, unavailable);
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
          'Exchanges the authorization code for a Recogno session. When OAUTH_SUCCESS_REDIRECT ' +
          'is set both outcomes redirect there — success with `accessToken`/`refreshToken`, ' +
          'failure with `error` (a stable code) and `error_description`. With it unset the ' +
          'session comes back as JSON and failures keep their status codes.',
        security: [],
        response: {
          200: sessionResponseSchema,
          302: { type: 'null' },
          400: errorResponseSchema,
          409: errorResponseSchema,
          501: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isGoogleOAuthConfigured || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return fail(reply, unavailable);
      }

      const { code, state, error } = request.query;

      if (error) {
        // `error` is whatever Google put in the URL; it reaches the log as a
        // structured field and never the user-facing description.
        log.info({ googleError: error }, 'Google declined the sign-in');
        return fail(reply, {
          status: 400,
          code: 'access_denied',
          description:
            'Google did not complete the sign-in. This usually means consent was declined.',
          jsonError: `Google returned an error: ${error}`,
        });
      }
      if (!code || !state) {
        return fail(reply, {
          status: 400,
          code: 'invalid-state',
          description: 'Missing code or state',
        });
      }

      try {
        app.jwt.verify(state);
      } catch {
        return fail(reply, {
          status: 400,
          code: 'invalid-state',
          description: 'Invalid or expired state; restart the sign-in',
        });
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
        return fail(reply, {
          status: 400,
          code: 'exchange-failed',
          // Google's own error text stays out of the redirect: it would be
          // rendered by the frontend, and the log above already has it.
          description: 'Could not exchange the code with Google. Try signing in again.',
          jsonError: `Could not exchange the code: ${tokens.error_description ?? tokens.error ?? tokenResponse.status}`,
        });
      }

      const infoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!infoResponse.ok) {
        log.error({ status: infoResponse.status }, 'Google profile fetch failed');
        return fail(reply, {
          status: 400,
          code: 'exchange-failed',
          description: 'Could not read the Google profile',
        });
      }

      const profile = (await infoResponse.json()) as GoogleUserInfo;

      if (!profile.sub || !profile.email) {
        return fail(reply, {
          status: 400,
          code: 'exchange-failed',
          description: 'Google did not return an email address',
        });
      }

      const email = profile.email.trim().toLowerCase();
      const result = await linkOrCreateUser({
        providerAccountId: profile.sub,
        email,
        displayName: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
        emailVerified: profile.email_verified === true,
      });

      if (!result.ok) {
        log.warn({ email }, 'Refused to link an unverified Google email to an existing account');
        return fail(reply, {
          status: 409,
          code: 'unverified-email-conflict',
          description:
            'An account already exists for this email address, but Google has not confirmed ' +
            'that you own it. Sign in with your password instead, or verify the address with ' +
            'Google and try again.',
        });
      }

      const { user } = result;
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
 * Refusing to link is an expected outcome, not a failure, so it comes back as a
 * value the route turns into a 409. Throwing would surface as a bare 500 and
 * tell the person nothing about what to do next.
 */
type LinkResult = { ok: true; user: User } | { ok: false; reason: 'unverified-email-conflict' };

/**
 * Finds the identity, or links it to an existing account with the same verified
 * email, or creates a new account.
 *
 * Linking on email is only safe because Google tells us whether it verified the
 * address; an unverified one is refused outright rather than being handed the
 * keys to a matching password account.
 */
async function linkOrCreateUser(input: {
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}): Promise<LinkResult> {
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

  if (identity) return { ok: true, user: identity.user };

  return db.transaction(async (tx): Promise<LinkResult> => {
    const [existing] = await tx.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (existing) {
      if (!input.emailVerified) {
        return { ok: false, reason: 'unverified-email-conflict' };
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
      return { ok: true, user: updated ?? existing };
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
    return { ok: true, user: created };
  });
}
