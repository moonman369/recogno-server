/**
 * The Trainer's canonical pattern taxonomy — the single source of truth shared
 * by the seed script (which writes it into `patterns`) and the drill scoring
 * logic (which reads families out of it).
 *
 * Every slug here is permanent: `problems.pattern_id`, `problem_patterns` and
 * `drill_attempt_patterns` all point at these rows, so renaming a slug orphans
 * real history. Add freely; rename never.
 *
 * A few entries appear under two headings in the source list — Tree DP is both a
 * tree technique and a DP one, Difference Array is both an array trick and an
 * interval one. Each gets exactly one slug and one category, because the slug is
 * a database key; the duplicate is noted on the entry.
 */

export interface CanonicalPattern {
  slug: string;
  name: string;
  /** Study grouping, used to build a browsable picker out of ~80 options. */
  category: string;
  description: string;
}

export const PATTERN_CATEGORIES = [
  'Arrays & Strings',
  'Two Pointers',
  'Binary Search',
  'Stack & Queue',
  'Greedy',
  'Heap',
  'Trees',
  'Graphs',
  'Dynamic Programming',
  'Recursion',
  'Bit Manipulation',
  'Intervals',
  'Linked Lists',
  'String Algorithms',
  'Range Queries',
  'Mathematics',
  'Miscellaneous',
] as const;

export type PatternCategory = (typeof PATTERN_CATEGORIES)[number];

