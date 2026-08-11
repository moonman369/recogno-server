/**
 * Email verification and password reset.
 *
 * Both are the same shape: mint a single-use token, mail a link to the frontend,
 * and let a later request redeem it. Nothing here issues a session — verifying
 * an address does not sign you in, and a reset deliberately ends every existing
 * session instead of starting one.
 *
 * The two "send me a link" endpoints answer identically whether or not the
 * address is registered. Anything else makes them a way to enumerate accounts,
 * and the person who genuinely owns the address learns the outcome from their
 * inbox regardless.
 */

import { createLogger, db, type User, users } from '@recogno/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  consumeAuthToken,
  EMAIL_VERIFICATION_TTL_SECONDS,
  issueAuthToken,
  PASSWORD_RESET_TTL_SECONDS,
} from '../services/authTokens.js';
import { appLink, sendEmail } from '../services/mailer.js';
import { hashPassword } from '../services/password.js';
import { revokeAllRefreshTokens, toPublicUser } from '../services/tokens.js';
import {
  type EmailOnlyBody,
  emailDispatchResponseSchema,
  emailOnlyBodySchema,
  meResponseSchema,
  type ResetPasswordBody,
  resetPasswordBodySchema,
  type VerifyEmailBody,
  verifyEmailBodySchema,
} from './authSchemas.js';
import { errorResponseSchema } from './schemas.js';

const log = createLogger('auth:recovery');

/** The one sentence both dispatch endpoints return, whatever actually happened. */
const DISPATCHED = {
  message:
    'If that address has an account, a link is on its way. Check your inbox and spam folder.',
};

const VERIFY_EMAIL_PATH = '/verify-email';
const RESET_PASSWORD_PATH = '/reset-password';

/**
 * Mints a verification token and mails it. Exported because registration sends
 * one too — a new account should not have to ask for its first link.
 *
 * Never throws: the caller has already committed a database write, and a mail
 * provider outage must not undo it.
 */
export async function sendVerificationEmail(user: User): Promise<void> {
  try {
    const token = await issueAuthToken(
      user.id,
      'email-verification',
      EMAIL_VERIFICATION_TTL_SECONDS,
    );
    const greeting = user.displayName ? ` ${user.displayName}` : '';

    await sendEmail({
      to: user.email,
      subject: 'Verify your Recogno email address',
      text:
        `Hi${greeting},\n\n` +
        'Confirm this address to finish setting up your Recogno account:\n\n' +
        `${appLink(VERIFY_EMAIL_PATH, token)}\n\n` +
        'The link works once and expires in 24 hours.\n\n' +
        'If you did not create a Recogno account, you can ignore this email.',
    });
  } catch (error) {
    log.error({ err: error, userId: user.id }, 'Could not send a verification email');
  }
}

