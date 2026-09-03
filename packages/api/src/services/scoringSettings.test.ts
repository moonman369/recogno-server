import { describe, expect, it, vi } from 'vitest';

const queued: unknown[][] = [];

function chainable() {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'values', 'onConflictDoUpdate', 'set']) {
    chain[method] = () => chain;
  }
  // biome-ignore lint/suspicious/noThenProperty: mimics drizzle's own thenable query builder.
  chain.then = (resolve: (rows: unknown[]) => void) => resolve(queued.shift() ?? []);
  return chain;
}

const dbMock = {
  select: vi.fn(() => chainable()),
  insert: vi.fn(() => chainable()),
  delete: vi.fn(() => chainable()),
};

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, db: dbMock };
});

const { getEffectiveThresholds, getThresholdOverride, setThresholds, clearThresholds } =
  await import('./scoringSettings.js');
const { RATING_THRESHOLDS } = await import('../drill/scoring.js');

describe('getThresholdOverride', () => {
  it('is undefined when the user has no row', async () => {
    queued.push([]);
    expect(await getThresholdOverride('u1')).toBeUndefined();
  });

  it('returns the stored row when one exists', async () => {
    const override = { easy: 0.9, good: 0.7, hard: 0.4 };
    queued.push([override]);
    expect(await getThresholdOverride('u1')).toEqual(override);
  });
});

describe('getEffectiveThresholds', () => {
  it('falls back to RATING_THRESHOLDS with no override — today’s exact behaviour', async () => {
    queued.push([]);
    expect(await getEffectiveThresholds('u1')).toEqual(RATING_THRESHOLDS);
  });

  it('prefers a stored override over the defaults', async () => {
    const override = { easy: 0.95, good: 0.75, hard: 0.5 };
    queued.push([override]);
    expect(await getEffectiveThresholds('u1')).toEqual(override);
  });
});

describe('setThresholds', () => {
  it('upserts and returns exactly what was passed in', async () => {
    const thresholds = { easy: 0.85, good: 0.6, hard: 0.3 };
    const result = await setThresholds('u1', thresholds);

    expect(result).toEqual(thresholds);
    expect(dbMock.insert).toHaveBeenCalled();
  });
});

describe('clearThresholds', () => {
  it('deletes the override row', async () => {
    await clearThresholds('u1');
    expect(dbMock.delete).toHaveBeenCalled();
  });
});
