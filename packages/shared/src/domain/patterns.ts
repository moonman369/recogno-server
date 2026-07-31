/**
 * The Trainer's canonical pattern taxonomy. This is the single source of truth
 * shared by the seed script (which writes it into `patterns`) and the drill
 * scoring logic (which reads families out of it) — they must never drift.
 */

export const CANONICAL_PATTERNS = [
  {
    slug: 'sliding-window',
    name: 'Sliding Window',
    description:
      'Maintain a contiguous window over a sequence, expanding and contracting it while keeping a running aggregate.',
  },
  {
    slug: 'two-pointers',
    name: 'Two Pointers',
    description:
      'Walk two indices through a (usually sorted) sequence, moving whichever one provably cannot be part of a better answer.',
  },
  {
    slug: 'monotonic-stack',
    name: 'Monotonic Stack',
    description:
      'Keep a stack whose values stay sorted, popping on violation to answer "next greater/smaller" style questions in linear time.',
  },
  {
    slug: 'binary-search-on-answer',
    name: 'Binary Search on Answer',
    description:
      'Binary search the answer space rather than the input, using a monotone feasibility predicate to discard half of it each step.',
  },
  {
    slug: 'bfs-dfs',
    name: 'BFS / DFS',
    description:
      'Traverse a graph or implicit state space, using BFS for fewest-steps questions and DFS for reachability and structure.',
  },
  {
    slug: 'dp-knapsack',
    name: 'DP — Knapsack',
    description:
      'Dynamic programming over items and a bounded capacity or budget dimension, choosing to take or skip each item.',
  },
  {
    slug: 'dp-interval',
    name: 'DP — Interval',
    description:
      'Dynamic programming over sub-intervals, combining answers for [i, k] and [k, j] at a split point.',
  },
  {
    slug: 'dp-digit',
    name: 'DP — Digit',
    description:
      'Dynamic programming over the digits of a number under a tight-prefix constraint, used for counting up to enormous bounds.',
  },
  {
    slug: 'greedy',
    name: 'Greedy',
    description:
      'Commit to the locally best choice under an exchange argument that proves it stays globally optimal.',
  },
  {
    slug: 'heap',
    name: 'Heap / Priority Queue',
    description:
      'Repeatedly pull the current extreme element from a priority queue, typically to merge streams or maintain a top-k set.',
  },
  {
    slug: 'union-find',
    name: 'Union-Find',
    description:
      'Disjoint set union with path compression to answer incremental connectivity and grouping questions.',
  },
  {
    slug: 'backtracking',
    name: 'Backtracking',
    description:
      'Enumerate candidates depth-first, pruning branches that cannot complete, when the search space is small enough to explore.',
  },
  {
    slug: 'bitmask',
    name: 'Bitmask',
    description:
      'Encode a subset of a very small universe into the bits of an integer, usually as the state of a DP or an enumeration.',
  },
] as const satisfies readonly { slug: string; name: string; description: string }[];

export type PatternSlug = (typeof CANONICAL_PATTERNS)[number]['slug'];

export const PATTERN_SLUGS = CANONICAL_PATTERNS.map((p) => p.slug) as PatternSlug[];

export function isPatternSlug(value: string): value is PatternSlug {
  return (PATTERN_SLUGS as string[]).includes(value);
}

/**
 * Pairs a learner can confuse for a defensible reason — the guess shows they read
 * the right constraint but reached for the neighbouring tool. These earn partial
 * correctness credit rather than zero.
 */
export const CLOSE_FAMILIES = [
  // A window with a monotonic deque is the same idea wearing a different hat.
  ['sliding-window', 'two-pointers'],
  ['sliding-window', 'monotonic-stack'],
  // Same recurrence machinery, different dimension being iterated.
  ['dp-knapsack', 'dp-interval'],
  ['dp-knapsack', 'dp-digit'],
  ['dp-interval', 'dp-digit'],
  // The feasibility predicate inside a parametric search is almost always greedy.
  ['binary-search-on-answer', 'greedy'],
  // "Repeatedly take the best available" is a greedy strategy a heap implements.
  ['greedy', 'heap'],
  // Both answer connectivity; one traverses, one merges.
  ['bfs-dfs', 'union-find'],
  // Subset enumeration, explicit recursion versus packed integer state.
  ['backtracking', 'bitmask'],
  // Exponential subset search is the brute-force sibling of the knapsack table.
  ['backtracking', 'dp-knapsack'],
] as const satisfies readonly (readonly [PatternSlug, PatternSlug])[];

const CLOSE_FAMILY_INDEX: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const [a, b] of CLOSE_FAMILIES) {
    if (!index.has(a)) index.set(a, new Set());
    if (!index.has(b)) index.set(b, new Set());
    index.get(a)?.add(b);
    index.get(b)?.add(a);
  }
  return index;
})();

/**
 * Whether two *different* patterns are close relatives. An identical pair is an
 * exact match, not a close one, so this returns false for `a === b`.
 */
export function areCloseFamily(a: string, b: string): boolean {
  if (a === b) return false;
  return CLOSE_FAMILY_INDEX.get(a)?.has(b) ?? false;
}
