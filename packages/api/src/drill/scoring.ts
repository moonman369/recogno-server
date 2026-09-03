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

/**
 * Full speed credit for anything answered within this window. Recognising a
 * pattern is meant to be quick, but a hard problem deserves time to read the
 * constraints before the clock starts costing anything.
 */
export const SPEED_GRACE_SECONDS = 45;

/** Speed credit reaches zero at this many seconds, decaying from the grace point. */
export const SPEED_FLOOR_SECONDS = 300;

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

/** Lower bound of each FSRS rating band. A composite below `hard` lapses the card. */
export interface RatingThresholds {
  easy: number;
  good: number;
  hard: number;
}

/**
 * Default lower bound of each FSRS rating band, walked highest-first. A user
 * may override these (see `packages/api/src/services/scoringSettings.ts`);
 * this constant is also what every existing user without an override gets,
 * so it must never change on its own.
 */
export const RATING_THRESHOLDS: RatingThresholds = {
  easy: 0.8,
  good: 0.55,
  hard: 0.3,
};

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

/** Normalises one-or-many into a de-duplicated list, dropping blanks. */
function toList(value: string | readonly string[]): string[] {
  const list = typeof value === 'string' ? [value] : value;
  return [...new Set(list.filter((slug) => slug.length > 0))];
}

/**
 * 1.0 when any guess names any accepted pattern, 0.5 when none match exactly
 * but some guess is a defensible neighbour of an accepted one (see
 * `CLOSE_FAMILIES` in shared), 0 otherwise.
 *
 * A problem may legitimately have several accepted patterns — a grid traversal
 * answerable by BFS/DFS or by union-find — and a learner may name more than one.
 * Naming any single accepted pattern is full recognition, so the best match
 * across the two sets wins rather than an average over them.
 */
export function correctnessScore(
  guessed: string | readonly string[],
  accepted: string | readonly string[],
): number {
  const guesses = toList(guessed);
  const truths = toList(accepted);

  if (guesses.length === 0 || truths.length === 0) return CORRECTNESS_SCORES.wrong;

  let best: number = CORRECTNESS_SCORES.wrong;

  for (const guess of guesses) {
    for (const truth of truths) {
      if (guess === truth) return CORRECTNESS_SCORES.exact;
      if (areCloseFamily(guess, truth)) best = CORRECTNESS_SCORES.closeFamily;
    }
  }

  return best;
}

/**
 * Full credit up to `SPEED_GRACE_SECONDS`, then a linear decay to zero at
 * `SPEED_FLOOR_SECONDS`.
 *
 * The previous curve started decaying at the first second and hit zero at 90,
 * which zeroed this axis for any problem worth thinking about — two minutes on a
 * genuinely hard one scored the same as giving up. The grace window says "reading
 * the constraints is not slowness", and the far floor keeps the axis meaningful
 * without it dominating a correct answer.
 *
 *   0-45s -> 1.00    90s -> 0.82    150s -> 0.59
 *    60s  -> 0.94   120s -> 0.71    300s+ -> 0
 */
export function speedScore(timeTakenSeconds: number): number {
  if (!Number.isFinite(timeTakenSeconds)) return 0;
  if (timeTakenSeconds <= SPEED_GRACE_SECONDS) return 1;

  const decayWindow = SPEED_FLOOR_SECONDS - SPEED_GRACE_SECONDS;
  return clamp01(1 - (timeTakenSeconds - SPEED_GRACE_SECONDS) / decayWindow);
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
  /** One slug or several — a learner may name every pattern they think applies. */
  guessedSlug: string | readonly string[];
  /** One slug or several — a problem may accept more than one valid approach. */
  actualSlug: string | readonly string[];
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
 *
 * `thresholds` defaults to `RATING_THRESHOLDS` so every existing caller keeps
 * today's exact behaviour; pass a user's overrides to grade by their own bands
 * instead. FSRS itself still decides the actual interval from this grade —
 * only which grade a score earns is configurable.
 */
export function toFsrsRating(
  composite: number,
  thresholds: RatingThresholds = RATING_THRESHOLDS,
): Rating.Again | Rating.Hard | Rating.Good | Rating.Easy {
  const score = clamp01(composite);
  if (score >= thresholds.easy) return Rating.Easy;
  if (score >= thresholds.good) return Rating.Good;
  if (score >= thresholds.hard) return Rating.Hard;
  return Rating.Again;
}

export function ratingName(rating: Rating): string {
  return Rating[rating] ?? String(rating);
}
