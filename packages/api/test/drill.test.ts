/**
 * `/drill/next` and `/drill/due-count` deck-scoping. Exercised through real
 * requests, with `db` stubbed by a small queue: each sequential
 * `db.select(...)...` call in the route (including the auth hook's own user
 * lookup) consumes the next queued result, in call order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppInstance } from '../src/app.js';
import { createDbStub } from './dbStub.js';

const dbStub = createDbStub();

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, db: dbStub, checkDatabaseConnection: vi.fn().mockResolvedValue(true) };
});

const { buildApp } = await import('../src/app.js');

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_EMAIL = 'learner@example.com';

const DUE_PROBLEM = {
  id: 1,
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Given an array...',
  constraints: 'n <= 1e5',
  sourceUrl: null,
  difficulty: 'easy',
  dueAt: new Date('2026-01-01T00:00:00.000Z'),
};

const UNSEEN_PROBLEM = {
  id: 2,
  slug: 'valid-parens',
  title: 'Valid Parentheses',
  statement: 'Given a string...',
  constraints: 's.length <= 1e4',
  sourceUrl: null,
  difficulty: 'easy',
};

const PATTERN_OPTIONS = [{ id: 1, slug: 'hash-map', name: 'Hash Map', category: 'Arrays' }];

/** The auth hook's own `select users where id = sub` lookup — always first. */
function queueAuth() {
  dbStub.queue([{ id: USER_ID, email: USER_EMAIL }]);
}

/** The deck visibility check `resolveDeckScope` runs before any drill query. */
function queueDeckVisible(deckId: number) {
  dbStub.queue([{ id: deckId }]);
}

function queueDeckNotVisible() {
  dbStub.queue([]);
}

describe('drill deck scoping', () => {
  let app: AppInstance;
  let token: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    token = app.jwt.sign({ sub: USER_ID, email: USER_EMAIL });
  });

  afterEach(async () => {
    dbStub.reset();
    vi.clearAllMocks();
    await app.close();
  });

  const authed = (url: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  describe('GET /drill/next', () => {
    it('is unaffected when no deckId is given — the due card wins as before', async () => {
      queueAuth();
      dbStub.queue([DUE_PROBLEM]); // due
      dbStub.queue(PATTERN_OPTIONS); // patternOptions

      const response = await authed('/drill/next');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ source: 'due', problem: { id: 1 } });
    });

    it('still falls through to the unseen branch when nothing is due, unscoped', async () => {
      queueAuth();
      dbStub.queue([]); // due: none
      dbStub.queue([UNSEEN_PROBLEM]); // unseen
      dbStub.queue(PATTERN_OPTIONS);

      const response = await authed('/drill/next');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ source: 'unseen', problem: { id: 2 } });
    });

    it('returns a due card scoped to a valid, visible deck', async () => {
      queueAuth();
      queueDeckVisible(7);
      dbStub.queue([DUE_PROBLEM]); // due, filtered to deckId 7
      dbStub.queue(PATTERN_OPTIONS);

      const response = await authed('/drill/next?deckId=7');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ source: 'due', problem: { id: 1 } });
    });

    it('404s with a clear message when the deck does not exist or is not the caller’s', async () => {
      queueAuth();
      queueDeckNotVisible();

      const response = await authed('/drill/next?deckId=999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Deck 999 not found' });
    });

    it('404s with a deck-specific message when the deck has no drill-eligible problems', async () => {
      queueAuth();
      queueDeckVisible(7);
      dbStub.queue([]); // due
      dbStub.queue([]); // unseen
      dbStub.queue([]); // review-ahead

      const response = await authed('/drill/next?deckId=7');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'No drill-eligible problems in deck 7.' });
    });

    it('rejects a non-numeric deckId as a validation error, before touching drill data', async () => {
      queueAuth();

      const response = await authed('/drill/next?deckId=not-a-number');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /drill/due-count', () => {
    it('counts across every visible deck when unscoped', async () => {
      queueAuth();
      dbStub.queue([{ value: 2 }]);
      dbStub.queue([{ dueAt: DUE_PROBLEM.dueAt }]);

      const response = await authed('/drill/due-count');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        dueCount: 2,
        nextDueAt: DUE_PROBLEM.dueAt.toISOString(),
      });
    });

    it('counts only the given deck when scoped', async () => {
      queueAuth();
      queueDeckVisible(7);
      dbStub.queue([{ value: 1 }]);
      dbStub.queue([]);

      const response = await authed('/drill/due-count?deckId=7');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ dueCount: 1, nextDueAt: null });
    });

    it('404s for a deck the caller cannot see', async () => {
      queueAuth();
      queueDeckNotVisible();

      const response = await authed('/drill/due-count?deckId=999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Deck 999 not found' });
    });
  });
});
