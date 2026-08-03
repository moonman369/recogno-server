/**
 * The system-owned decks that hold the curated bank.
 *
 * One deck per pattern category, so the deck list and the pattern taxonomy are
 * the same organising idea seen twice. The earlier five broad decks stopped
 * working once the taxonomy reached 84 patterns: "Binary Trees" was reachable
 * only through a deck called Graphs, and Range Queries through one called
 * Search & Greedy.
 */

import { CANONICAL_PATTERNS, type PatternCategory } from './patterns.js';

export interface SystemDeck {
  slug: string;
  name: string;
  description: string;
  category: PatternCategory;
}

/**
 * Slugs are permanent: `problems.deck_id` points at these rows. Three of them
 * (`arrays-and-strings`, `graphs`, `dynamic-programming`) predate the re-cut and
 * are deliberately reused rather than renamed.
 */
export const SYSTEM_DECKS = [
  {
    slug: 'arrays-and-strings',
    name: 'Arrays & Strings',
    category: 'Arrays & Strings',
    description: 'Prefix sums, hashing, counting and the tricks that make one linear pass enough.',
  },
  {
    slug: 'two-pointers',
    name: 'Two Pointers & Sliding Window',
    category: 'Two Pointers',
    description:
      'Contiguous spans and converging indices, where one side is provably safe to move.',
  },
  {
    slug: 'binary-search',
    name: 'Binary Search',
    category: 'Binary Search',
    description: 'Halving a sorted input, a 2D matrix, or the answer space itself.',
  },
  {
    slug: 'stack-and-queue',
    name: 'Stacks & Queues',
    category: 'Stack & Queue',
    description: 'Nesting, ordering and the monotone variants that answer next-greater questions.',
  },
  {
    slug: 'greedy',
    name: 'Greedy',
    category: 'Greedy',
    description: 'Locally optimal choices backed by an exchange argument.',
  },
  {
    slug: 'heap',
    name: 'Heaps & Top-K',
    category: 'Heap',
    description: 'Repeatedly taking the current extreme, and keeping only the k best.',
  },
  {
    slug: 'trees',
    name: 'Trees & Binary Search Trees',
    category: 'Trees',
    description: 'Traversal, the BST ordering invariant, ancestors and subtree aggregates.',
  },
  {
    slug: 'graphs',
    name: 'Graphs',
    category: 'Graphs',
    description: 'Traversal, shortest paths, ordering a DAG, and connectivity.',
  },
  {
    slug: 'dynamic-programming',
    name: 'Dynamic Programming',
    category: 'Dynamic Programming',
    description: 'Overlapping subproblems over a bounded state space.',
  },
  {
    slug: 'recursion',
    name: 'Recursion & Backtracking',
    category: 'Recursion',
    description: 'Exhaustive search with pruning, and divide-and-conquer.',
  },
  {
    slug: 'bit-manipulation',
    name: 'Bit Manipulation',
    category: 'Bit Manipulation',
    description: 'Subsets packed into integers, and the algebra of XOR.',
  },
  {
    slug: 'intervals',
    name: 'Intervals',
    category: 'Intervals',
    description: 'Merging, scheduling and sweeping over ranges.',
  },
  {
    slug: 'linked-lists',
    name: 'Linked Lists',
    category: 'Linked Lists',
    description: 'Pointer surgery in constant space: reversal, sentinels, and two speeds.',
  },
  {
    slug: 'string-algorithms',
    name: 'Advanced Strings',
    category: 'String Algorithms',
    description: 'Prefix functions, rolling hashes, tries and suffix structures.',
  },
  {
    slug: 'range-queries',
    name: 'Range Query Structures',
    category: 'Range Queries',
    description: 'Segment trees, Fenwick trees and their cheaper cousins.',
  },
  {
    slug: 'mathematics',
    name: 'Mathematics',
    category: 'Mathematics',
    description: 'Number theory, modular arithmetic and counting without enumerating.',
  },
  {
    slug: 'miscellaneous',
    name: 'Miscellaneous',
    category: 'Miscellaneous',
    description: 'Simulation, meet in the middle, and everything with no better home.',
  },
] as const satisfies readonly SystemDeck[];

const DECK_SLUG_BY_CATEGORY = new Map<string, string>(
  SYSTEM_DECKS.map((deck) => [deck.category, deck.slug]),
);

const CATEGORY_BY_PATTERN = new Map<string, string>(
  CANONICAL_PATTERNS.map((p) => [p.slug, p.category]),
);

/** Which system deck a curated pattern belongs to. Throws on an unknown slug. */
export function systemDeckSlugForPattern(patternSlug: string): string {
  const category = CATEGORY_BY_PATTERN.get(patternSlug);
  if (!category) {
    throw new Error(`Unknown pattern "${patternSlug}"`);
  }

  const deckSlug = DECK_SLUG_BY_CATEGORY.get(category);
  if (!deckSlug) {
    throw new Error(`Pattern category "${category}" has no system deck`);
  }
  return deckSlug;
}
