/**
 * The curated problem bank.
 *
 * Hand-written rather than scraped: the `tell` is the whole product, and it has
 * to name the specific signal in the constraints that gives the pattern away.
 * Statements are paraphrased summaries, not copies of the original text.
 *
 * `patternSlug` is the canonical answer that the tell explains. Anything in
 * `alsoAcceptedPatternSlugs` is an equally fair read and earns full credit.
 */

import type { Difficulty } from './schema.js';

export interface ProblemFixture {
  slug: string;
  title: string;
  statement: string;
  constraints: string;
  sourceUrl: string;
  patternSlug: string;
  /**
   * Further patterns that are an equally fair read of this problem. Naming any
   * one of these, or the primary, is full credit in the drill.
   */
  alsoAcceptedPatternSlugs?: string[];
  difficulty: Difficulty;
  /** Why the constraints give the pattern away. Shown only after a guess. */
  tell: string;
}

export const PROBLEM_FIXTURES: ProblemFixture[] = [
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
    // Connected components are as fairly counted by merging cells as by
    // traversing them; both are correct reads of the same structure.
    alsoAcceptedPatternSlugs: ['union-find'],
    difficulty: 'medium',
    tell: 'Counting connected components in a static grid. The grid is given up front rather than built by incremental unions, so a flood fill from each unvisited land cell settles it in one O(m*n) sweep — though a disjoint-set union over adjacent land cells answers the same question just as directly.',
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
    // The reachable-sums set is a bitset, and shifting it is the same recurrence.
    alsoAcceptedPatternSlugs: ['bitmask'],
    difficulty: 'medium',
    tell: 'The question is really "is some subset summing to total/2 reachable". The giveaway is the *product* of the bounds: 200 items times a total under 20000 is a 4-million-cell table, tiny — while 2^200 subsets is not. Small items x small bounded capacity is the knapsack shape, and the same table collapses neatly into a shifted bitset.',
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

  // ================================================================ arrays & strings
  {
    slug: 'two-sum',
    title: 'Two Sum',
    statement:
      'Given an array of integers and a target, return the indices of the two numbers that add up to the target.',
    constraints:
      '2 <= nums.length <= 10^4. -10^9 <= nums[i], target <= 10^9. Exactly one valid answer exists.',
    sourceUrl: 'https://leetcode.com/problems/two-sum/',
    patternSlug: 'hashing',
    difficulty: 'easy',
    tell: 'The array is explicitly *not* sorted and indices must be returned, which rules out sorting or a pointer pair. What is left is the complement question — "have I already seen target - x?" — and that is a dictionary lookup, turning the O(n^2) pair scan into one pass.',
  },
  {
    slug: 'product-of-array-except-self',
    title: 'Product of Array Except Self',
    statement:
      'Return an array where each position holds the product of every other element, without using division.',
    constraints:
      '2 <= nums.length <= 10^5. The product of any prefix or suffix fits in a 32-bit integer. Must run in O(n).',
    sourceUrl: 'https://leetcode.com/problems/product-of-array-except-self/',
    patternSlug: 'prefix-sum',
    difficulty: 'medium',
    tell: 'Banning division is the whole hint: without it, each answer is "everything to my left" times "everything to my right". Those are cumulative products from each end — a prefix scan and a suffix scan — which is the multiplicative form of a prefix sum.',
  },
  {
    slug: 'maximum-subarray',
    title: 'Maximum Subarray',
    statement: 'Find the contiguous subarray with the largest sum and return that sum.',
    constraints: '1 <= nums.length <= 10^5. -10^4 <= nums[i] <= 10^4. Values may be negative.',
    sourceUrl: 'https://leetcode.com/problems/maximum-subarray/',
    patternSlug: 'dp-1d',
    alsoAcceptedPatternSlugs: ['greedy'],
    difficulty: 'medium',
    tell: 'Negative values are allowed, which kills the sliding window — shrinking from the left is not monotone when adding an element can lower the sum. The surviving idea is a one-state recurrence: the best sum ending here is either this element alone or this element plus the best ending previously.',
  },
  {
    slug: 'valid-anagram',
    title: 'Valid Anagram',
    statement: 'Decide whether one string is a rearrangement of another.',
    constraints: '1 <= s.length, t.length <= 5 * 10^4. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/valid-anagram/',
    patternSlug: 'frequency-counting',
    difficulty: 'easy',
    tell: 'Order is exactly what the question discards, so the only thing that matters is how many of each letter there are. A 26-slot tally settles it in one pass, where sorting would cost an unnecessary log factor.',
  },
  {
    slug: 'group-anagrams',
    title: 'Group Anagrams',
    statement:
      'Group a list of strings so that words which are rearrangements of each other end up together.',
    constraints: '1 <= strs.length <= 10^4. 0 <= strs[i].length <= 100. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/group-anagrams/',
    patternSlug: 'hashing',
    alsoAcceptedPatternSlugs: ['frequency-counting'],
    difficulty: 'medium',
    tell: 'Grouping needs a canonical key that is identical for every member of a group and different across groups. Sorted letters, or the 26-count tuple, is that key — and once you have a key, the grouping itself is a dictionary.',
  },
  {
    slug: 'longest-consecutive-sequence',
    title: 'Longest Consecutive Sequence',
    statement:
      'Given an unsorted array, return the length of the longest run of consecutive integers, in O(n) time.',
    constraints: '0 <= nums.length <= 10^5. -10^9 <= nums[i] <= 10^9.',
    sourceUrl: 'https://leetcode.com/problems/longest-consecutive-sequence/',
    patternSlug: 'hashing',
    alsoAcceptedPatternSlugs: ['union-find'],
    difficulty: 'medium',
    tell: 'The required O(n) explicitly forbids sorting, and the 10^9 value range forbids indexing by value. A set gives O(1) membership, and starting a walk only from values with no predecessor keeps the total work linear.',
  },
  {
    slug: 'first-missing-positive',
    title: 'First Missing Positive',
    statement: 'Find the smallest positive integer absent from an unsorted array.',
    constraints:
      '1 <= nums.length <= 10^5. -2^31 <= nums[i] <= 2^31 - 1. O(n) time and O(1) extra space.',
    sourceUrl: 'https://leetcode.com/problems/first-missing-positive/',
    patternSlug: 'hashing',
    difficulty: 'hard',
    tell: 'The answer must lie in [1, n+1], because n values cannot cover more than that. The O(1) space requirement is what makes it hard: the array itself has to serve as the hash table, each value placed at its own index.',
  },

  // ================================================================== two pointers
  {
    slug: 'valid-palindrome',
    title: 'Valid Palindrome',
    statement:
      'Decide whether a string reads the same forwards and backwards, considering only alphanumeric characters and ignoring case.',
    constraints: '1 <= s.length <= 2 * 10^5. Printable ASCII.',
    sourceUrl: 'https://leetcode.com/problems/valid-palindrome/',
    patternSlug: 'two-pointers',
    difficulty: 'easy',
    tell: 'Palindromity is a statement about symmetric positions, so the natural comparison is first against last, working inwards. Building a cleaned copy also works but costs O(n) space the pointer pair does not need.',
  },
  {
    slug: 'sort-colors',
    title: 'Sort Colors',
    statement: 'Sort an array containing only the values 0, 1 and 2 in place, in one pass.',
    constraints: '1 <= nums.length <= 300. nums[i] is 0, 1 or 2. One-pass, constant space.',
    sourceUrl: 'https://leetcode.com/problems/sort-colors/',
    patternSlug: 'two-pointers',
    difficulty: 'medium',
    tell: 'Only three distinct values, and a one-pass in-place requirement. That combination is the Dutch national flag partition: a low and a high boundary pointer, with a scanner between them swapping elements to whichever end they belong.',
  },
  {
    slug: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    statement:
      'Given an elevation map of bar heights, compute how much water is trapped between the bars after it rains.',
    constraints: 'n == height.length. 1 <= n <= 2 * 10^4. 0 <= height[i] <= 10^5.',
    sourceUrl: 'https://leetcode.com/problems/trapping-rain-water/',
    patternSlug: 'two-pointers',
    alsoAcceptedPatternSlugs: ['monotonic-stack', 'prefix-sum'],
    difficulty: 'hard',
    tell: 'Water above a column is capped by the smaller of the tallest bar to its left and to its right. Once you see that the shorter side is the binding constraint, converging pointers can each commit their side safely — and the same insight also falls out of a decreasing stack.',
  },

  // ================================================================= binary search
  {
    slug: 'binary-search',
    title: 'Binary Search',
    statement:
      'Return the index of a target in a sorted array of distinct integers, or -1 if absent.',
    constraints: '1 <= nums.length <= 10^4. Sorted ascending, all distinct. Must run in O(log n).',
    sourceUrl: 'https://leetcode.com/problems/binary-search/',
    patternSlug: 'binary-search',
    difficulty: 'easy',
    tell: 'Sortedness plus an explicit O(log n) requirement leaves exactly one option. The stated logarithm is the tell: nothing else about the input would let you discard half the remaining candidates per comparison.',
  },
  {
    slug: 'search-a-2d-matrix',
    title: 'Search a 2D Matrix',
    statement:
      'Search a matrix whose rows are sorted and where each row begins after the previous row ends.',
    constraints: 'm, n <= 100. -10^4 <= matrix[i][j] <= 10^4. Must run in O(log(m*n)).',
    sourceUrl: 'https://leetcode.com/problems/search-a-2d-matrix/',
    patternSlug: 'binary-search',
    difficulty: 'medium',
    tell: '"Each row starts after the previous ends" means the matrix is one sorted sequence that happens to be written in rows. Treat the index as a single 0..m*n-1 range and divide it out to coordinates — the 2D shape is presentation, not structure.',
  },
  {
    slug: 'find-minimum-in-rotated-sorted-array',
    title: 'Find Minimum in Rotated Sorted Array',
    statement:
      'Find the smallest element of a sorted array that has been rotated an unknown number of times.',
    constraints: 'n == nums.length. 1 <= n <= 5000. All values distinct. Must run in O(log n).',
    sourceUrl: 'https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/',
    patternSlug: 'binary-search',
    difficulty: 'medium',
    tell: 'Rotation breaks global sortedness but not the invariant that one half is always sorted. Comparing the midpoint to an endpoint tells you which half that is, and the minimum has to live in the other one — enough to halve the range without full order.',
  },
  {
    slug: 'median-of-two-sorted-arrays',
    title: 'Median of Two Sorted Arrays',
    statement: 'Find the median of two sorted arrays in logarithmic time.',
    constraints: 'm + n >= 1. m, n <= 1000. Must run in O(log(m+n)).',
    sourceUrl: 'https://leetcode.com/problems/median-of-two-sorted-arrays/',
    patternSlug: 'binary-search',
    difficulty: 'hard',
    tell: 'Merging is O(m+n), so the demanded logarithm rules it out. Instead binary search the *partition point*: how many elements to take from the first array. The correct split is the one where both left halves sit below both right halves.',
  },

  // ================================================================ stacks & queues
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    statement:
      'Decide whether a string of brackets is correctly opened and closed in the right order.',
    constraints: "1 <= s.length <= 10^4. Characters are only '()[]{}'.",
    sourceUrl: 'https://leetcode.com/problems/valid-parentheses/',
    patternSlug: 'stack-simulation',
    difficulty: 'easy',
    tell: 'Correct nesting means the most recently opened bracket must be the first to close — last in, first out, stated in the problem itself. That is the definition of a stack, so the structure is not a choice but a transcription.',
  },
  {
    slug: 'evaluate-reverse-polish-notation',
    title: 'Evaluate Reverse Polish Notation',
    statement: 'Evaluate an arithmetic expression given in postfix notation.',
    constraints:
      '1 <= tokens.length <= 10^4. Operators are +, -, *, /. Division truncates toward zero.',
    sourceUrl: 'https://leetcode.com/problems/evaluate-reverse-polish-notation/',
    patternSlug: 'stack-simulation',
    difficulty: 'medium',
    tell: 'Postfix exists precisely so no precedence or parenthesis handling is needed: an operator always applies to the two most recent results. Push operands, pop two on an operator, push the result.',
  },
  {
    slug: 'min-stack',
    title: 'Min Stack',
    statement:
      'Design a stack supporting push, pop, top and retrieving the minimum, all in constant time.',
    constraints: '-2^31 <= val <= 2^31 - 1. At most 3 * 10^4 calls. All operations must be O(1).',
    sourceUrl: 'https://leetcode.com/problems/min-stack/',
    patternSlug: 'stack-simulation',
    difficulty: 'medium',
    tell: 'The O(1) minimum is the constraint that shapes everything: you cannot scan on demand, so the minimum has to be stored alongside each entry. Every element remembers the minimum as of its own push, and popping restores the previous one for free.',
  },
  {
    slug: 'implement-queue-using-stacks',
    title: 'Implement Queue using Stacks',
    statement: 'Build a FIFO queue using only stack operations, with amortised O(1) per operation.',
    constraints: 'At most 100 calls. All operations amortised O(1).',
    sourceUrl: 'https://leetcode.com/problems/implement-queue-using-stacks/',
    patternSlug: 'queue-simulation',
    alsoAcceptedPatternSlugs: ['stack-simulation'],
    difficulty: 'easy',
    tell: 'Reversing a stack once turns LIFO into FIFO. Two stacks — one for arrivals, one for departures — and moving elements across only when the departure side empties gives each element exactly one transfer, which is where the amortised bound comes from.',
  },
  {
    slug: 'sliding-window-maximum',
    title: 'Sliding Window Maximum',
    statement:
      'Return the maximum of every contiguous window of size k as it slides across the array.',
    constraints: '1 <= nums.length <= 10^5. 1 <= k <= nums.length. -10^4 <= nums[i] <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/sliding-window-maximum/',
    patternSlug: 'monotonic-queue',
    alsoAcceptedPatternSlugs: ['heap', 'sliding-window'],
    difficulty: 'hard',
    tell: 'A window with a maximum, at n = 10^5, so recomputing per window is too slow. Once a larger value enters, every smaller value still in the window can never be the maximum again — so the candidates form a decreasing deque, and the front is always the answer.',
  },

  // ========================================================================= greedy
  {
    slug: 'jump-game',
    title: 'Jump Game',
    statement:
      'Each element gives the maximum jump length from that position; decide whether the last index is reachable.',
    constraints: '1 <= nums.length <= 10^4. 0 <= nums[i] <= 10^5.',
    sourceUrl: 'https://leetcode.com/problems/jump-game/',
    patternSlug: 'greedy',
    alsoAcceptedPatternSlugs: ['dp-1d'],
    difficulty: 'medium',
    tell: 'Reachability is a prefix property: if you can reach index i at all, every index up to the furthest reach is available. Tracking one number — the furthest index reachable so far — is enough, so the DP table collapses to a scalar.',
  },
  {
    slug: 'gas-station',
    title: 'Gas Station',
    statement:
      'Given gas available and cost to travel at each station on a circular route, find the starting station that allows a full loop.',
    constraints:
      'n == gas.length == cost.length. 1 <= n <= 10^5. The answer is unique if it exists.',
    sourceUrl: 'https://leetcode.com/problems/gas-station/',
    patternSlug: 'greedy',
    difficulty: 'medium',
    tell: 'The exchange argument is the tell: if the running tank goes negative somewhere between i and j, then no station in that span can be a valid start either, so the whole prefix is discardable at once. That is what turns the O(n^2) trial of every start into one pass.',
  },
  {
    slug: 'partition-labels',
    title: 'Partition Labels',
    statement:
      'Split a string into as many parts as possible so that each letter appears in at most one part.',
    constraints: '1 <= s.length <= 500. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/partition-labels/',
    patternSlug: 'greedy',
    alsoAcceptedPatternSlugs: ['interval-scheduling'],
    difficulty: 'medium',
    tell: 'Each letter defines an interval from its first to its last occurrence, and a valid part must contain every interval it touches. Closing a part at the earliest point where all opened intervals have ended is provably optimal — cutting later only merges parts.',
  },

  // =========================================================================== heaps
  {
    slug: 'kth-largest-element-in-an-array',
    title: 'Kth Largest Element in an Array',
    statement: 'Return the kth largest element in an unsorted array.',
    constraints: '1 <= k <= nums.length <= 10^5. -10^4 <= nums[i] <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/kth-largest-element-in-an-array/',
    patternSlug: 'heap',
    alsoAcceptedPatternSlugs: ['top-k', 'divide-and-conquer'],
    difficulty: 'medium',
    tell: 'You need only the kth value, not the sorted order, so paying O(n log n) sorts more than the question asks. A size-k heap keeps exactly the candidates that could still be the answer; quickselect goes further and averages linear time.',
  },
  {
    slug: 'top-k-frequent-elements',
    title: 'Top K Frequent Elements',
    statement: 'Return the k most frequently occurring elements of an array.',
    constraints:
      '1 <= nums.length <= 10^5. k is in the range [1, number of distinct elements]. Better than O(n log n) required.',
    sourceUrl: 'https://leetcode.com/problems/top-k-frequent-elements/',
    patternSlug: 'top-k',
    alsoAcceptedPatternSlugs: ['frequency-counting', 'heap'],
    difficulty: 'medium',
    tell: 'Two stages, each with its own tell: counting occurrences is a dictionary, and selecting the k biggest counts without a full sort is a bounded heap. The "better than O(n log n)" note is what rules out simply sorting the counts.',
  },
  {
    slug: 'find-median-from-data-stream',
    title: 'Find Median from Data Stream',
    statement:
      'Support adding numbers one at a time and querying the median of everything added so far.',
    constraints: '-10^5 <= num <= 10^5. At most 5 * 10^4 calls. Median queries are frequent.',
    sourceUrl: 'https://leetcode.com/problems/find-median-from-data-stream/',
    patternSlug: 'heap',
    difficulty: 'hard',
    tell: 'The median only needs the boundary between the smaller and larger halves, not a sorted array. Two heaps facing each other — a max-heap below, a min-heap above — keep that boundary at both tops, so insertion is logarithmic and the query is constant.',
  },
  {
    slug: 'merge-k-sorted-lists',
    title: 'Merge k Sorted Lists',
    statement: 'Merge k sorted linked lists into one sorted list.',
    constraints:
      'k == lists.length. 0 <= k <= 10^4. Total nodes up to 10^4. Each list is sorted ascending.',
    sourceUrl: 'https://leetcode.com/problems/merge-k-sorted-lists/',
    patternSlug: 'heap',
    alsoAcceptedPatternSlugs: ['divide-and-conquer'],
    difficulty: 'hard',
    tell: 'At every step the next output is the smallest among k list heads — a repeated minimum query over a changing set, which is exactly what a priority queue is for. Merging pairwise instead gives the same O(N log k) by a different route.',
  },

  // =========================================================================== trees
  {
    slug: 'maximum-depth-of-binary-tree',
    title: 'Maximum Depth of Binary Tree',
    statement: 'Return the number of nodes along the longest path from the root down to a leaf.',
    constraints: 'Number of nodes in [0, 10^4]. -100 <= Node.val <= 100.',
    sourceUrl: 'https://leetcode.com/problems/maximum-depth-of-binary-tree/',
    patternSlug: 'tree-dfs',
    alsoAcceptedPatternSlugs: ['tree-bfs'],
    difficulty: 'easy',
    tell: 'The depth of a node is one more than the deeper of its children — an answer defined purely in terms of subtree answers, which is the signature of a post-order recursion. Counting BFS levels arrives at the same number.',
  },
  {
    slug: 'binary-tree-level-order-traversal',
    title: 'Binary Tree Level Order Traversal',
    statement: 'Return the node values grouped by depth, top to bottom.',
    constraints: 'Number of nodes in [0, 2000]. -1000 <= Node.val <= 1000.',
    sourceUrl: 'https://leetcode.com/problems/binary-tree-level-order-traversal/',
    patternSlug: 'tree-bfs',
    difficulty: 'medium',
    tell: 'The output is grouped by depth, and depth is exactly what a queue-based sweep tracks for free. Processing the queue one full level at a time gives the grouping without storing a depth on each node.',
  },
  {
    slug: 'diameter-of-binary-tree',
    title: 'Diameter of Binary Tree',
    statement:
      'Return the length of the longest path between any two nodes, which need not pass through the root.',
    constraints: 'Number of nodes in [1, 10^4]. -100 <= Node.val <= 100.',
    sourceUrl: 'https://leetcode.com/problems/diameter-of-binary-tree/',
    patternSlug: 'tree-dfs',
    alsoAcceptedPatternSlugs: ['tree-dp'],
    difficulty: 'easy',
    tell: '"Need not pass through the root" is the tell. Every path has a highest node, so if each node reports its own height upward while separately recording the best path bending at it, one traversal covers every candidate.',
  },
  {
    slug: 'binary-tree-maximum-path-sum',
    title: 'Binary Tree Maximum Path Sum',
    statement: 'Find the maximum sum along any path between two nodes; values may be negative.',
    constraints: 'Number of nodes in [1, 3 * 10^4]. -1000 <= Node.val <= 1000.',
    sourceUrl: 'https://leetcode.com/problems/binary-tree-maximum-path-sum/',
    patternSlug: 'tree-dp',
    difficulty: 'hard',
    tell: 'Two different quantities have to be tracked at once: the best path that bends at this node (which cannot be extended upward) and the best straight path through it (which can). Negative values force clamping each child contribution at zero, and that split is what makes it DP rather than plain traversal.',
  },
  {
    slug: 'validate-binary-search-tree',
    title: 'Validate Binary Search Tree',
    statement: 'Decide whether a binary tree satisfies the binary search tree ordering property.',
    constraints: 'Number of nodes in [1, 10^4]. -2^31 <= Node.val <= 2^31 - 1.',
    sourceUrl: 'https://leetcode.com/problems/validate-binary-search-tree/',
    patternSlug: 'binary-search-tree',
    difficulty: 'medium',
    tell: 'The classic trap is checking only parent against child, which passes trees that are locally fine and globally wrong. The invariant is a range: every node inherits a bound from its ancestors — equivalently, the in-order walk must be strictly increasing.',
  },
  {
    slug: 'kth-smallest-element-in-a-bst',
    title: 'Kth Smallest Element in a BST',
    statement: 'Return the kth smallest value in a binary search tree.',
    constraints: 'Number of nodes in [1, 10^4]. 1 <= k <= n. 0 <= Node.val <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/kth-smallest-element-in-a-bst/',
    patternSlug: 'binary-search-tree',
    difficulty: 'medium',
    tell: 'A BST in-order traversal emits values in sorted order, so the kth one is simply the kth emitted. Nothing needs collecting or sorting — you stop as soon as the counter reaches k.',
  },
  {
    slug: 'lowest-common-ancestor-of-a-binary-tree',
    title: 'Lowest Common Ancestor of a Binary Tree',
    statement: 'Find the deepest node that has both given nodes as descendants.',
    constraints: 'Number of nodes in [2, 10^5]. All values unique. Both nodes exist in the tree.',
    sourceUrl: 'https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/',
    patternSlug: 'lowest-common-ancestor',
    alsoAcceptedPatternSlugs: ['tree-dfs'],
    difficulty: 'medium',
    tell: 'There is no ordering to exploit here, so the search cannot prune by value. Instead each node asks its subtrees "did you find either target?" — the node where the two answers arrive from different sides is the ancestor.',
  },

  // ========================================================================== graphs
  {
    slug: 'course-schedule',
    title: 'Course Schedule',
    statement:
      'Given courses and their prerequisite pairs, decide whether every course can be completed.',
    constraints: '1 <= numCourses <= 2000. 0 <= prerequisites.length <= 5000. Pairs are distinct.',
    sourceUrl: 'https://leetcode.com/problems/course-schedule/',
    patternSlug: 'topological-sort',
    alsoAcceptedPatternSlugs: ['kahns-algorithm', 'cycle-detection'],
    difficulty: 'medium',
    tell: 'Prerequisites are directed edges, and "can everything be finished" is asking whether the graph is acyclic. Peeling off courses with no outstanding prerequisites answers it: if anything is left over, the leftovers form a cycle.',
  },
  {
    slug: 'clone-graph',
    title: 'Clone Graph',
    statement: 'Return a deep copy of a connected undirected graph.',
    constraints:
      'Number of nodes in [0, 100]. The graph is connected and has no repeated edges or self-loops.',
    sourceUrl: 'https://leetcode.com/problems/clone-graph/',
    patternSlug: 'bfs-dfs',
    alsoAcceptedPatternSlugs: ['hashing'],
    difficulty: 'medium',
    tell: 'A plain traversal loops forever on a cyclic graph, so the real content is the visited map from original node to its copy — which doubles as both the cycle guard and the place the answer accumulates.',
  },
  {
    slug: 'network-delay-time',
    title: 'Network Delay Time',
    statement:
      'Given travel times along directed edges, find how long it takes a signal from one node to reach all nodes.',
    constraints: '1 <= n <= 100. 1 <= times.length <= 6000. 1 <= w <= 100, all weights positive.',
    sourceUrl: 'https://leetcode.com/problems/network-delay-time/',
    patternSlug: 'dijkstra',
    alsoAcceptedPatternSlugs: ['bellman-ford'],
    difficulty: 'medium',
    tell: 'Edges carry unequal positive weights, which is precisely where BFS stops working — fewest hops is no longer fastest. All weights being positive is the licence to settle the nearest unvisited node permanently, which is what makes the greedy step sound.',
  },
  {
    slug: 'cheapest-flights-within-k-stops',
    title: 'Cheapest Flights Within K Stops',
    statement: 'Find the cheapest route between two cities using at most k intermediate stops.',
    constraints: '1 <= n <= 100. 0 <= flights.length <= 5000. 0 <= k < n. 1 <= price <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/cheapest-flights-within-k-stops/',
    patternSlug: 'bellman-ford',
    alsoAcceptedPatternSlugs: ['dp-on-graphs', 'dijkstra'],
    difficulty: 'medium',
    tell: 'The hop limit is the tell. Plain Dijkstra settles a node by cost alone and can discard a pricier route that uses fewer stops, so cost is no longer a sufficient state. Relaxing all edges exactly k+1 times bounds the hops by construction.',
  },
  {
    slug: 'redundant-connection',
    title: 'Redundant Connection',
    statement:
      'Given a tree plus one extra edge, return the edge that can be removed to restore a tree.',
    constraints:
      'n == edges.length. 3 <= n <= 1000. The graph is connected with exactly one cycle.',
    sourceUrl: 'https://leetcode.com/problems/redundant-connection/',
    patternSlug: 'union-find',
    alsoAcceptedPatternSlugs: ['cycle-detection', 'bfs-dfs'],
    difficulty: 'medium',
    tell: 'Edges arrive one at a time and the question is when two endpoints first become already-connected. Incremental connectivity like that is what disjoint-set union exists for — the first edge joining two nodes already in the same component closes the cycle.',
  },
  {
    slug: 'word-ladder',
    title: 'Word Ladder',
    statement:
      'Find the length of the shortest transformation sequence between two words, changing one letter at a time through a given dictionary.',
    constraints:
      '1 <= wordList.length <= 5000. All words have the same length, up to 10. Lowercase letters.',
    sourceUrl: 'https://leetcode.com/problems/word-ladder/',
    patternSlug: 'bfs-dfs',
    difficulty: 'hard',
    tell: 'The graph is implicit — words are nodes and a single-letter change is an edge — and every edge costs one step. Shortest path on unit edges is BFS; the only real work is generating neighbours cheaply via wildcard patterns rather than comparing all pairs.',
  },
  {
    slug: 'is-graph-bipartite',
    title: 'Is Graph Bipartite?',
    statement:
      'Decide whether the nodes of an undirected graph can be split into two sets with no edge inside a set.',
    constraints: '1 <= graph.length <= 100. The graph may be disconnected and has no self-loops.',
    sourceUrl: 'https://leetcode.com/problems/is-graph-bipartite/',
    patternSlug: 'bipartite-graph',
    alsoAcceptedPatternSlugs: ['bfs-dfs', 'graph-coloring'],
    difficulty: 'medium',
    tell: 'Splitting into two conflict-free sets is two-colouring restated. Traverse and colour each neighbour the opposite of the current node; a neighbour already carrying the same colour proves an odd cycle, and disconnection means every component must be started separately.',
  },

  // ============================================================== dynamic programming
  {
    slug: 'climbing-stairs',
    title: 'Climbing Stairs',
    statement: 'Count the distinct ways to climb n stairs taking one or two steps at a time.',
    constraints: '1 <= n <= 45.',
    sourceUrl: 'https://leetcode.com/problems/climbing-stairs/',
    patternSlug: 'dp-1d',
    alsoAcceptedPatternSlugs: ['memoization'],
    difficulty: 'easy',
    tell: 'Every way to reach step n arrives from n-1 or n-2 and those sets are disjoint, so the count is their sum. One state per step and a constant number of predecessors is the smallest possible DP — Fibonacci in disguise.',
  },
  {
    slug: 'house-robber',
    title: 'House Robber',
    statement:
      'Maximise the total taken from a row of houses without taking from two adjacent ones.',
    constraints: '1 <= nums.length <= 100. 0 <= nums[i] <= 400.',
    sourceUrl: 'https://leetcode.com/problems/house-robber/',
    patternSlug: 'dp-1d',
    alsoAcceptedPatternSlugs: ['state-machine-dp'],
    difficulty: 'medium',
    tell: 'The adjacency ban means the decision at house i depends only on whether i-1 was taken, not on anything earlier. That one-step memory is the state, and it collapses to two running numbers rather than a table.',
  },
  {
    slug: 'longest-increasing-subsequence',
    title: 'Longest Increasing Subsequence',
    statement: 'Return the length of the longest strictly increasing subsequence.',
    constraints:
      '1 <= nums.length <= 2500. -10^4 <= nums[i] <= 10^4. An O(n log n) solution exists.',
    sourceUrl: 'https://leetcode.com/problems/longest-increasing-subsequence/',
    patternSlug: 'dp-lis',
    alsoAcceptedPatternSlugs: ['binary-search'],
    difficulty: 'medium',
    tell: 'Subsequence, not subarray, so no window applies. The quadratic DP asks "best ending at i", and the hint that O(n log n) exists points at the patience-sorting refinement where a binary search places each value onto the tails array.',
  },
  {
    slug: 'unique-paths',
    title: 'Unique Paths',
    statement:
      'Count the paths from the top-left to the bottom-right of an m x n grid, moving only right or down.',
    constraints: '1 <= m, n <= 100. The answer is guaranteed to fit in a 32-bit integer.',
    sourceUrl: 'https://leetcode.com/problems/unique-paths/',
    patternSlug: 'dp-2d',
    alsoAcceptedPatternSlugs: ['combinatorics'],
    difficulty: 'medium',
    tell: 'Each cell is reachable only from above or from the left, so its count is the sum of those two — a table indexed by the two grid dimensions. It also has a closed form as a single binomial coefficient, since every path is a fixed multiset of moves.',
  },
  {
    slug: 'edit-distance',
    title: 'Edit Distance',
    statement:
      'Find the minimum number of insertions, deletions and substitutions to turn one word into another.',
    constraints: '0 <= word1.length, word2.length <= 500. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/edit-distance/',
    patternSlug: 'dp-2d',
    difficulty: 'medium',
    tell: 'Two sequences being aligned, with three local moves at each step, is the canonical two-dimensional table: one axis per string, and each cell built from its three neighbours. The 500 bound makes the 250,000-cell table trivially affordable.',
  },
  {
    slug: 'best-time-to-buy-and-sell-stock-with-cooldown',
    title: 'Best Time to Buy and Sell Stock with Cooldown',
    statement:
      'Maximise profit from unlimited transactions, given that you must wait one day after selling before buying again.',
    constraints: '1 <= prices.length <= 5000. 0 <= prices[i] <= 1000.',
    sourceUrl: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/',
    patternSlug: 'state-machine-dp',
    difficulty: 'medium',
    tell: 'The cooldown means the day index alone does not determine what you may do — you also need to know whether you are holding, free, or resting. Three modes with fixed legal transitions between them is a state machine, and the DP runs one array per mode.',
  },
  {
    slug: 'burst-balloons',
    title: 'Burst Balloons',
    statement:
      'Burst all balloons to maximise the sum of products of each balloon with its current neighbours.',
    constraints: 'n == nums.length. 1 <= n <= 300. 0 <= nums[i] <= 100.',
    sourceUrl: 'https://leetcode.com/problems/burst-balloons/',
    patternSlug: 'dp-interval',
    difficulty: 'hard',
    tell: 'Thinking about which balloon to burst first fails, because bursting changes the neighbours of everything. Reversing it — deciding which balloon in a range bursts *last* — makes the two sides independent, and n = 300 is exactly the bound where an O(n^3) interval DP fits.',
  },

  // ====================================================================== recursion
  {
    slug: 'subsets',
    title: 'Subsets',
    statement: 'Return every possible subset of an array of distinct integers.',
    constraints: '1 <= nums.length <= 10. -10 <= nums[i] <= 10. All values unique.',
    sourceUrl: 'https://leetcode.com/problems/subsets/',
    patternSlug: 'backtracking',
    alsoAcceptedPatternSlugs: ['bitmask'],
    difficulty: 'medium',
    tell: 'n <= 10 is the entire tell: 2^10 is a thousand, so the output itself is the work and no cleverness is needed. Each element is independently in or out, which is either a binary recursion or a loop over 2^n bitmasks.',
  },
  {
    slug: 'permutations',
    title: 'Permutations',
    statement: 'Return every ordering of an array of distinct integers.',
    constraints: '1 <= nums.length <= 6. -10 <= nums[i] <= 10. All values unique.',
    sourceUrl: 'https://leetcode.com/problems/permutations/',
    patternSlug: 'backtracking',
    difficulty: 'medium',
    tell: 'A bound of 6 means 720 outputs — the constraint is sized so that factorial growth is acceptable, which only happens when full enumeration is the intended answer. Choose an unused element, recurse, then undo the choice.',
  },
  {
    slug: 'combination-sum',
    title: 'Combination Sum',
    statement:
      'Find all unique combinations of candidates that sum to a target, reusing candidates freely.',
    constraints: '1 <= candidates.length <= 30. All candidates distinct. 1 <= target <= 40.',
    sourceUrl: 'https://leetcode.com/problems/combination-sum/',
    patternSlug: 'backtracking',
    alsoAcceptedPatternSlugs: ['dp-knapsack'],
    difficulty: 'medium',
    tell: 'The question asks for the combinations themselves, not how many, so a counting DP would not produce the answer. Small bounds plus a running remainder that prunes as soon as it goes negative make depth-first enumeration the fit.',
  },
  {
    slug: 'n-queens',
    title: 'N-Queens',
    statement:
      'Place n queens on an n x n board so that none attack another, and return every arrangement.',
    constraints: '1 <= n <= 9.',
    sourceUrl: 'https://leetcode.com/problems/n-queens/',
    patternSlug: 'backtracking',
    difficulty: 'hard',
    tell: 'n <= 9 signals exhaustive search, and the structure supplies the pruning: one queen per row by construction, with occupied columns and both diagonal directions tracked as sets so a conflict is detected before recursing rather than after.',
  },
  {
    slug: 'powx-n',
    title: 'Pow(x, n)',
    statement:
      'Compute x raised to the power n, where n may be negative and as large as a 32-bit integer allows.',
    constraints: '-100 < x < 100. -2^31 <= n <= 2^31 - 1.',
    sourceUrl: 'https://leetcode.com/problems/powx-n/',
    patternSlug: 'fast-exponentiation',
    alsoAcceptedPatternSlugs: ['divide-and-conquer'],
    difficulty: 'medium',
    tell: 'n reaching 2^31 rules out multiplying n times. Halving the exponent and squaring the result gets there in about 31 steps; the negative range is the edge case, and negating n directly overflows at the minimum value.',
  },

  // ================================================================ bit manipulation
  {
    slug: 'single-number',
    title: 'Single Number',
    statement: 'Every element appears twice except one; find it in linear time and constant space.',
    constraints:
      '1 <= nums.length <= 3 * 10^4. Exactly one element appears once. O(n) time, O(1) space.',
    sourceUrl: 'https://leetcode.com/problems/single-number/',
    patternSlug: 'xor-tricks',
    difficulty: 'easy',
    tell: 'Constant space is what forbids the obvious hash set. XOR is its own inverse and order-independent, so every pair annihilates and the survivor is the answer — the pairing structure in the statement is what makes that work.',
  },
  {
    slug: 'counting-bits',
    title: 'Counting Bits',
    statement: 'For every number from 0 to n, count how many bits are set.',
    constraints: '0 <= n <= 10^5. A single-pass O(n) solution is expected.',
    sourceUrl: 'https://leetcode.com/problems/counting-bits/',
    patternSlug: 'bitmask',
    alsoAcceptedPatternSlugs: ['dp-1d'],
    difficulty: 'easy',
    tell: 'Counting each number independently costs O(n log n). The recurrence is the tell: dropping the lowest set bit of i lands on a smaller number already computed, so each answer is one plus an earlier entry.',
  },
  {
    slug: 'maximum-xor-of-two-numbers-in-an-array',
    title: 'Maximum XOR of Two Numbers in an Array',
    statement: 'Find the largest XOR obtainable from any two elements of an array.',
    constraints: '1 <= nums.length <= 2 * 10^5. 0 <= nums[i] <= 2^31 - 1.',
    sourceUrl: 'https://leetcode.com/problems/maximum-xor-of-two-numbers-in-an-array/',
    patternSlug: 'xor-tricks',
    alsoAcceptedPatternSlugs: ['trie'],
    difficulty: 'medium',
    tell: 'n = 2*10^5 makes the pairwise scan impossible, but each value has only 31 bits. Greedily maximising from the highest bit down, with the numbers stored in a binary trie so you can always try to walk the opposite branch, turns it into O(31n).',
  },

  // ==================================================================== linked lists
  {
    slug: 'reverse-linked-list',
    title: 'Reverse Linked List',
    statement: 'Reverse a singly linked list and return the new head.',
    constraints: 'Number of nodes in [0, 5000]. -5000 <= Node.val <= 5000.',
    sourceUrl: 'https://leetcode.com/problems/reverse-linked-list/',
    patternSlug: 'linked-list-reversal',
    difficulty: 'easy',
    tell: 'Nothing is being searched or compared — the work is purely re-pointing each next reference backwards while holding on to the node ahead so the list is not lost. Three pointers and one pass, no extra space.',
  },
  {
    slug: 'linked-list-cycle',
    title: 'Linked List Cycle',
    statement: 'Determine whether a linked list contains a cycle, using constant extra space.',
    constraints: 'Number of nodes in [0, 10^4]. O(1) memory required.',
    sourceUrl: 'https://leetcode.com/problems/linked-list-cycle/',
    patternSlug: 'fast-slow-pointers',
    alsoAcceptedPatternSlugs: ['cycle-detection'],
    difficulty: 'easy',
    tell: 'The O(1) memory requirement rules out remembering visited nodes. Two pointers at different speeds must eventually meet inside any cycle, because the gap between them changes by one each step — that is the only cycle test that needs no storage.',
  },
  {
    slug: 'remove-nth-node-from-end-of-list',
    title: 'Remove Nth Node From End of List',
    statement: 'Remove the nth node counting from the end of a singly linked list, in one pass.',
    constraints: 'Number of nodes is sz. 1 <= sz <= 30. 1 <= n <= sz. One pass required.',
    sourceUrl: 'https://leetcode.com/problems/remove-nth-node-from-end-of-list/',
    patternSlug: 'dummy-node',
    alsoAcceptedPatternSlugs: ['two-pointers'],
    difficulty: 'medium',
    tell: 'Two ideas meet here. A gap of n between two pointers converts "from the end" into "when the leading one falls off", giving the single pass; and a sentinel before the head removes the special case where the node being deleted is the head itself.',
  },
  {
    slug: 'reorder-list',
    title: 'Reorder List',
    statement: 'Reorder a list so it alternates between the first and last remaining nodes.',
    constraints:
      'Number of nodes in [1, 5 * 10^4]. 1 <= Node.val <= 1000. Values may not be changed.',
    sourceUrl: 'https://leetcode.com/problems/reorder-list/',
    patternSlug: 'linked-list-reversal',
    alsoAcceptedPatternSlugs: ['fast-slow-pointers'],
    difficulty: 'medium',
    tell: 'Being forbidden from changing values means the nodes must be relinked, and a singly linked list cannot walk backwards. The composition is the answer: find the midpoint with two speeds, reverse the second half, then weave the two halves together.',
  },

  // =============================================================== advanced strings
  {
    slug: 'implement-trie-prefix-tree',
    title: 'Implement Trie (Prefix Tree)',
    statement:
      'Build a data structure supporting insert, exact search and prefix search over words.',
    constraints:
      '1 <= word.length, prefix.length <= 2000. Lowercase English letters. Up to 3 * 10^4 calls.',
    sourceUrl: 'https://leetcode.com/problems/implement-trie-prefix-tree/',
    patternSlug: 'trie',
    difficulty: 'medium',
    tell: 'Prefix search is what a hash set cannot do — hashing destroys the shared structure the query depends on. A tree branching on one character per level makes a prefix a walk from the root, costing the length of the query and nothing more.',
  },
  {
    slug: 'design-add-and-search-words-data-structure',
    title: 'Design Add and Search Words Data Structure',
    statement:
      "Support adding words and searching them, where '.' in a query matches any single character.",
    constraints: '1 <= word.length <= 25. Up to 10^4 calls. At most 3 dots in a search word.',
    sourceUrl: 'https://leetcode.com/problems/design-add-and-search-words-data-structure/',
    patternSlug: 'trie',
    alsoAcceptedPatternSlugs: ['backtracking'],
    difficulty: 'medium',
    tell: 'The wildcard is the twist: at a dot the search must branch into every child rather than one. The cap of three dots is what keeps that branching affordable, and it turns a plain trie walk into a small depth-first search over the trie.',
  },
  {
    slug: 'word-search-ii',
    title: 'Word Search II',
    statement:
      'Find every word from a dictionary that can be spelled by walking adjacent cells of a grid without reuse.',
    constraints: 'm, n <= 12. 1 <= words.length <= 3 * 10^4. Word length up to 10.',
    sourceUrl: 'https://leetcode.com/problems/word-search-ii/',
    patternSlug: 'trie',
    alsoAcceptedPatternSlugs: ['backtracking'],
    difficulty: 'hard',
    tell: "Searching the grid once per word is 30,000 traversals. Putting the dictionary into a trie inverts it: one traversal carries all words at once and abandons a branch the moment the path stops being any word's prefix.",
  },
  {
    slug: 'find-the-index-of-the-first-occurrence-in-a-string',
    title: 'Find the Index of the First Occurrence in a String',
    statement: 'Return the index of the first occurrence of one string inside another, or -1.',
    constraints: '1 <= haystack.length, needle.length <= 10^4. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/find-the-index-of-the-first-occurrence-in-a-string/',
    patternSlug: 'kmp',
    alsoAcceptedPatternSlugs: ['rabin-karp'],
    difficulty: 'easy',
    tell: 'The naive scan restarts the pattern after every mismatch and re-reads characters it has already matched. Precomputing how far the pattern can shift without losing a partial match — the prefix function — removes that backtracking and makes it linear.',
  },
  {
    slug: 'repeated-substring-pattern',
    title: 'Repeated Substring Pattern',
    statement: 'Decide whether a string can be built by repeating one of its substrings.',
    constraints: '1 <= s.length <= 10^4. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/repeated-substring-pattern/',
    patternSlug: 'kmp',
    alsoAcceptedPatternSlugs: ['z-algorithm'],
    difficulty: 'easy',
    tell: 'Periodicity is exactly what the prefix function measures: the string repeats iff its longest proper border leaves a remainder that divides the length. The neat alternative is searching for s inside s+s with the first and last characters removed.',
  },
  {
    slug: 'longest-palindromic-substring',
    title: 'Longest Palindromic Substring',
    statement: 'Return the longest substring that reads the same forwards and backwards.',
    constraints: '1 <= s.length <= 1000. Letters and digits.',
    sourceUrl: 'https://leetcode.com/problems/longest-palindromic-substring/',
    patternSlug: 'manacher',
    alsoAcceptedPatternSlugs: ['dp-interval'],
    difficulty: 'medium',
    tell: 'Every palindrome has a centre, and there are only 2n-1 of them, so expanding outward from each is O(n^2) — comfortable at n = 1000. Reusing the radii already computed on the mirrored side is what pushes it to linear.',
  },
  {
    slug: 'shortest-palindrome',
    title: 'Shortest Palindrome',
    statement:
      'Find the shortest palindrome obtainable by adding characters only to the front of a string.',
    constraints: '0 <= s.length <= 5 * 10^4. Lowercase English letters.',
    sourceUrl: 'https://leetcode.com/problems/shortest-palindrome/',
    patternSlug: 'kmp',
    alsoAcceptedPatternSlugs: ['rolling-hash', 'manacher'],
    difficulty: 'hard',
    tell: 'Only the front may grow, so the task reduces to finding the longest palindromic *prefix*. Concatenating the string with its reverse and taking the prefix function of the join computes exactly that overlap in linear time.',
  },

  // ======================================================================= intervals
  {
    slug: 'merge-intervals',
    title: 'Merge Intervals',
    statement:
      'Merge all overlapping intervals and return the non-overlapping set that covers the same span.',
    constraints: '1 <= intervals.length <= 10^4. 0 <= start <= end <= 10^4.',
    sourceUrl: 'https://leetcode.com/problems/merge-intervals/',
    patternSlug: 'merge-intervals',
    alsoAcceptedPatternSlugs: ['line-sweep'],
    difficulty: 'medium',
    tell: 'The input is unsorted, and that is the only obstacle: once ordered by start, an interval can only ever overlap the one currently open, so a single pass with one running interval suffices.',
  },
  {
    slug: 'non-overlapping-intervals',
    title: 'Non-overlapping Intervals',
    statement: 'Find the minimum number of intervals to remove so that the rest do not overlap.',
    constraints: '1 <= intervals.length <= 10^5. -5 * 10^4 <= start < end <= 5 * 10^4.',
    sourceUrl: 'https://leetcode.com/problems/non-overlapping-intervals/',
    patternSlug: 'interval-scheduling',
    alsoAcceptedPatternSlugs: ['greedy'],
    difficulty: 'medium',
    tell: 'Removing fewest is keeping most, which is the activity-selection problem. Sorting by *end* is the crux: always keeping the interval that finishes earliest leaves the most room for everything after it, and the exchange argument proves nothing is lost.',
  },
  {
    slug: 'insert-interval',
    title: 'Insert Interval',
    statement:
      'Insert a new interval into a sorted, non-overlapping list and merge where necessary.',
    constraints:
      '0 <= intervals.length <= 10^4. Intervals are already sorted by start and do not overlap.',
    sourceUrl: 'https://leetcode.com/problems/insert-interval/',
    patternSlug: 'merge-intervals',
    difficulty: 'medium',
    tell: 'The list arriving already sorted is what makes this linear rather than a re-sort. The three regions — entirely before, overlapping, entirely after — can each be handled in one sweep, with the overlapping run collapsing into a single widened interval.',
  },

  // ===================================================================== mathematics
  {
    slug: 'count-primes',
    title: 'Count Primes',
    statement: 'Count the prime numbers strictly less than n.',
    constraints: '0 <= n <= 5 * 10^6.',
    sourceUrl: 'https://leetcode.com/problems/count-primes/',
    patternSlug: 'sieve-of-eratosthenes',
    difficulty: 'medium',
    tell: 'n reaches 5 million, so testing each number for primality separately is far too slow even at O(sqrt n) each. Marking multiples instead does the whole range at once, and starting each prime at its square avoids redoing work already covered.',
  },
];
