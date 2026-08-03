import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  compositeScore,
  correctnessScore,
  gradeAttempt,
  rationaleScore,
  SCORE_WEIGHTS,
  SPEED_FLOOR_SECONDS,
  SPEED_GRACE_SECONDS,
  speedScore,
  toFsrsRating,
} from './scoring.js';

describe('correctnessScore', () => {
  it('gives full credit for an exact pattern match', () => {
    expect(correctnessScore('sliding-window', 'sliding-window')).toBe(1);
  });

  it('gives half credit for a close-family match', () => {
    expect(correctnessScore('two-pointers', 'sliding-window')).toBe(0.5);
  });

  it('treats close family as symmetric', () => {
    expect(correctnessScore('sliding-window', 'two-pointers')).toBe(0.5);
  });

  it('gives half credit across the DP sub-patterns', () => {
    expect(correctnessScore('dp-interval', 'dp-knapsack')).toBe(0.5);
    expect(correctnessScore('dp-digit', 'dp-interval')).toBe(0.5);
  });

  it('gives no credit for an unrelated pattern', () => {
    expect(correctnessScore('bitmask', 'sliding-window')).toBe(0);
    expect(correctnessScore('heap', 'monotonic-stack')).toBe(0);
  });

  it('gives no credit for an unknown slug', () => {
    expect(correctnessScore('not-a-pattern', 'sliding-window')).toBe(0);
  });
});

describe('correctnessScore with multiple patterns', () => {
  // A grid-connectivity problem is a fair read as either.
  const ISLANDS = ['bfs-dfs', 'union-find'];

  it('gives full credit for naming any one accepted pattern', () => {
    expect(correctnessScore('bfs-dfs', ISLANDS)).toBe(1);
    expect(correctnessScore('union-find', ISLANDS)).toBe(1);
  });

  it('gives full credit for naming all of them', () => {
    expect(correctnessScore(ISLANDS, ISLANDS)).toBe(1);
  });

  it('gives full credit when one guess of several is right', () => {
    expect(correctnessScore(['heap', 'bfs-dfs'], ISLANDS)).toBe(1);
    expect(correctnessScore(['bitmask', 'greedy', 'union-find'], ISLANDS)).toBe(1);
  });

  it('gives full credit when a single accepted pattern is among several guesses', () => {
    expect(correctnessScore(['heap', 'sliding-window'], 'sliding-window')).toBe(1);
  });

  it('falls back to half credit when only a near neighbour was named', () => {
    // two-pointers is close family to sliding-window, but matches neither exactly.
    expect(correctnessScore(['two-pointers'], ['sliding-window', 'heap'])).toBe(0.5);
    expect(correctnessScore(['bitmask', 'two-pointers'], ['sliding-window'])).toBe(0.5);
  });

  it('prefers an exact match over a near neighbour regardless of order', () => {
    // monotonic-stack is close family to sliding-window; heap is exact.
    expect(correctnessScore(['monotonic-stack', 'heap'], ['sliding-window', 'heap'])).toBe(1);
    expect(correctnessScore(['heap', 'monotonic-stack'], ['sliding-window', 'heap'])).toBe(1);
  });

  it('gives no credit when nothing matches or neighbours', () => {
    expect(correctnessScore(['heap', 'bitmask'], ['sliding-window'])).toBe(0);
  });

  it('ignores duplicates', () => {
    expect(correctnessScore(['bfs-dfs', 'bfs-dfs'], ISLANDS)).toBe(1);
  });

  it('gives no credit for an empty guess or an empty accepted set', () => {
    expect(correctnessScore([], ISLANDS)).toBe(0);
    expect(correctnessScore(['bfs-dfs'], [])).toBe(0);
  });

  it('matches the single-slug behaviour exactly when one of each is given', () => {
    expect(correctnessScore(['sliding-window'], ['sliding-window'])).toBe(
      correctnessScore('sliding-window', 'sliding-window'),
    );
    expect(correctnessScore(['two-pointers'], ['sliding-window'])).toBe(
      correctnessScore('two-pointers', 'sliding-window'),
    );
  });
});