export const accountRecoveryRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: EmailOnlyBody }>(
    '/auth/verify-email/request',
    {
      schema: {
        tags: ['auth'],
        summary: 'Send a fresh email-verification link',
        description:
          'Always 202, whether or not the address is registered and whether or not it is ' +
          'already verified. Issuing a new link invalidates any previous unused one.',
        security: [],
        body: emailOnlyBodySchema,
        response: { 202: emailDispatchResponseSchema },
      },
    },
    async (request, reply) => {
      const [user] = await db.select().from(users).where(eq(users.email, request.body.email));

      // Re-verifying costs nothing but sends mail the user did not need.
      if (user && user.emailVerifiedAt === null) {
        await sendVerificationEmail(user);
      }

      return reply.code(202).send(DISPATCHED);
    },
  );

  app.post<{ Body: VerifyEmailBody }>(
    '/auth/verify-email/confirm',
    {
      schema: {
        tags: ['auth'],
        summary: 'Redeem an email-verification token',
        description:
          'Marks the address verified and returns the updated user. Does not sign anyone in — ' +
          'the link may well be opened in a browser that has no session.',
        security: [],
        body: verifyEmailBodySchema,
        response: { 200: meResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await consumeAuthToken(request.body.token, 'email-verification');

      if (!result.ok) {
        return reply.code(400).send({ error: verificationFailureMessage(result.reason) });
      }

      // Already-verified is not an error: the row is simply left alone.
      const [updated] = await db
        .update(users)
        .set({ emailVerifiedAt: result.user.emailVerifiedAt ?? new Date(), updatedAt: new Date() })
        .where(eq(users.id, result.user.id))
        .returning();

      log.info({ userId: result.user.id }, 'Verified an email address');
      return { user: toPublicUser(updated ?? result.user) };
    },
  );

  app.post<{ Body: EmailOnlyBody }>(
    '/auth/forgot-password',
    {
      schema: {
        tags: ['auth'],
        summary: 'Send a password-reset link',
        description:
          'Always 202, whether or not the address is registered. Issuing a new link ' +
          'invalidates any previous unused one.',
        security: [],
        body: emailOnlyBodySchema,
        response: { 202: emailDispatchResponseSchema },
      },
    },
    async (request, reply) => {
      const [user] = await db.select().from(users).where(eq(users.email, request.body.email));

      if (user) {
        try {
          const token = await issueAuthToken(user.id, 'password-reset', PASSWORD_RESET_TTL_SECONDS);

          await sendEmail({
            to: user.email,
            subject: 'Reset your Recogno password',
            text:
              'We received a request to reset the password on your Recogno account.\n\n' +
              `${appLink(RESET_PASSWORD_PATH, token)}\n\n` +
              'The link works once and expires in 1 hour.\n\n' +
              'If you did not ask for this you can ignore this email — your password has not ' +
              'changed, and nobody can use this link without access to your inbox.',
          });
        } catch (error) {
          log.error({ err: error, userId: user.id }, 'Could not send a password-reset email');
        }
      }

      return reply.code(202).send(DISPATCHED);
    },
  );

  app.post<{ Body: ResetPasswordBody }>(
    '/auth/reset-password',
    {
      schema: {
        tags: ['auth'],
        summary: 'Set a new password with a reset token',
        description:
          'Revokes every existing session on success, so the client must sign in again with ' +
          'the new password. Returns 204 rather than a session for that reason.',
        security: [],
        body: resetPasswordBodySchema,
        response: { 204: { type: 'null' }, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await consumeAuthToken(request.body.token, 'password-reset');

      if (!result.ok) {
        return reply.code(400).send({ error: resetFailureMessage(result.reason) });
      }

      const passwordHash = await hashPassword(request.body.password);

      await db
        .update(users)
        .set({
          passwordHash,
          // Receiving the mail proves control of the address, which is the same
          // thing verification asks for. A reset that leaves the account
          // unverified would be asking twice for one proof.
          emailVerifiedAt: result.user.emailVerifiedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, result.user.id));

      // Whoever prompted the reset may be the reason it was needed. Ending every
      // session is the point of the flow, not a side effect.
      await revokeAllRefreshTokens(result.user.id);

      log.info({ userId: result.user.id }, 'Reset a password and revoked all sessions');
      return reply.code(204).send();
    },
  );
};

function verificationFailureMessage(reason: 'invalid' | 'expired' | 'already-used'): string {
  switch (reason) {
    case 'expired':
      return 'That verification link has expired. Request a new one and try again.';
    case 'already-used':
      return 'That verification link has already been used. Try signing in.';
    default:
      return 'That verification link is not valid. Request a new one.';
  }
}

function resetFailureMessage(reason: 'invalid' | 'expired' | 'already-used'): string {
  switch (reason) {
    case 'expired':
      return 'That reset link has expired. Request a new one and try again.';
    case 'already-used':
      return 'That reset link has already been used. Request a new one if you still need it.';
    default:
      return 'That reset link is not valid. Request a new one.';
  }
}
