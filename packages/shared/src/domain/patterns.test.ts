import { describe, expect, it } from 'vitest';
import { SYSTEM_DECKS, systemDeckSlugForPattern } from './decks.js';
import {
  areCloseFamily,
  CANONICAL_PATTERNS,
  CLOSE_FAMILIES,
  isPatternSlug,
  PATTERN_CATEGORIES,
  PATTERN_SLUGS,
  patternsByCategory,
} from './patterns.js';

/**
 * These slugs are referenced by `problems.pattern_id`, `problem_patterns` and
 * `drill_attempt_patterns` in the live database. Renaming one silently orphans
 * that history, so they are pinned here rather than trusted to review.
 */
const PERMANENT_SLUGS = [
  'sliding-window',
  'two-pointers',
  'monotonic-stack',
  'binary-search-on-answer',
  'bfs-dfs',
  'dp-knapsack',
  'dp-interval',
  'dp-digit',
  'greedy',
  'heap',
  'union-find',
  'backtracking',
  'bitmask',
] as const;

describe('the taxonomy', () => {
  it('never drops a slug that existing rows point at', () => {
    for (const slug of PERMANENT_SLUGS) {
      expect(isPatternSlug(slug), `${slug} must not be renamed or removed`).toBe(true);
    }
  });

  it('has unique slugs, since the slug is a database key', () => {
    expect(new Set(PATTERN_SLUGS).size).toBe(PATTERN_SLUGS.length);
  });

  it('has unique display names', () => {
    const names = CANONICAL_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses kebab-case slugs throughout', () => {
    for (const slug of PATTERN_SLUGS) {
      expect(slug, `${slug} should be kebab-case`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('gives every pattern a declared category and a real description', () => {
    for (const pattern of CANONICAL_PATTERNS) {
      expect(PATTERN_CATEGORIES, `${pattern.slug}`).toContain(pattern.category);
      expect(pattern.description.length, `${pattern.slug}`).toBeGreaterThan(30);
    }
  });

  it('leaves no category empty', () => {
    for (const { category, patterns } of patternsByCategory()) {
      expect(patterns.length, `${category} should have patterns`).toBeGreaterThan(0);
    }
  });

  it('accounts for every pattern exactly once when grouped', () => {
    const grouped = patternsByCategory().flatMap((g) => g.patterns);
    expect(grouped).toHaveLength(CANONICAL_PATTERNS.length);
  });

  it('maps every pattern to a system deck without throwing', () => {
    for (const slug of PATTERN_SLUGS) {
      expect(() => systemDeckSlugForPattern(slug), slug).not.toThrow();
    }
    expect(() => systemDeckSlugForPattern('not-a-pattern')).toThrow(/Unknown pattern/);
  });

  it('puts every pattern in the deck named after its own category', () => {
    expect(systemDeckSlugForPattern('sliding-window')).toBe('two-pointers');
    expect(systemDeckSlugForPattern('monotonic-stack')).toBe('stack-and-queue');
    expect(systemDeckSlugForPattern('binary-search-on-answer')).toBe('binary-search');
    expect(systemDeckSlugForPattern('bfs-dfs')).toBe('graphs');
    expect(systemDeckSlugForPattern('binary-search-tree')).toBe('trees');
    expect(systemDeckSlugForPattern('trie')).toBe('string-algorithms');
    expect(systemDeckSlugForPattern('fast-slow-pointers')).toBe('linked-lists');
    expect(systemDeckSlugForPattern('dp-knapsack')).toBe('dynamic-programming');
  });

  it('gives every category exactly one system deck', () => {
    const bySlug = new Set(SYSTEM_DECKS.map((d) => d.slug));
    expect(bySlug.size, 'deck slugs must be unique').toBe(SYSTEM_DECKS.length);

    const covered = new Set(SYSTEM_DECKS.map((d) => d.category));
    for (const category of PATTERN_CATEGORIES) {
      expect(covered, `${category} needs a deck`).toContain(category);
    }
    expect(SYSTEM_DECKS).toHaveLength(PATTERN_CATEGORIES.length);
  });
});

describe('close families', () => {
  it('only reference real patterns', () => {
    for (const [a, b] of CLOSE_FAMILIES) {
      expect(isPatternSlug(a), `${a} is not a pattern`).toBe(true);
      expect(isPatternSlug(b), `${b} is not a pattern`).toBe(true);
    }
  });

  it('never pairs a pattern with itself', () => {
    for (const [a, b] of CLOSE_FAMILIES) {
      expect(a, 'a pattern cannot be its own neighbour').not.toBe(b);
    }
  });

  it('lists no duplicate pair in either direction', () => {
    const seen = new Set<string>();
    for (const [a, b] of CLOSE_FAMILIES) {
      const key = [a, b].sort().join('|');
      expect(seen.has(key), `${a} + ${b} is listed twice`).toBe(false);
      seen.add(key);
    }
  });

  it('is symmetric', () => {
    for (const [a, b] of CLOSE_FAMILIES) {
      expect(areCloseFamily(a, b)).toBe(true);
      expect(areCloseFamily(b, a)).toBe(true);
    }
  });

  it('preserves the relationships the original taxonomy encoded', () => {
    expect(areCloseFamily('sliding-window', 'two-pointers')).toBe(true);
    expect(areCloseFamily('dp-knapsack', 'dp-interval')).toBe(true);
    expect(areCloseFamily('bfs-dfs', 'union-find')).toBe(true);
    expect(areCloseFamily('backtracking', 'bitmask')).toBe(true);
    expect(areCloseFamily('greedy', 'heap')).toBe(true);
  });

  it('stays curated rather than lumping whole categories together', () => {
    // Same category, nothing alike — a category-derived rule would make these
    // half-credit and hollow out the score.
    expect(areCloseFamily('simulation', 'randomization')).toBe(false);
    expect(areCloseFamily('manacher', 'trie')).toBe(false);
    expect(areCloseFamily('deque', 'stack-simulation')).toBe(false);
  });

  it('does not connect genuinely unrelated patterns', () => {
    expect(areCloseFamily('sieve-of-eratosthenes', 'linked-list-reversal')).toBe(false);
    expect(areCloseFamily('trie', 'dijkstra')).toBe(false);
  });

  it('keeps the neighbourhood of any one pattern small enough to be meaningful', () => {
    const counts = new Map<string, number>();
    for (const [a, b] of CLOSE_FAMILIES) {
      counts.set(a, (counts.get(a) ?? 0) + 1);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    for (const [slug, count] of counts) {
      expect(count, `${slug} has too many neighbours to mean anything`).toBeLessThanOrEqual(12);
    }
  });
});
