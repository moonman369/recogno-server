/**
 * Per-user overrides for the composite→FSRS-rating thresholds (see
 * `drill/scoring.ts`). A user with no row here gets `RATING_THRESHOLDS`
 * unchanged — the table only ever narrows or widens the bands a score is
 * graded against; FSRS's own interval math never sees it.
 */

import { db, scoringSettings } from '@recogno/shared';
import { eq } from 'drizzle-orm';
import { RATING_THRESHOLDS, type RatingThresholds } from '../drill/scoring.js';

/** `undefined` means the user has never set an override. */
export async function getThresholdOverride(userId: string): Promise<RatingThresholds | undefined> {
  const [row] = await db
    .select({
      easy: scoringSettings.easyThreshold,
      good: scoringSettings.goodThreshold,
      hard: scoringSettings.hardThreshold,
    })
    .from(scoringSettings)
    .where(eq(scoringSettings.userId, userId))
    .limit(1);

  return row;
}

/** What actually grades this user's next attempt: their override, or the default bands. */
export async function getEffectiveThresholds(userId: string): Promise<RatingThresholds> {
  return (await getThresholdOverride(userId)) ?? RATING_THRESHOLDS;
}

/** Upserts a user's thresholds. Caller is responsible for validating their ordering. */
export async function setThresholds(
  userId: string,
  thresholds: RatingThresholds,
): Promise<RatingThresholds> {
  const now = new Date();

  await db
    .insert(scoringSettings)
    .values({
      userId,
      easyThreshold: thresholds.easy,
      goodThreshold: thresholds.good,
      hardThreshold: thresholds.hard,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: scoringSettings.userId,
      set: {
        easyThreshold: thresholds.easy,
        goodThreshold: thresholds.good,
        hardThreshold: thresholds.hard,
        updatedAt: now,
      },
    });

  return thresholds;
}

/** Clears a user's override, reverting them to `RATING_THRESHOLDS`. Idempotent. */
export async function clearThresholds(userId: string): Promise<void> {
  await db.delete(scoringSettings).where(eq(scoringSettings.userId, userId));
}
