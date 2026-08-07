/**
 * Session issuing: a short-lived access JWT plus a long-lived, rotating refresh
 * token.
 *
 * The access token is stateless so protected routes cost no database round trip.
 * The refresh token is opaque and stored only as a SHA-256 digest, so a leak of
 * the table cannot be replayed as a login. Every refresh rotates: the presented
 * token is revoked and a new one issued.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, refreshTokens, type User, users } from '@recogno/shared';
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const REFRESH_TOKEN_BYTES = 48;

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mints a session. `app` supplies the JWT signer already configured with
 * `JWT_SECRET`, so there is only ever one signing key in the process.
 */
export async function issueSession(app: FastifyInstance, user: User): Promise<IssuedSession> {
  const accessToken = app.jwt.sign(
    { sub: user.id, email: user.email } satisfies AccessTokenPayload,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );

  const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: 'Bearer',
  };
}

export interface RotatedSession extends IssuedSession {
  user: User;
}

/**
 * Exchanges a refresh token for a fresh pair, revoking the presented one.
 * Returns undefined for anything not currently valid — unknown, expired or
 * already used — without distinguishing between them to the caller.
 */
export async function rotateSession(
  app: FastifyInstance,
  presented: string,
): Promise<RotatedSession | undefined> {
  const tokenHash = hashToken(presented);
  const now = new Date();

  const [row] = await db
    .select({ token: refreshTokens, user: users })
    .from(refreshTokens)
    .innerJoin(users, eq(users.id, refreshTokens.userId))
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) return undefined;

  // Defence in depth: the lookup above already matched on the digest, but
  // compare in constant time so the query plan is not a timing oracle.
  const stored = Buffer.from(row.token.tokenHash, 'utf8');
  const supplied = Buffer.from(tokenHash, 'utf8');
  if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) return undefined;

  await db.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, row.token.id));

  const session = await issueSession(app, row.user);
  return { ...session, user: row.user };
}

/** Revokes a single refresh token. Idempotent — signing out twice is fine. */
export async function revokeRefreshToken(presented: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(presented)), isNull(refreshTokens.revokedAt)));
}

/** Revokes every outstanding token for a user, e.g. after a password change. */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Housekeeping: drops rows that can no longer authenticate anyone. */
export async function purgeDeadRefreshTokens(): Promise<number> {
  const removed = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, new Date()), isNotNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return removed.length;
}
