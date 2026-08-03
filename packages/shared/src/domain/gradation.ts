/**
 * The five user-facing gradations an AI evaluation (or a manual override) can
 * land on, and how they reach the scheduler.
 *
 * FSRS only has four grades, so five tiers must collapse somewhere. They
 * collapse at the bottom: `try-again` and `needs-work` both mean the learner did
 * not actually solve it, and FSRS treats `Again` specially (it lapses the card).
 * Collapsing two *passing* tiers instead would throw away the interval nuance
 * that Hard/Good/Easy exist to express.
 *
 * Rather than hard-coding a second set of thresholds, each tier carries a
 * nominal composite score that is fed through the same bands the drill flow uses
 * (`toFsrsRating` in the api package). Both flows therefore share one
 * grade-to-schedule bridge, and retuning the bands moves them together.
 */

export const GRADATIONS = ['try-again', 'needs-work', 'not-bad', 'good-job', 'excellent'] as const;

export type Gradation = (typeof GRADATIONS)[number];

export const GRADATION_LABELS: Record<Gradation, string> = {
  'try-again': 'Try Again',
  'needs-work': 'Needs Work',
  'not-bad': 'Not Bad',
  'good-job': 'Good Job',
  excellent: 'Excellent',
};

/** What each tier means, sent to the model so its grading is calibrated. */
export const GRADATION_CRITERIA: Record<Gradation, string> = {
  'try-again':
    'The approach is absent, fundamentally wrong, or solves a different problem. Nothing here would pass.',
  'needs-work':
    'The right general area, but the core idea is missing or broken — wrong complexity class, or a flaw that sinks the solution.',
  'not-bad':
    'A working idea with real gaps: unhandled edge cases, notably suboptimal complexity, or reasoning the learner clearly had to grope towards.',
  'good-job':
    'A correct, reasonably efficient solution with sound reasoning. Minor polish available, nothing substantive missing.',
  excellent:
    'Correct, optimal or near-optimal, cleanly reasoned, with edge cases and trade-offs accounted for.',
};

/**
 * Nominal composite per tier, positioned inside the drill's existing bands
 * (Easy >= 0.8, Good >= 0.55, Hard >= 0.3, else Again).
 */
export const GRADATION_SCORES: Record<Gradation, number> = {
  'try-again': 0,
  'needs-work': 0.2,
  'not-bad': 0.45,
  'good-job': 0.7,
  excellent: 0.95,
};

export function isGradation(value: string): value is Gradation {
  return (GRADATIONS as readonly string[]).includes(value);
}

/**
 * Pulls a gradation out of a model response that may be JSON, quoted, spaced or
 * title-cased. Returns undefined rather than guessing.
 */
export function parseGradation(raw: string): Gradation | undefined {
  const normalised = raw.toLowerCase().replace(/[\s_]+/g, '-');
  // Longest first, so "try-again" is not shadowed by a shorter partial match.
  const candidates = [...GRADATIONS].sort((a, b) => b.length - a.length);
  return candidates.find((gradation) => normalised.includes(gradation));
}