describe('speedScore', () => {
  it('gives full credit for anything inside the grace window', () => {
    expect(speedScore(0)).toBe(1);
    expect(speedScore(20)).toBe(1);
    expect(speedScore(SPEED_GRACE_SECONDS)).toBe(1);
  });

  it('does not punish the time it takes to read a hard problem', () => {
    // The whole point of the change: two minutes used to score 0.
    expect(speedScore(90)).toBeGreaterThan(0.75);
    expect(speedScore(120)).toBeGreaterThan(0.65);
    expect(speedScore(180)).toBeGreaterThan(0.4);
  });

  it('decays linearly between the grace point and the floor', () => {
    const midpoint = (SPEED_GRACE_SECONDS + SPEED_FLOOR_SECONDS) / 2;
    expect(speedScore(midpoint)).toBeCloseTo(0.5, 10);
    expect(speedScore(120)).toBeCloseTo(1 - 75 / 255, 10);
  });

  it('is monotonically non-increasing', () => {
    let previous = 1;
    for (let t = 0; t <= 400; t += 5) {
      const score = speedScore(t);
      expect(score, `${t}s`).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });

  it('is 0 exactly at the floor', () => {
    expect(speedScore(SPEED_FLOOR_SECONDS)).toBe(0);
  });

  it('clamps to 0 beyond the floor rather than going negative', () => {
    expect(speedScore(SPEED_FLOOR_SECONDS + 1)).toBe(0);
    expect(speedScore(10_000)).toBe(0);
  });

  it('clamps to 1 for a negative duration and 0 for a non-finite one', () => {
    expect(speedScore(-5)).toBe(1);
    expect(speedScore(Number.NaN)).toBe(0);
  });
});

describe('the composite a real attempt now earns', () => {
  it('keeps a correct, well-argued two-minute answer in the Easy band', () => {
    const { composite } = gradeAttempt({
      guessedSlug: 'dp-knapsack',
      actualSlug: 'dp-knapsack',
      timeTakenSeconds: 120,
      verdict: 'yes',
    });
    // Was 0.80 under the old curve; the axis no longer zeroes out.
    expect(composite).toBeGreaterThan(0.9);
    expect(toFsrsRating(composite)).toBe(Rating.Easy);
  });

  it('lifts a correct two-minute answer with a weak rationale out of Hard', () => {
    const { composite } = gradeAttempt({
      guessedSlug: 'dp-knapsack',
      actualSlug: 'dp-knapsack',
      timeTakenSeconds: 120,
      verdict: 'no',
    });
    // Previously exactly 0.50 → Hard, which is what prompted the change.
    expect(composite).toBeGreaterThan(0.6);
    expect(toFsrsRating(composite)).toBe(Rating.Good);
  });
});

describe('rationaleScore', () => {
  it('maps each verdict onto its band', () => {
    expect(rationaleScore('yes')).toBe(1);
    expect(rationaleScore('partial')).toBe(0.5);
    expect(rationaleScore('no')).toBe(0);
  });
});

describe('compositeScore', () => {
  it('uses the declared weights', () => {
    expect(compositeScore({ correctness: 1, speed: 0, rationale: 0 })).toBeCloseTo(
      SCORE_WEIGHTS.correctness,
      10,
    );
    expect(compositeScore({ correctness: 0, speed: 1, rationale: 0 })).toBeCloseTo(
      SCORE_WEIGHTS.speed,
      10,
    );
    expect(compositeScore({ correctness: 0, speed: 0, rationale: 1 })).toBeCloseTo(
      SCORE_WEIGHTS.rationale,
      10,
    );
  });

  it('has weights that sum to 1', () => {
    const total = SCORE_WEIGHTS.correctness + SCORE_WEIGHTS.speed + SCORE_WEIGHTS.rationale;
    expect(total).toBeCloseTo(1, 10);
  });

  it('is 1 for a perfect attempt and 0 for a total miss', () => {
    expect(compositeScore({ correctness: 1, speed: 1, rationale: 1 })).toBe(1);
    expect(compositeScore({ correctness: 0, speed: 0, rationale: 0 })).toBe(0);
  });

  it('computes a mixed attempt correctly', () => {
    // 0.5*0.5 + 0.2*0.5 + 0.3*1 = 0.25 + 0.1 + 0.3
    expect(compositeScore({ correctness: 0.5, speed: 0.5, rationale: 1 })).toBeCloseTo(0.65, 10);
  });

  it('clamps out-of-range axis values', () => {
    expect(compositeScore({ correctness: 5, speed: -3, rationale: 1 })).toBeCloseTo(0.8, 10);
  });
});

describe('gradeAttempt', () => {
  it('grades a fast, exact, well-argued attempt at the top of the scale', () => {
    const scores = gradeAttempt({
      guessedSlug: 'binary-search-on-answer',
      actualSlug: 'binary-search-on-answer',
      timeTakenSeconds: 0,
      verdict: 'yes',
    });
    expect(scores).toEqual({ correctness: 1, speed: 1, rationale: 1, composite: 1 });
  });

  it('grades a slow, wrong, unsupported attempt at the bottom', () => {
    const scores = gradeAttempt({
      guessedSlug: 'bitmask',
      actualSlug: 'sliding-window',
      timeTakenSeconds: SPEED_FLOOR_SECONDS,
      verdict: 'no',
    });
    expect(scores).toEqual({ correctness: 0, speed: 0, rationale: 0, composite: 0 });
  });

  it('grades a multi-pattern guess against a multi-pattern problem', () => {
    const scores = gradeAttempt({
      guessedSlug: ['bfs-dfs', 'union-find'],
      actualSlug: ['bfs-dfs', 'union-find'],
      timeTakenSeconds: 0,
      verdict: 'yes',
    });
    expect(scores).toEqual({ correctness: 1, speed: 1, rationale: 1, composite: 1 });
  });

  it('awards full correctness when one of several guesses is accepted', () => {
    const scores = gradeAttempt({
      guessedSlug: ['heap', 'union-find'],
      actualSlug: ['bfs-dfs', 'union-find'],
      timeTakenSeconds: 45,
      verdict: 'yes',
    });
    expect(scores.correctness).toBe(1);
  });

  it('combines a close guess with partial credit on the rationale', () => {
    const scores = gradeAttempt({
      guessedSlug: 'two-pointers',
      actualSlug: 'sliding-window',
      // Halfway down the decay, so every axis contributes exactly 0.5.
      timeTakenSeconds: (SPEED_GRACE_SECONDS + SPEED_FLOOR_SECONDS) / 2,
      verdict: 'partial',
    });
    // 0.5*0.5 + 0.2*0.5 + 0.3*0.5 = 0.5
    expect(scores.correctness).toBe(0.5);
    expect(scores.speed).toBeCloseTo(0.5, 4);
    expect(scores.rationale).toBe(0.5);
    expect(scores.composite).toBeCloseTo(0.5, 4);
  });
});

describe('toFsrsRating', () => {
  it('maps each band to its rating', () => {
    expect(toFsrsRating(0.0)).toBe(Rating.Again);
    expect(toFsrsRating(0.15)).toBe(Rating.Again);
    expect(toFsrsRating(0.4)).toBe(Rating.Hard);
    expect(toFsrsRating(0.7)).toBe(Rating.Good);
    expect(toFsrsRating(0.95)).toBe(Rating.Easy);
    expect(toFsrsRating(1)).toBe(Rating.Easy);
  });

  it('is inclusive at each band boundary', () => {
    expect(toFsrsRating(0.3)).toBe(Rating.Hard);
    expect(toFsrsRating(0.55)).toBe(Rating.Good);
    expect(toFsrsRating(0.8)).toBe(Rating.Easy);
  });

  it('drops to the band below just under each boundary', () => {
    expect(toFsrsRating(0.2999)).toBe(Rating.Again);
    expect(toFsrsRating(0.5499)).toBe(Rating.Hard);
    expect(toFsrsRating(0.7999)).toBe(Rating.Good);
  });

  it('clamps scores outside [0, 1]', () => {
    expect(toFsrsRating(-1)).toBe(Rating.Again);
    expect(toFsrsRating(42)).toBe(Rating.Easy);
    expect(toFsrsRating(Number.NaN)).toBe(Rating.Again);
  });

  it('never returns Manual, which FSRS rejects as a grade', () => {
    for (let score = 0; score <= 1.0001; score += 0.01) {
      expect(toFsrsRating(score)).not.toBe(Rating.Manual);
    }
  });
});

describe('composite to rating, end to end', () => {
  it('sends an exact fast answer with a good rationale to Easy', () => {
    const { composite } = gradeAttempt({
      guessedSlug: 'union-find',
      actualSlug: 'union-find',
      timeTakenSeconds: 10,
      verdict: 'yes',
    });
    expect(toFsrsRating(composite)).toBe(Rating.Easy);
  });

  it('sends a correct but very slow and unjustified answer to Hard', () => {
    const { composite } = gradeAttempt({
      guessedSlug: 'union-find',
      actualSlug: 'union-find',
      timeTakenSeconds: SPEED_FLOOR_SECONDS,
      verdict: 'no',
    });
    // Correctness alone is 0.5 — a right answer you cannot justify is not mastery.
    expect(composite).toBeCloseTo(0.5, 4);
    expect(toFsrsRating(composite)).toBe(Rating.Hard);
  });

  it('sends a wrong, unjustified answer to Again', () => {
    const { composite } = gradeAttempt({
      guessedSlug: 'heap',
      actualSlug: 'dp-digit',
      timeTakenSeconds: 60,
      verdict: 'no',
    });
    expect(toFsrsRating(composite)).toBe(Rating.Again);
  });

  it('caps a wrong answer at Hard however fast and articulate it was', () => {
    // Correctness carries 0.5 of the weight, so a miss cannot reach the Good
    // threshold of 0.55 — the scheduler always brings the card back soon.
    const best = gradeAttempt({
      guessedSlug: 'heap',
      actualSlug: 'dp-digit',
      timeTakenSeconds: 0,
      verdict: 'yes',
    });
    expect(best.composite).toBeCloseTo(0.5, 10);
    expect(toFsrsRating(best.composite)).toBe(Rating.Hard);
  });
});
