/**
 * Seeds the canonical pattern taxonomy plus a small hand-written fixture bank,
 * so the drill endpoints are exercisable without a real ingestion pipeline.
 *
 * Idempotent: every table is upserted on its natural key, so re-running only
 * refreshes text. Run with `pnpm db:seed`.
 */

import { sql } from 'drizzle-orm';
import { CANONICAL_PATTERNS } from '../domain/patterns.js';
import { createLogger } from '../logger.js';
import { closeDatabase, db } from './index.js';
import { type Difficulty, patterns, problems, tells } from './schema.js';

const log = createLogger('seed');

/** `excluded.<column>` — the rejected row, referenced inside ON CONFLICT DO UPDATE. */
function excluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

interface ProblemFixture {
  slug: string;
  title: string;
  statement: string;
  constraints: string;
  sourceUrl: string;
  patternSlug: string;
  difficulty: Difficulty;
  /** Why the constraints give the pattern away. Shown only after a guess. */
  tell: string;
}

const PROBLEM_FIXTURES: ProblemFixture[] = [
  // ---------------------------------------------------------------- sliding window
  {
    slug: 'longest-substring-without-repeating-characters',
    title: 'Longest Substring Without Repeating Characters',
    statement:
      'Given a string s, return the length of the longest contiguous substring that contains no repeated characters.',
    constraints:
      '0 <= s.length <= 5 * 10^4. s consists of English letters, digits, symbols and spaces.',
    sourceUrl: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
    patternSlug: 'sliding-window',
    difficulty: 'medium',
    tell: 'The answer must be contiguous and n is 5*10^4, so an O(n^2) scan of every substring is out. "No repeated characters" is monotone under shrinking — if a window is invalid, every window containing it is too — which is exactly the property that lets a left pointer advance without ever backtracking.',
  },
  {
    slug: 'minimum-window-substring',
    title: 'Minimum Window Substring',
    statement:
      'Given strings s and t, return the shortest contiguous substring of s that contains every character of t including duplicates. Return the empty string if none exists.',
    constraints:
      '1 <= s.length, t.length <= 10^5. s and t consist of uppercase and lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/minimum-window-substring/',
    patternSlug: 'sliding-window',
    difficulty: 'hard',
    tell: 'Asking for the *shortest* contiguous span that satisfies a containment predicate is the sliding-window signature. Validity is monotone under growth, so you expand until valid and then contract while it stays valid; the 10^5 bound rules out checking windows independently.',
  },
  {
    slug: 'max-consecutive-ones-iii',
    title: 'Max Consecutive Ones III',
    statement:
      'Given a binary array nums and an integer k, return the length of the longest contiguous subarray containing only 1s after flipping at most k zeros.',
    constraints: '1 <= nums.length <= 10^5. nums[i] is 0 or 1. 0 <= k <= nums.length.',
    sourceUrl: 'https://leetcode.com/problems/max-consecutive-ones-iii/',
    patternSlug: 'sliding-window',
    difficulty: 'medium',
    tell: '"At most k" of something, over a contiguous range, with a longest-length objective. The budget k is a window invariant: once a window holds more than k zeros it can never become valid again by growing, so the left edge only ever moves forward.',
  },

  // ----------------------------------------------------------------- two pointers
  {
    slug: 'two-sum-ii-input-array-is-sorted',
    title: 'Two Sum II — Input Array Is Sorted',
    statement:
      'Given a 1-indexed array of integers numbers sorted in non-decreasing order, find two numbers that add up to a specific target and return their indices.',
    constraints:
      '2 <= numbers.length <= 3 * 10^4. numbers is sorted in non-decreasing order. Your solution must use only constant extra space.',
    sourceUrl: 'https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/',
    patternSlug: 'two-pointers',
    difficulty: 'medium',
    tell: 'The sortedness is stated as a given, and constant extra space explicitly forbids the hash map you would reach for otherwise. Sorted plus O(1) space means opposite-end pointers: the sum moves monotonically as either end steps inward, so each comparison eliminates a whole row or column of candidate pairs.',
  },
  {
    slug: 'container-with-most-water',
    title: 'Container With Most Water',
    statement:
      'Given an array height where height[i] is the height of a vertical line at position i, find two lines that together with the x-axis form a container holding the most water. Return the maximum amount.',
    constraints: 'n == height.length. 2 <= n <= 10^5. 0 <= height[i] <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/container-with-most-water/',
    patternSlug: 'two-pointers',
    difficulty: 'medium',
    tell: 'Every pair matters but n is 10^5, so the pairs cannot be enumerated. The exchange argument is the tell: for the current widest pair, moving the taller line inward can never help, so the shorter line is provably discardable. That "one side is safe to drop" proof is what two pointers formalises.',
  },
  {
    slug: 'three-sum',
    title: '3Sum',
    statement:
      'Given an integer array nums, return all unique triplets [nums[i], nums[j], nums[k]] with distinct indices that sum to zero.',
    constraints: '3 <= nums.length <= 3000. -10^5 <= nums[i] <= 10^5.',
    sourceUrl: 'https://leetcode.com/problems/3sum/',
    patternSlug: 'two-pointers',
    difficulty: 'medium',
    tell: 'n is only 3000, so an O(n^2) solution is comfortably in budget while O(n^3) is not. That gap points at fixing one element and solving the remaining 2-sum in linear time — which, once you sort to handle the uniqueness requirement, is a converging pointer pair.',
  },

  // -------------------------------------------------------------- monotonic stack
  {
    slug: 'daily-temperatures',
    title: 'Daily Temperatures',
    statement:
      'Given an array of daily temperatures, return an array where answer[i] is the number of days you must wait after day i for a warmer temperature, or 0 if there is none.',
    constraints: '1 <= temperatures.length <= 10^5. 30 <= temperatures[i] <= 100.',
    sourceUrl: 'https://leetcode.com/problems/daily-temperatures/',
    patternSlug: 'monotonic-stack',
    difficulty: 'medium',
    tell: '"Next strictly greater element to the right, for every index" is the canonical monotonic-stack question. Once a warmer day appears, every colder day still waiting is resolved at once and can be discarded forever — so the pending days form a decreasing stack and each index is pushed and popped once.',
  },
  {
    slug: 'largest-rectangle-in-histogram',
    title: 'Largest Rectangle in Histogram',
    statement:
      "Given an array heights representing a histogram's bar heights where each bar has width 1, return the area of the largest rectangle in the histogram.",
    constraints: '1 <= heights.length <= 10^5. 0 <= heights[i] <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/largest-rectangle-in-histogram/',
    patternSlug: 'monotonic-stack',
    difficulty: 'hard',
    tell: 'Every candidate rectangle is pinned by its shortest bar, so the real question is "how far left and right can each bar extend before something shorter blocks it" — previous-smaller and next-smaller for all indices. That pair of boundary queries at n = 10^5 is what an increasing stack answers in one pass.',
  },

  // ------------------------------------------------------- binary search on answer
  {
    slug: 'koko-eating-bananas',
    title: 'Koko Eating Bananas',
    statement:
      'Koko eats bananas from piles at a chosen integer speed k per hour, finishing at most one pile per hour. Return the minimum k that lets her finish all piles within h hours.',
    constraints: '1 <= piles.length <= 10^4. piles.length <= h <= 10^9. 1 <= piles[i] <= 10^9.',
    sourceUrl: 'https://leetcode.com/problems/koko-eating-bananas/',
    patternSlug: 'binary-search-on-answer',
    difficulty: 'medium',
    tell: 'The answer is an integer in [1, 10^9] — far too large to try each value — but checking "does speed k finish in h hours" is a cheap O(n) sum. And feasibility is monotone: any speed above a workable one also works. A monotone predicate over a huge integer answer space means you binary search the answer, not the input.',
  },
  {
    slug: 'split-array-largest-sum',
    title: 'Split Array Largest Sum',
    statement:
      'Given an integer array nums and an integer k, split nums into k non-empty contiguous subarrays so as to minimise the largest subarray sum. Return that minimised largest sum.',
    constraints: '1 <= nums.length <= 1000. 0 <= nums[i] <= 10^6. 1 <= k <= min(50, nums.length).',
    sourceUrl: 'https://leetcode.com/problems/split-array-largest-sum/',
    patternSlug: 'binary-search-on-answer',
    difficulty: 'hard',
    tell: 'A min-max objective over a numeric answer is the strongest hint there is. Guess a cap on the largest sum and the check becomes greedy — fill each part until it would exceed the cap, count the parts — and feasibility is monotone in the cap, so the search space [max(nums), sum(nums)] halves each step.',
  },
  {
    slug: 'capacity-to-ship-packages-within-d-days',
    title: 'Capacity to Ship Packages Within D Days',
    statement:
      'Packages must ship in order within days days. Return the least ship capacity such that the packages can all be shipped in that time.',
    constraints: '1 <= days <= weights.length <= 5 * 10^4. 1 <= weights[i] <= 500.',
    sourceUrl: 'https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/',
    patternSlug: 'binary-search-on-answer',
    difficulty: 'medium',
    tell: '"The least capacity such that ..." asks for a threshold, and the order-preserving requirement makes the feasibility check a single greedy pass. Bigger capacity never hurts, so the predicate is monotone and the answer lives in the searchable range [max(weights), sum(weights)].',
  },

  // -------------------------------------------------------------------- BFS / DFS
  {
    slug: 'rotting-oranges',
    title: 'Rotting Oranges',
    statement:
      'In a grid of empty cells, fresh oranges and rotten oranges, every minute a fresh orange adjacent to a rotten one becomes rotten. Return the minimum number of minutes until no fresh orange remains, or -1 if impossible.',
    constraints: 'm == grid.length, n == grid[i].length. 1 <= m, n <= 10. grid[i][j] is 0, 1 or 2.',
    sourceUrl: 'https://leetcode.com/problems/rotting-oranges/',
    patternSlug: 'bfs-dfs',
    difficulty: 'medium',
    tell: 'Every edge costs exactly one minute and the question is the *minimum* time — unweighted shortest path, so BFS. The twist is that rot spreads from all rotten cells at once, which is a multi-source BFS: seed the queue with every rotten cell and the level index is the elapsed minute.',
  },
  {
    slug: 'number-of-islands',
    title: 'Number of Islands',
    statement:
      "Given an m x n binary grid where '1' is land and '0' is water, return the number of islands. An island is surrounded by water and formed by connecting adjacent land cells horizontally or vertically.",
    constraints:
      "m == grid.length, n == grid[i].length. 1 <= m, n <= 300. grid[i][j] is '0' or '1'.",
    sourceUrl: 'https://leetcode.com/problems/number-of-islands/',
    patternSlug: 'bfs-dfs',
    difficulty: 'medium',
    tell: 'Counting connected components in a static grid. The grid is given up front rather than built by incremental unions, so a flood fill from each unvisited land cell settles it in one O(m*n) sweep — no disjoint-set bookkeeping is needed when the edges never arrive over time.',
  },

  // ------------------------------------------------------------------ DP knapsack
  {
    slug: 'partition-equal-subset-sum',
    title: 'Partition Equal Subset Sum',
    statement:
      'Given an integer array nums, return true if the array can be partitioned into two subsets whose sums are equal.',
    constraints: '1 <= nums.length <= 200. 1 <= nums[i] <= 100.',
    sourceUrl: 'https://leetcode.com/problems/partition-equal-subset-sum/',
    patternSlug: 'dp-knapsack',
    difficulty: 'medium',
    tell: 'The question is really "is some subset summing to total/2 reachable". The giveaway is the *product* of the bounds: 200 items times a total under 20000 is a 4-million-cell table, tiny — while 2^200 subsets is not. Small items x small bounded capacity is the knapsack shape.',
  },
  {
    slug: 'coin-change',
    title: 'Coin Change',
    statement:
      'Given an integer array coins and an integer amount, return the fewest number of coins needed to make up that amount, or -1 if it cannot be made. You have an infinite supply of each coin.',
    constraints: '1 <= coins.length <= 12. 1 <= coins[i] <= 2^31 - 1. 0 <= amount <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/coin-change/',
    patternSlug: 'dp-knapsack',
    difficulty: 'medium',
    tell: 'Amount is capped at 10^4, which is the tell — a bounded capacity dimension you can index an array by. Greedy fails here because the coin denominations are arbitrary, so you need the full unbounded-knapsack table over amounts 0..amount.',
  },
];

