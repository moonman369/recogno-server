/**
 * A minimal stand-in for `db` that answers `db.select(...)...` chains from a
 * queue: each sequential call (including the auth hook's own user lookup)
 * consumes the next queued result, in call order. Route tests use this
 * instead of a real Postgres connection, which CI does not provision.
 */

import { vi } from 'vitest';

export interface DbStub {
  select: ReturnType<typeof vi.fn>;
  /** Writes (`insert`/`delete`/`update`) resolve to `[]` — none of today's routes read their result. */
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  queue: (rows: unknown[]) => void;
  reset: () => void;
}

/** A chainable object whose every method returns itself and which resolves `results.shift()`. */
function chainable(next: () => unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from',
    'innerJoin',
    'leftJoin',
    'where',
    'orderBy',
    'groupBy',
    'limit',
    'values',
    'set',
    'onConflictDoUpdate',
    'returning',
  ];
  for (const method of methods) chain[method] = () => chain;
  // biome-ignore lint/suspicious/noThenProperty: mimics drizzle's own thenable query builder.
  chain.then = (resolve: (rows: unknown[]) => void, reject?: (err: unknown) => void) => {
    Promise.resolve(next()).then(resolve, reject);
  };
  return chain;
}

export function createDbStub(): DbStub {
  let results: unknown[][] = [];
  const shiftQueued = () => results.shift() ?? [];

  return {
    select: vi.fn(() => chainable(shiftQueued)),
    insert: vi.fn(() => chainable(() => [])),
    delete: vi.fn(() => chainable(() => [])),
    update: vi.fn(() => chainable(() => [])),
    queue: (rows: unknown[]) => results.push(rows),
    reset: () => {
      results = [];
    },
  };
}
