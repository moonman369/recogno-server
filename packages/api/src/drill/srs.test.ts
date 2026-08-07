import type { SrsCard } from '@recogno/shared';
import { Rating, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { gradeAttempt, toFsrsRating } from './scoring.js';
import { type Card, createEmptyCard, scheduler, toFsrsCard, toSrsCardColumns } from './srs.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function rowFrom(card: Card): SrsCard {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    problemId: 1,
    ...toSrsCardColumns(card),
    createdAt: NOW,
    updatedAt: NOW,
  } as SrsCard;
}

describe('srs card mapping', () => {
  it('round-trips a fresh card through the row shape without loss', () => {
    const card = createEmptyCard(NOW);
    expect(toFsrsCard(rowFrom(card))).toEqual(card);
  });

  it('round-trips a reviewed card, preserving state and learning steps', () => {
    const { card } = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good);
    const restored = toFsrsCard(rowFrom(card));

    expect(restored).toEqual(card);
    expect(restored.state).toBe(card.state);
    expect(restored.learning_steps).toBe(card.learning_steps);
    expect(restored.last_review).toEqual(NOW);
  });

  it('starts a new card in the New state and due immediately', () => {
    const card = createEmptyCard(NOW);
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    expect(card.due).toEqual(NOW);
  });
});

describe('scheduling responds to the composite grade', () => {
  const gradeWith = (verdict: 'yes' | 'partial' | 'no', seconds: number, guess: string) =>
    toFsrsRating(
      gradeAttempt({
        guessedSlug: guess,
        actualSlug: 'union-find',
        timeTakenSeconds: seconds,
        verdict,
      }).composite,
    );

  it('pushes a well-graded card further out than a poorly-graded one', () => {
    const empty = createEmptyCard(NOW);

    const easy = scheduler.next(empty, NOW, gradeWith('yes', 5, 'union-find')).card;
    const again = scheduler.next(empty, NOW, gradeWith('no', 120, 'bitmask')).card;

    expect(easy.due.getTime()).toBeGreaterThan(again.due.getTime());
  });

  it('advances the due date on a repeat review of the same card', () => {
    const first = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good).card;
    const secondReviewAt = new Date(first.due.getTime());
    const second = scheduler.next(first, secondReviewAt, Rating.Good).card;

    expect(second.due.getTime()).toBeGreaterThan(first.due.getTime());
    expect(second.reps).toBe(first.reps + 1);
  });

  it('counts a lapse when a Review-state card is graded Again', () => {
    let card = createEmptyCard(NOW);
    for (let i = 0; i < 4; i += 1) {
      card = scheduler.next(card, card.due, Rating.Easy).card;
    }
    expect(card.state).toBe(State.Review);

    const lapsed = scheduler.next(card, card.due, Rating.Again).card;
    expect(lapsed.lapses).toBe(card.lapses + 1);
    expect(lapsed.state).toBe(State.Relearning);
  });

  it('is deterministic, because fuzz is disabled', () => {
    const a = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good).card;
    const b = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good).card;
    expect(a.due).toEqual(b.due);
  });
});
