/**
 * The bridge from a five-tier gradation to an FSRS rating. This is the point
 * where the note/solution flow meets the same scheduler the drill uses, so the
 * mapping is pinned here rather than left implicit.
 */

import { GRADATION_SCORES, GRADATIONS, type Gradation } from '@recogno/shared';
import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { toFsrsRating } from './scoring.js';
import { createEmptyCard, scheduler } from './srs.js';

const ratingFor = (gradation: Gradation) => toFsrsRating(GRADATION_SCORES[gradation]);

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('gradation to FSRS rating', () => {
  it('maps each tier to its intended rating', () => {
    expect(ratingFor('try-again')).toBe(Rating.Again);
    expect(ratingFor('needs-work')).toBe(Rating.Again);
    expect(ratingFor('not-bad')).toBe(Rating.Hard);
    expect(ratingFor('good-job')).toBe(Rating.Good);
    expect(ratingFor('excellent')).toBe(Rating.Easy);
  });

  it('treats both failing tiers as a lapse and every passing tier as a pass', () => {
    expect(ratingFor('try-again')).toBe(Rating.Again);
    expect(ratingFor('needs-work')).toBe(Rating.Again);

    for (const gradation of ['not-bad', 'good-job', 'excellent'] as const) {
      expect(ratingFor(gradation), `${gradation} should pass`).not.toBe(Rating.Again);
    }
  });

  it('never yields Manual, which FSRS rejects as a grade', () => {
    for (const gradation of GRADATIONS) {
      expect(ratingFor(gradation)).not.toBe(Rating.Manual);
    }
  });

  it('is monotonic: a better gradation never schedules sooner', () => {
    let previousDue = 0;

    for (const gradation of GRADATIONS) {
      const { card } = scheduler.next(createEmptyCard(NOW), NOW, ratingFor(gradation));
      expect(card.due.getTime()).toBeGreaterThanOrEqual(previousDue);
      previousDue = card.due.getTime();
    }
  });

  it('pushes Excellent meaningfully further out than Not Bad', () => {
    const notBad = scheduler.next(createEmptyCard(NOW), NOW, ratingFor('not-bad')).card;
    const excellent = scheduler.next(createEmptyCard(NOW), NOW, ratingFor('excellent')).card;

    expect(excellent.due.getTime()).toBeGreaterThan(notBad.due.getTime());
  });
});

describe('committing a gradation advances the same card the drill uses', () => {
  it('lapses a mature card when a repeat attempt is graded Try Again', () => {
    let card = createEmptyCard(NOW);
    for (let i = 0; i < 4; i += 1) {
      card = scheduler.next(card, card.due, ratingFor('excellent')).card;
    }

    const lapsed = scheduler.next(card, card.due, ratingFor('try-again')).card;

    expect(lapsed.lapses).toBe(card.lapses + 1);
    expect(lapsed.due.getTime()).toBeLessThan(card.due.getTime() + 30 * 24 * 3_600_000);
  });

  it('increments reps on each committed submission', () => {
    const first = scheduler.next(createEmptyCard(NOW), NOW, ratingFor('good-job')).card;
    const second = scheduler.next(first, first.due, ratingFor('good-job')).card;

    expect(second.reps).toBe(first.reps + 1);
    expect(second.due.getTime()).toBeGreaterThan(first.due.getTime());
  });
});