export const CANONICAL_PATTERNS = [
  // ------------------------------------------------------- Arrays & Strings
  {
    slug: 'prefix-sum',
    name: 'Prefix Sum',
    category: 'Arrays & Strings',
    description:
      'Precompute cumulative totals so any range sum answers in constant time after linear setup.',
  },
  {
    slug: 'difference-array',
    name: 'Difference Array',
    category: 'Arrays & Strings',
    description:
      'Record range updates at their endpoints and recover the final array with one prefix pass. Also the workhorse behind offline interval updates.',
  },
  {
    slug: 'hashing',
    name: 'Hashing (HashMap / HashSet)',
    category: 'Arrays & Strings',
    description:
      'Trade memory for lookup time, turning a nested search into a single pass with a dictionary.',
  },
  {
    slug: 'frequency-counting',
    name: 'Frequency Counting',
    category: 'Arrays & Strings',
    description:
      'Tally occurrences and reason about the counts rather than the elements — anagrams, majority, k-distinct.',
  },
  {
    slug: 'coordinate-compression',
    name: 'Coordinate Compression',
    category: 'Arrays & Strings',
    description:
      'Remap sparse values spanning a huge range onto a dense 0..n index so an array can hold them.',
  },

  // ---------------------------------------------------------- Two Pointers
  {
    slug: 'two-pointers',
    name: 'Two Pointers',
    category: 'Two Pointers',
    description:
      'Walk two indices through a (usually sorted) sequence, moving whichever one provably cannot be part of a better answer.',
  },
  {
    slug: 'sliding-window',
    name: 'Sliding Window',
    category: 'Two Pointers',
    description:
      'Maintain a contiguous window over a sequence, expanding and contracting it while keeping a running aggregate.',
  },
  {
    // Listed under both Two Pointers and Linked Lists in the source taxonomy;
    // filed here because that is the deck a learner will look in for it.
    slug: 'fast-slow-pointers',
    name: 'Fast & Slow Pointers',
    category: 'Linked Lists',
    description:
      "Floyd's tortoise and hare: two different speeds detect a cycle, find its entry, or locate a midpoint in O(1) space.",
  },

  // --------------------------------------------------------- Binary Search
  {
    slug: 'binary-search',
    name: 'Binary Search',
    category: 'Binary Search',
    description:
      'Halve a sorted search space each step to locate a value or the boundary between two conditions.',
  },
  {
    slug: 'binary-search-on-answer',
    name: 'Binary Search on Answer',
    category: 'Binary Search',
    description:
      'Binary search the answer space rather than the input, using a monotone feasibility predicate to discard half of it each step.',
  },
  {
    slug: 'ternary-search',
    name: 'Ternary Search',
    category: 'Binary Search',
    description:
      'Find the extremum of a unimodal function by discarding a third of the range each step.',
  },

  // ---------------------------------------------------------- Stack & Queue
  {
    slug: 'monotonic-stack',
    name: 'Monotonic Stack',
    category: 'Stack & Queue',
    description:
      'Keep a stack whose values stay sorted, popping on violation to answer "next greater/smaller" style questions in linear time.',
  },
  {
    slug: 'monotonic-queue',
    name: 'Monotonic Queue',
    category: 'Stack & Queue',
    description:
      'A deque kept in sorted order so the extreme of a sliding window is always at the front.',
  },
  {
    slug: 'stack-simulation',
    name: 'Stack Simulation',
    category: 'Stack & Queue',
    description:
      'Model nesting directly — brackets, expression evaluation, undo history, path normalisation.',
  },
  {
    slug: 'queue-simulation',
    name: 'Queue Simulation',
    category: 'Stack & Queue',
    description: 'Model first-in-first-out processing: scheduling, buffering, round-robin turns.',
  },
  {
    slug: 'deque',
    name: 'Deque',
    category: 'Stack & Queue',
    description: 'Push and pop at both ends, when the answer needs access to either extreme.',
  },

  // ---------------------------------------------------------------- Greedy
  {
    slug: 'greedy',
    name: 'Greedy',
    category: 'Greedy',
    description:
      'Commit to the locally best choice under an exchange argument that proves it stays globally optimal.',
  },
  {
    slug: 'interval-scheduling',
    name: 'Interval Scheduling',
    category: 'Greedy',
    description:
      'Sort intervals by endpoint and take greedily — maximum non-overlapping selection, minimum removals, room allocation.',
  },

  // ------------------------------------------------------------------ Heap
  {
    slug: 'heap',
    name: 'Heap / Priority Queue',
    category: 'Heap',
    description:
      'Repeatedly pull the current extreme element from a priority queue, typically to merge streams or maintain a top-k set.',
  },
  {
    slug: 'top-k',
    name: 'Top-K Problems',
    category: 'Heap',
    description:
      'Keep only the k best seen so far, using a heap of bounded size rather than sorting everything.',
  },

  // ----------------------------------------------------------------- Trees
  {
    slug: 'tree-dfs',
    name: 'Tree DFS',
    category: 'Trees',
    description:
      'Recurse to the leaves and combine on the way back up — depths, sums, path properties, subtree aggregates.',
  },
  {
    slug: 'tree-bfs',
    name: 'Tree BFS (Level Order)',
    category: 'Trees',
    description:
      'Walk the tree one depth at a time, when the answer is per-level or shallowest-first.',
  },
  {
    slug: 'binary-search-tree',
    name: 'Binary Search Tree',
    category: 'Trees',
    description:
      'Exploit the ordering invariant: an in-order walk is sorted, and search prunes one subtree at every node.',
  },
  {
    slug: 'lowest-common-ancestor',
    name: 'Lowest Common Ancestor (LCA)',
    category: 'Trees',
    description:
      'Find the deepest node that is an ancestor of both queries, the basis for tree path decomposition.',
  },
  {
    slug: 'euler-tour',
    name: 'Euler Tour',
    category: 'Trees',
    description:
      'Flatten a tree into an array by entry/exit time, turning subtree queries into range queries.',
  },
  {
    slug: 'binary-lifting',
    name: 'Binary Lifting',
    category: 'Trees',
    description:
      'Precompute 2^k-th ancestors so any jump up the tree, and any LCA, answers in logarithmic time.',
  },

  // ---------------------------------------------------------------- Graphs
  {
    slug: 'bfs-dfs',
    name: 'BFS / DFS',
    category: 'Graphs',
    description:
      'Traverse a graph or implicit state space, using BFS for fewest-steps questions and DFS for reachability and structure.',
  },
  {
    slug: 'multi-source-bfs',
    name: 'Multi-source BFS',
    category: 'Graphs',
    description:
      "Seed the queue with every source at once so one sweep yields each cell's distance to the nearest of them.",
  },
  {
    slug: 'zero-one-bfs',
    name: '0-1 BFS',
    category: 'Graphs',
    description:
      'Shortest paths when every edge costs 0 or 1: a deque replaces the heap and the whole thing stays linear.',
  },
  {
    slug: 'dijkstra',
    name: 'Dijkstra',
    category: 'Graphs',
    description:
      'Shortest paths from one source with non-negative weights, settling the nearest unvisited node each step.',
  },
  {
    slug: 'bellman-ford',
    name: 'Bellman-Ford',
    category: 'Graphs',
    description:
      'Shortest paths that tolerate negative edges, and the standard way to detect a negative cycle.',
  },
  {
    slug: 'floyd-warshall',
    name: 'Floyd-Warshall',
    category: 'Graphs',
    description:
      'All-pairs shortest paths by relaxing through every intermediate vertex — O(n^3), so only for small n.',
  },
  {
    slug: 'topological-sort',
    name: 'Topological Sort',
    category: 'Graphs',
    description:
      'Order a DAG so every edge points forward — dependency resolution, build order, DP over a DAG.',
  },
  {
    slug: 'kahns-algorithm',
    name: "Kahn's Algorithm",
    category: 'Graphs',
    description:
      'Topological sort by repeatedly removing in-degree-zero nodes; leftover nodes prove a cycle.',
  },
  {
    slug: 'union-find',
    name: 'Union Find (DSU)',
    category: 'Graphs',
    description:
      'Disjoint set union with path compression to answer incremental connectivity and grouping questions.',
  },
  {
    slug: 'minimum-spanning-tree',
    name: 'Minimum Spanning Tree',
    category: 'Graphs',
    description:
      'Connect every vertex at least total cost — Kruskal over sorted edges, or Prim growing from one vertex.',
  },
  {
    slug: 'strongly-connected-components',
    name: 'Strongly Connected Components',
    category: 'Graphs',
    description:
      'Collapse mutually reachable vertices of a directed graph into single nodes (Kosaraju or Tarjan).',
  },
  {
    slug: 'bridges-articulation-points',
    name: 'Bridges & Articulation Points',
    category: 'Graphs',
    description:
      'Find the edges and vertices whose removal disconnects the graph, via DFS discovery and low-link times.',
  },
  {
    slug: 'bipartite-graph',
    name: 'Bipartite Graph',
    category: 'Graphs',
    description:
      'Two-colour the graph; a conflict proves an odd cycle. The setup for matching problems.',
  },
  {
    slug: 'cycle-detection',
    name: 'Cycle Detection',
    category: 'Graphs',
    description:
      'Decide whether a graph contains a cycle — colouring for directed graphs, union-find or parent tracking for undirected.',
  },
  {
    slug: 'graph-coloring',
    name: 'Graph Coloring',
    category: 'Graphs',
    description:
      'Assign labels so adjacent vertices differ, for conflict, scheduling and register-allocation shapes.',
  },

  // ----------------------------------------------------- Dynamic Programming
  {
    slug: 'dp-1d',
    name: '1D DP',
    category: 'Dynamic Programming',
    description:
      'A single array of states, each built from a constant number of earlier ones — stairs, house robber, jump games.',
  },
  {
    slug: 'dp-2d',
    name: '2D DP',
    category: 'Dynamic Programming',
    description:
      'A table indexed by two dimensions, typically two sequences or a grid — edit distance, LCS, path counting.',
  },
  {
    slug: 'dp-knapsack',
    name: 'DP — Knapsack',
    category: 'Dynamic Programming',
    description:
      'Dynamic programming over items and a bounded capacity or budget dimension, choosing to take or skip each item.',
  },
  {
    slug: 'dp-lis',
    name: 'LIS DP',
    category: 'Dynamic Programming',
    description:
      'Longest increasing subsequence and its relatives, in O(n^2) by DP or O(n log n) with patience sorting.',
  },
  {
    slug: 'dp-interval',
    name: 'DP — Interval',
    category: 'Dynamic Programming',
    description:
      'Dynamic programming over sub-intervals, combining answers for [i, k] and [k, j] at a split point.',
  },
  {
    slug: 'dp-digit',
    name: 'DP — Digit',
    category: 'Dynamic Programming',
    description:
      'Dynamic programming over the digits of a number under a tight-prefix constraint, used for counting up to enormous bounds.',
  },
  {
    slug: 'bitmask-dp',
    name: 'Bitmask DP',
    category: 'Dynamic Programming',
    description:
      'DP whose state is a subset packed into an integer — travelling salesman, assignment, subset cover over n <= ~20.',
  },
  {
    slug: 'tree-dp',
    name: 'Tree DP',
    category: 'Dynamic Programming',
    description:
      'DP where the recurrence follows parent/child structure, combining children into a parent answer. Also a core tree technique.',
  },
  {
    slug: 'dp-on-graphs',
    name: 'DP on Graphs',
    category: 'Dynamic Programming',
    description:
      'DP along a DAG, usually in topological order, when states depend on predecessors rather than an index.',
  },
  {
    slug: 'state-machine-dp',
    name: 'State Machine DP',
    category: 'Dynamic Programming',
    description:
      'Model a small set of modes and the legal transitions between them — stock trading with cooldowns, alternating constraints.',
  },
  {
    slug: 'probability-dp',
    name: 'Probability DP',
    category: 'Dynamic Programming',
    description:
      'Carry expected values or probabilities through the recurrence instead of counts or costs.',
  },
  {
    slug: 'memoization',
    name: 'Memoization',
    category: 'Dynamic Programming',
    description:
      'Top-down recursion with a cache, when the state space is sparse or the transition order is awkward to write bottom-up.',
  },

  // ------------------------------------------------------------- Recursion
  {
    slug: 'backtracking',
    name: 'Backtracking',
    category: 'Recursion',
    description:
      'Enumerate candidates depth-first, pruning branches that cannot complete, when the search space is small enough to explore.',
  },
  {
    slug: 'divide-and-conquer',
    name: 'Divide & Conquer',
    category: 'Recursion',
    description:
      'Split into independent subproblems, solve recursively, and merge — merge sort, quickselect, closest pair.',
  },
  {
    slug: 'branch-and-bound',
    name: 'Branch & Bound',
    category: 'Recursion',
    description:
      'Backtracking guided by a bound on the best achievable result, pruning whole subtrees that cannot beat the incumbent.',
  },

  // -------------------------------------------------------- Bit Manipulation
  {
    slug: 'bitmask',
    name: 'Bitmask',
    category: 'Bit Manipulation',
    description:
      'Encode a subset of a very small universe into the bits of an integer, usually as the state of a DP or an enumeration.',
  },
  {
    slug: 'xor-tricks',
    name: 'XOR Tricks',
    category: 'Bit Manipulation',
    description:
      'Exploit self-inverse and associativity: find the unpaired element, range XOR, basis of a linear span.',
  },

  // -------------------------------------------------------------- Intervals
  {
    slug: 'merge-intervals',
    name: 'Merge Intervals',
    category: 'Intervals',
    description:
      'Sort by start and coalesce overlaps — insertion, union, gap finding, conflict detection.',
  },
  {
    slug: 'line-sweep',
    name: 'Line Sweep / Event Sorting',
    category: 'Intervals',
    description:
      'Turn intervals into +1/-1 events, sort by coordinate, and sweep while maintaining a running state.',
  },

  // ------------------------------------------------------------ Linked Lists
  {
    slug: 'linked-list-reversal',
    name: 'Reversal Pattern',
    category: 'Linked Lists',
    description: 'Re-point pointers in place to reverse a list or a segment of one, in O(1) space.',
  },
  {
    slug: 'dummy-node',
    name: 'Dummy Node Pattern',
    category: 'Linked Lists',
    description:
      'Prepend a sentinel so head insertion and deletion need no special case, collapsing the edge cases.',
  },

  // -------------------------------------------------------- String Algorithms
  {
    slug: 'kmp',
    name: 'KMP',
    category: 'String Algorithms',
    description:
      'Linear substring search using a prefix-function table that says how far to fall back on a mismatch.',
  },
  {
    slug: 'rabin-karp',
    name: 'Rabin-Karp',
    category: 'String Algorithms',
    description:
      'Rolling-hash substring search, comparing hashes first and only verifying on a match.',
  },
  {
    slug: 'z-algorithm',
    name: 'Z Algorithm',
    category: 'String Algorithms',
    description:
      'Compute, for every position, the longest prefix match starting there — pattern matching and periodicity.',
  },
  {
    slug: 'trie',
    name: 'Trie',
    category: 'String Algorithms',
    description:
      'A prefix tree over a small alphabet, for shared-prefix lookup, autocomplete and maximum-XOR queries.',
  },
  {
    slug: 'rolling-hash',
    name: 'Rolling Hash',
    category: 'String Algorithms',
    description: 'Hash a window in O(1) as it slides, enabling constant-time substring comparison.',
  },
  {
    slug: 'manacher',
    name: "Manacher's Algorithm",
    category: 'String Algorithms',
    description: 'All palindromic substrings in linear time by reusing mirrored radii.',
  },
  {
    slug: 'suffix-structures',
    name: 'Suffix Array / Suffix Automaton',
    category: 'String Algorithms',
    description:
      'Index every suffix to answer repeated-substring, distinct-substring and longest-common-substring queries.',
  },

  // ---------------------------------------------------------- Range Queries
  {
    slug: 'segment-tree',
    name: 'Segment Tree',
    category: 'Range Queries',
    description:
      'Logarithmic range queries with point or (lazily propagated) range updates over any associative operation.',
  },
  {
    slug: 'fenwick-tree',
    name: 'Fenwick Tree (BIT)',
    category: 'Range Queries',
    description:
      'Prefix sums with point updates in log n, far smaller and simpler than a segment tree when that is all you need.',
  },
  {
    slug: 'sparse-table',
    name: 'Sparse Table',
    category: 'Range Queries',
    description:
      'O(1) idempotent range queries such as min or gcd, after O(n log n) precomputation. Static arrays only.',
  },
  {
    slug: 'sqrt-decomposition',
    name: 'Square Root Decomposition',
    category: 'Range Queries',
    description:
      'Split into blocks of size ~sqrt(n) to get O(sqrt n) updates and queries when a tree is awkward to maintain.',
  },

  // ----------------------------------------------------------- Mathematics
  {
    slug: 'gcd-lcm',
    name: 'GCD / LCM',
    category: 'Mathematics',
    description:
      'Euclidean algorithm and its consequences — reducing fractions, cycle alignment, lattice steps.',
  },
  {
    slug: 'sieve-of-eratosthenes',
    name: 'Sieve of Eratosthenes',
    category: 'Mathematics',
    description:
      'Precompute primes or smallest prime factors up to n, turning repeated factorisation into a lookup.',
  },
  {
    slug: 'modular-arithmetic',
    name: 'Modular Arithmetic',
    category: 'Mathematics',
    description:
      'Work under a modulus with inverses and division, the standard requirement for counting problems.',
  },
  {
    slug: 'fast-exponentiation',
    name: 'Fast Exponentiation',
    category: 'Mathematics',
    description:
      'Exponentiate by squaring in log n, for numbers, matrices or any associative operation.',
  },
  {
    slug: 'combinatorics',
    name: 'Combinatorics',
    category: 'Mathematics',
    description:
      'Count without enumerating — binomials, stars and bars, inclusion-exclusion, Catalan numbers.',
  },
  {
    slug: 'matrix-exponentiation',
    name: 'Matrix Exponentiation',
    category: 'Mathematics',
    description:
      'Express a linear recurrence as a matrix and raise it to the n-th power to jump enormous indices.',
  },

  // --------------------------------------------------------- Miscellaneous
  {
    slug: 'simulation',
    name: 'Simulation',
    category: 'Miscellaneous',
    description:
      'Just do what the statement says, carefully. The tell is that the bounds are small and no structure is being exploited.',
  },
  {
    slug: 'randomization',
    name: 'Randomization',
    category: 'Miscellaneous',
    description:
      'Use random choice to make the expected case fast or the adversarial case unlikely — random pivots, hashing, sampling.',
  },
  {
    slug: 'meet-in-the-middle',
    name: 'Meet in the Middle',
    category: 'Miscellaneous',
    description:
      'Split the input in half, enumerate each half separately, and join — turns 2^n into roughly 2^(n/2).',
  },
  {
    slug: 'offline-queries',
    name: "Offline Queries (Mo's Algorithm)",
    category: 'Miscellaneous',
    description:
      'Read every query first and reorder them so answering the batch is cheaper than answering each in turn.',
  },
  {
    slug: 'convex-hull-trick',
    name: 'Convex Hull Trick',
    category: 'Miscellaneous',
    description:
      'Maintain a hull of lines to query the optimum in log time, collapsing an O(n^2) DP transition to O(n log n).',
  },
] as const satisfies readonly CanonicalPattern[];

