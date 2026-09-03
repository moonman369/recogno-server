/**
 * `/settings/scoring`: get, set and clear a user's composite→FSRS-rating
 * thresholds. `db` is stubbed as in `drill.test.ts` — see `dbStub.ts`.
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

const USER_ID = '22222222-2222-2222-2222-222222222222';
const USER_EMAIL = 'learner@example.com';

function queueAuth() {
  dbStub.queue([{ id: USER_ID, email: USER_EMAIL }]);
}

describe('/settings/scoring', () => {
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

  const request = (method: 'GET' | 'PUT' | 'DELETE', payload?: object) =>
    app.inject({
      method,
      url: '/settings/scoring',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  describe('GET', () => {
    it('reports the built-in defaults when the user has no override', async () => {
      queueAuth();
      dbStub.queue([]); // no scoring_settings row

      const response = await request('GET');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        thresholds: { easy: 0.8, good: 0.55, hard: 0.3 },
        isDefault: true,
      });
    });

    it('reports a stored override', async () => {
      queueAuth();
      dbStub.queue([{ easy: 0.9, good: 0.6, hard: 0.35 }]);

      const response = await request('GET');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        thresholds: { easy: 0.9, good: 0.6, hard: 0.35 },
        isDefault: false,
      });
    });
  });

  describe('PUT', () => {
    it('accepts a valid, strictly ordered set of thresholds', async () => {
      queueAuth();

      const response = await request('PUT', { easy: 0.85, good: 0.6, hard: 0.25 });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        thresholds: { easy: 0.85, good: 0.6, hard: 0.25 },
        isDefault: false,
      });
      expect(dbStub.insert).toHaveBeenCalled();
    });

    it('rejects thresholds that are not strictly decreasing', async () => {
      queueAuth();

      const response = await request('PUT', { easy: 0.5, good: 0.6, hard: 0.3 });

      expect(response.statusCode).toBe(400);
      expect(dbStub.insert).not.toHaveBeenCalled();
    });

    it('rejects a threshold outside [0, 1]', async () => {
      queueAuth();

      const response = await request('PUT', { easy: 1.5, good: 0.6, hard: 0.3 });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('clears the override and reports the defaults', async () => {
      queueAuth();

      const response = await request('DELETE');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        thresholds: { easy: 0.8, good: 0.55, hard: 0.3 },
        isDefault: true,
      });
      expect(dbStub.delete).toHaveBeenCalled();
    });
  });
});
