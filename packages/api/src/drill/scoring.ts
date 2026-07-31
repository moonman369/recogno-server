/**
 * Composite grading for a drill attempt (F1.3) and the bridge into FSRS (F1.4).
 *
 * Everything here is pure and synchronous — the one impure input, the LLM's
 * verdict on the rationale, arrives as an already-resolved `RationaleVerdict`.
 */

import { areCloseFamily } from '@recogno/shared';
import { Rating } from 'ts-fsrs';

/** How much each axis contributes to the composite. Must sum to 1. */
export const SCORE_WEIGHTS = {
  correctness: 0.5,
  speed: 0.2,
  rationale: 0.3,
} as const;

/** Speed credit decays linearly and hits zero at this many seconds. */
export const SPEED_FLOOR_SECONDS = 90;

export const CORRECTNESS_SCORES = {
  exact: 1,
  closeFamily: 0.5,
  wrong: 0,
} as const;

/** The LLM's judgement of whether a rationale cites a real constraint-based tell. */
export type RationaleVerdict = 'yes' | 'partial' | 'no';

export const RATIONALE_SCORES: Record<RationaleVerdict, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
};

/**
 * Lower bound of each FSRS rating band, walked highest-first. A composite below
 * `hard` is a genuine failure and lapses the card.
 */
export const RATING_THRESHOLDS = {
  easy: 0.8,
  good: 0.55,
  hard: 0.3,
} as const;

export interface ScoreBreakdown {
  correctness: number;
  speed: number;
  rationale: number;
  composite: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Trims float noise so stored scores and API responses stay readable. */
export function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * 1.0 for the exact pattern, 0.5 when the guess is a defensible neighbour
 * (see `CLOSE_FAMILIES` in shared), 0 otherwise.
 */
export function correctnessScore(guessedSlug: string, actualSlug: string): number {
  if (guessedSlug === actualSlug) return CORRECTNESS_SCORES.exact;
  if (areCloseFamily(guessedSlug, actualSlug)) return CORRECTNESS_SCORES.closeFamily;
  return CORRECTNESS_SCORES.wrong;
}

/**
 * Linear falloff: 1.0 at 0s, 0.0 at `SPEED_FLOOR_SECONDS` and beyond.
 * Recognition is meant to be fast — this axis rewards the instant read.
 */
export function speedScore(timeTakenSeconds: number): number {
  return clamp01(1 - timeTakenSeconds / SPEED_FLOOR_SECONDS);
}

export function rationaleScore(verdict: RationaleVerdict): number {
  return RATIONALE_SCORES[verdict];
}

/** Weighted average of the three axes, normalised by total weight. */
export function compositeScore(parts: {
  correctness: number;
  speed: number;
  rationale: number;
}): number {
  const total = SCORE_WEIGHTS.correctness + SCORE_WEIGHTS.speed + SCORE_WEIGHTS.rationale;
  const weighted =
    clamp01(parts.correctness) * SCORE_WEIGHTS.correctness +
    clamp01(parts.speed) * SCORE_WEIGHTS.speed +
    clamp01(parts.rationale) * SCORE_WEIGHTS.rationale;
  return round4(weighted / total);
}

/** Runs all three axes and the composite in one call. */
export function gradeAttempt(input: {
  guessedSlug: string;
  actualSlug: string;
  timeTakenSeconds: number;
  verdict: RationaleVerdict;
}): ScoreBreakdown {
  const correctness = correctnessScore(input.guessedSlug, input.actualSlug);
  const speed = round4(speedScore(input.timeTakenSeconds));
  const rationale = rationaleScore(input.verdict);
  return {
    correctness,
    speed,
    rationale,
    composite: compositeScore({ correctness, speed, rationale }),
  };
}

/**
 * Maps a composite score onto the FSRS grade that drives the next interval.
 * Bands are inclusive at their lower bound.
 */
export function toFsrsRating(
  composite: number,
): Rating.Again | Rating.Hard | Rating.Good | Rating.Easy {
  const score = clamp01(composite);
  if (score >= RATING_THRESHOLDS.easy) return Rating.Easy;
  if (score >= RATING_THRESHOLDS.good) return Rating.Good;
  if (score >= RATING_THRESHOLDS.hard) return Rating.Hard;
  return Rating.Again;
}

export function ratingName(rating: Rating): string {
  return Rating[rating] ?? String(rating);
}
