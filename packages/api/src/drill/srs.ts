/**
 * Translation layer between the `srs_cards` row shape and ts-fsrs's `Card`.
 * Keeping it here means the scheduler's field names never leak into route code.
 */

import type { SrsCard } from '@recogno/shared';
import { type Card, createEmptyCard, fsrs, State } from 'ts-fsrs';

/**
 * Default FSRS parameters. Fuzz is off so a given (card, rating, timestamp)
 * always schedules to the same instant — otherwise tests and the API's own
 * returned due date would be non-reproducible.
 */
export const scheduler = fsrs({ enable_fuzz: false });

export function toFsrsCard(row: SrsCard): Card {
  return {
    due: row.dueAt,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    ...(row.lastReviewAt ? { last_review: row.lastReviewAt } : {}),
  };
}

/** Column values for an upsert into `srs_cards`. */
export function toSrsCardColumns(card: Card) {
  return {
    dueAt: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    lastReviewAt: card.last_review ?? null,
  };
}

export type { Card };
export { createEmptyCard, State };
