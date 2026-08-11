/**
 * Single-use, emailed tokens for verifying an address and resetting a password.
 *
 * Same shape as `services/tokens.ts`: the secret goes out in an email, and only
 * its SHA-256 digest is stored, so the table is worthless to anyone who reads
 * it. Redemption sets `consumedAt` rather than deleting, which lets a second
 * click be answered "already used" instead of "invalid".
 */

import { createHash, randomBytes } from 'node:crypto';
import { type authTokenPurposeEnum, authTokens, db, type User, users } from '@recogno/shared';
import { and, eq, isNull } from 'drizzle-orm';

/** Mirrors the database enum, so adding a purpose there is a compile error here. */
export type AuthTokenPurpose = (typeof authTokenPurposeEnum.enumValues)[number];

/**
 * Long enough that guessing is hopeless, short enough to survive an email
 * client that wraps long lines.
 */
const TOKEN_BYTES = 32;

export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mints a token, invalidating any earlier unconsumed one for the same purpose.
 *
 * One outstanding token at a time means a stolen older email cannot be replayed
 * after the user has asked for a fresh link, which is exactly what someone does
 * when they suspect the first one went astray.
 */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  ttlSeconds: number,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await db.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
        ),
      );

    await tx.insert(authTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
  });

  return token;
}

export type ConsumeFailure = 'invalid' | 'expired' | 'already-used';
export type ConsumeResult = { ok: true; user: User } | { ok: false; reason: ConsumeFailure };

/**
 * Redeems a token and returns its owner. Marks it consumed in the same
 * statement that selects it, so two simultaneous clicks cannot both win.
 *
 * The three failure reasons are distinguished because none of them leak
 * anything: the caller already holds the token, so being told it expired tells
 * them nothing they could not work out by trying.
 */
export async function consumeAuthToken(
  presented: string,
  purpose: AuthTokenPurpose,
): Promise<ConsumeResult> {
  const tokenHash = hashToken(presented);
  const now = new Date();

  return db.transaction(async (tx): Promise<ConsumeResult> => {
    const [row] = await tx
      .select({ token: authTokens, user: users })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, purpose)))
      .limit(1);

    if (!row) return { ok: false, reason: 'invalid' };
    if (row.token.consumedAt) return { ok: false, reason: 'already-used' };
    if (row.token.expiresAt <= now) return { ok: false, reason: 'expired' };

    // Guarded on `consumedAt` still being null: whichever request updates zero
    // rows lost the race and is told the token is spent.
    const claimed = await tx
      .update(authTokens)
      .set({ consumedAt: now })
      .where(and(eq(authTokens.id, row.token.id), isNull(authTokens.consumedAt)))
      .returning({ id: authTokens.id });

    if (claimed.length === 0) return { ok: false, reason: 'already-used' };

    return { ok: true, user: row.user };
  });
}