export type PatternSlug = (typeof CANONICAL_PATTERNS)[number]['slug'];

export const PATTERN_SLUGS = CANONICAL_PATTERNS.map((p) => p.slug) as PatternSlug[];

export function isPatternSlug(value: string): value is PatternSlug {
  return (PATTERN_SLUGS as string[]).includes(value);
}

/** Patterns grouped by category, in the declared category order. */
export function patternsByCategory(): {
  category: PatternCategory;
  patterns: CanonicalPattern[];
}[] {
  return PATTERN_CATEGORIES.map((category) => ({
    category,
    patterns: CANONICAL_PATTERNS.filter((p) => p.category === category),
  }));
}

/**
 * Pairs a learner can confuse for a defensible reason — the guess shows they read
 * the right constraint but reached for the neighbouring tool. These earn partial
 * correctness credit rather than zero.
 *
 * Curated deliberately rather than derived from `category`: two patterns sharing
 * a heading are not automatically confusable (Simulation and Randomization are
 * both "Miscellaneous" and nothing alike), and a blanket rule would inflate
 * half-credit until it meant nothing.
 */
export const CLOSE_FAMILIES = [
  // Windows and pointers are the same idea wearing different hats.
  ['sliding-window', 'two-pointers'],
  ['sliding-window', 'monotonic-stack'],
  ['sliding-window', 'monotonic-queue'],
  ['sliding-window', 'prefix-sum'],
  ['two-pointers', 'fast-slow-pointers'],
  ['fast-slow-pointers', 'cycle-detection'],

  // Range aggregation, from cheapest to most general.
  ['prefix-sum', 'difference-array'],
  ['prefix-sum', 'fenwick-tree'],
  ['fenwick-tree', 'segment-tree'],
  ['segment-tree', 'sqrt-decomposition'],
  ['sparse-table', 'segment-tree'],
  ['sqrt-decomposition', 'offline-queries'],
  ['euler-tour', 'segment-tree'],

  // Hash-shaped counting.
  ['hashing', 'frequency-counting'],
  ['hashing', 'rolling-hash'],
  ['coordinate-compression', 'hashing'],

  // Searching a space.
  ['binary-search', 'binary-search-on-answer'],
  ['binary-search-on-answer', 'greedy'],
  ['binary-search', 'ternary-search'],
  ['binary-search-on-answer', 'ternary-search'],

  // Stacks, queues and their monotone variants.
  ['monotonic-stack', 'monotonic-queue'],
  ['monotonic-queue', 'deque'],
  ['stack-simulation', 'queue-simulation'],
  ['stack-simulation', 'simulation'],
  ['queue-simulation', 'simulation'],

  // "Repeatedly take the best available" is greedy; a heap implements it.
  ['greedy', 'heap'],
  ['heap', 'top-k'],
  ['greedy', 'top-k'],
  ['greedy', 'interval-scheduling'],
  ['interval-scheduling', 'merge-intervals'],
  ['merge-intervals', 'line-sweep'],
  ['line-sweep', 'difference-array'],
  ['interval-scheduling', 'line-sweep'],

  // Tree traversal and the structures built on it.
  ['tree-dfs', 'tree-bfs'],
  ['tree-dfs', 'bfs-dfs'],
  ['tree-bfs', 'bfs-dfs'],
  ['tree-dfs', 'tree-dp'],
  ['tree-dfs', 'binary-search-tree'],
  ['lowest-common-ancestor', 'binary-lifting'],
  ['lowest-common-ancestor', 'euler-tour'],
  ['binary-lifting', 'euler-tour'],
  ['binary-search-tree', 'binary-search'],

  // Graph traversal and connectivity.
  ['bfs-dfs', 'multi-source-bfs'],
  ['bfs-dfs', 'union-find'],
  ['bfs-dfs', 'cycle-detection'],
  ['bfs-dfs', 'bipartite-graph'],
  ['multi-source-bfs', 'zero-one-bfs'],
  ['zero-one-bfs', 'dijkstra'],
  ['bfs-dfs', 'zero-one-bfs'],
  ['union-find', 'minimum-spanning-tree'],
  ['union-find', 'cycle-detection'],
  ['union-find', 'strongly-connected-components'],
  ['bipartite-graph', 'graph-coloring'],
  ['strongly-connected-components', 'bridges-articulation-points'],
  ['strongly-connected-components', 'topological-sort'],

  // Shortest paths, which differ only in what they tolerate.
  ['dijkstra', 'bellman-ford'],
  ['bellman-ford', 'floyd-warshall'],
  ['dijkstra', 'floyd-warshall'],
  ['dijkstra', 'heap'],

  // Ordering a DAG.
  ['topological-sort', 'kahns-algorithm'],
  ['topological-sort', 'dp-on-graphs'],
  ['topological-sort', 'cycle-detection'],
  ['kahns-algorithm', 'cycle-detection'],

  // DP variants share the machinery and differ in the dimension iterated.
  ['dp-1d', 'dp-2d'],
  ['dp-1d', 'memoization'],
  ['dp-2d', 'memoization'],
  ['dp-knapsack', 'dp-interval'],
  ['dp-knapsack', 'dp-digit'],
  ['dp-interval', 'dp-digit'],
  ['dp-knapsack', 'dp-1d'],
  ['dp-knapsack', 'dp-2d'],
  ['dp-1d', 'dp-lis'],
  ['dp-lis', 'binary-search'],
  ['dp-2d', 'dp-interval'],
  ['bitmask-dp', 'bitmask'],
  ['bitmask-dp', 'dp-knapsack'],
  ['tree-dp', 'dp-on-graphs'],
  ['state-machine-dp', 'dp-1d'],
  ['probability-dp', 'dp-2d'],
  ['probability-dp', 'combinatorics'],
  ['dp-on-graphs', 'memoization'],
  ['convex-hull-trick', 'dp-1d'],

  // Exhaustive search and its pruned or halved relatives.
  ['backtracking', 'bitmask'],
  ['backtracking', 'dp-knapsack'],
  ['backtracking', 'branch-and-bound'],
  ['backtracking', 'meet-in-the-middle'],
  ['backtracking', 'memoization'],
  ['meet-in-the-middle', 'bitmask'],
  ['divide-and-conquer', 'binary-search'],
  ['divide-and-conquer', 'dp-interval'],
  ['branch-and-bound', 'greedy'],

  // Bit tricks.
  ['bitmask', 'xor-tricks'],
  ['xor-tricks', 'trie'],
  ['xor-tricks', 'prefix-sum'],

  // Linked-list idioms.
  ['linked-list-reversal', 'dummy-node'],
  ['linked-list-reversal', 'two-pointers'],
  ['dummy-node', 'fast-slow-pointers'],

  // String matching, which is mostly a choice of preprocessing.
  ['kmp', 'z-algorithm'],
  ['kmp', 'rabin-karp'],
  ['rabin-karp', 'rolling-hash'],
  ['z-algorithm', 'rolling-hash'],
  ['kmp', 'suffix-structures'],
  ['suffix-structures', 'trie'],
  ['manacher', 'rolling-hash'],
  ['manacher', 'dp-interval'],

  // Number theory.
  ['gcd-lcm', 'modular-arithmetic'],
  ['sieve-of-eratosthenes', 'gcd-lcm'],
  ['modular-arithmetic', 'fast-exponentiation'],
  ['fast-exponentiation', 'matrix-exponentiation'],
  ['matrix-exponentiation', 'dp-1d'],
  ['combinatorics', 'modular-arithmetic'],
  ['combinatorics', 'dp-2d'],

  // Everything else.
  ['randomization', 'hashing'],
  ['offline-queries', 'line-sweep'],
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