async function seed(): Promise<void> {
  log.info({ patterns: CANONICAL_PATTERNS.length, problems: PROBLEM_FIXTURES.length }, 'Seeding');

  await db.transaction(async (tx) => {
    const insertedPatterns = await tx
      .insert(patterns)
      .values(
        CANONICAL_PATTERNS.map((p) => ({ slug: p.slug, name: p.name, description: p.description })),
      )
      .onConflictDoUpdate({
        target: patterns.slug,
        set: {
          name: excluded('name'),
          description: excluded('description'),
        },
      })
      .returning({ id: patterns.id, slug: patterns.slug });

    const patternIdBySlug = new Map(insertedPatterns.map((p) => [p.slug, p.id]));

    const problemRows = PROBLEM_FIXTURES.map((fixture) => {
      const patternId = patternIdBySlug.get(fixture.patternSlug);
      if (patternId === undefined) {
        throw new Error(
          `Fixture "${fixture.slug}" references unknown pattern "${fixture.patternSlug}"`,
        );
      }
      return {
        slug: fixture.slug,
        title: fixture.title,
        statement: fixture.statement,
        constraints: fixture.constraints,
        sourceUrl: fixture.sourceUrl,
        patternId,
        difficulty: fixture.difficulty,
      };
    });

    const insertedProblems = await tx
      .insert(problems)
      .values(problemRows)
      .onConflictDoUpdate({
        target: problems.slug,
        set: {
          title: excluded('title'),
          statement: excluded('statement'),
          constraints: excluded('constraints'),
          sourceUrl: excluded('source_url'),
          patternId: excluded('pattern_id'),
          difficulty: excluded('difficulty'),
        },
      })
      .returning({ id: problems.id, slug: problems.slug });

    const problemIdBySlug = new Map(insertedProblems.map((p) => [p.slug, p.id]));

    const tellRows = PROBLEM_FIXTURES.map((fixture) => {
      const problemId = problemIdBySlug.get(fixture.slug);
      if (problemId === undefined) {
        throw new Error(`Problem "${fixture.slug}" was not inserted`);
      }
      return { problemId, tellText: fixture.tell, source: 'seed' as const };
    });

    await tx
      .insert(tells)
      .values(tellRows)
      .onConflictDoUpdate({
        target: tells.problemId,
        set: { tellText: excluded('tell_text'), source: excluded('source') },
      });

    log.info(
      {
        patterns: insertedPatterns.length,
        problems: insertedProblems.length,
        tells: tellRows.length,
      },
      'Seed complete',
    );
  });
}

seed()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch(async (error) => {
    log.error({ err: error }, 'Seed failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
