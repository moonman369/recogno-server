/**
 * Response shapes, for documentation only.
 *
 * The serializer compiler in `app.ts` is a passthrough, so nothing here is
 * enforced at runtime — these describe what the handlers actually return. Dates
 * are declared as ISO strings because that is what they become on the wire.
 */

import { z } from 'zod';

export const errorResponseSchema = z
  .object({ error: z.string() })
  .meta({ description: 'Something the caller asked for does not exist or is malformed.' });

export const healthResponseSchema = z.object({
  ok: z.boolean().meta({ description: 'True when every dependency answered.' }),
  db: z.boolean().meta({ description: 'Result of a `SELECT 1` against Postgres.' }),
});

export const patternOptionSchema = z.object({
  id: z.int(),
  slug: z.string().meta({ example: 'sliding-window' }),
  name: z.string().meta({ example: 'Sliding Window' }),
  category: z.string().meta({
    description: 'Study grouping. Group the picker by this — there are ~80 patterns.',
    example: 'Two Pointers',
  }),
});

/** Exactly what a learner may see before guessing — no pattern, no tell. */
export const blindProblemSchema = z.object({
  id: z.int(),
  slug: z.string(),
  title: z.string(),
  statement: z.string().nullable(),
  constraints: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
});

/** Shared by every drill route that can be scoped to one deck. */
export const deckScopedQuerystringSchema = z.object({
  deckId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .meta({
      description:
        'Scope to one deck (system or the caller’s own). Omit to search across every ' +
        'deck visible to the caller, as before.',
    }),
});

export type DeckScopedQuerystring = z.infer<typeof deckScopedQuerystringSchema>;

export const nextResponseSchema = z.object({
  problem: blindProblemSchema,
  source: z.enum(['due', 'unseen', 'review-ahead']).meta({
    description:
      'Which branch supplied this problem: a card that is due, a problem never seen, ' +
      'or the soonest-due card when nothing is due yet.',
  }),
  dueAt: z.iso
    .datetime()
    .nullable()
    .meta({ description: 'When the card fell due. Null if this problem is new to the user.' }),
  patternOptions: z
    .array(patternOptionSchema)
    .meta({ description: 'The full taxonomy to choose from. Reveals nothing about the answer.' }),
});

/** Upper bound on guesses, so "select everything" is not a strategy. */
export const MAX_GUESSED_PATTERNS = 5;

export const submitBodySchema = z
  .object({
    problemId: z.int().positive(),
    guessedPatternIds: z
      .array(z.int().positive())
      .min(1)
      .max(MAX_GUESSED_PATTERNS)
      .optional()
      .meta({
        description:
          'One or more `id` values from `patternOptions`. Use this when a problem is a fair ' +
          'read as more than one pattern.',
      }),
    guessedPatternSlugs: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_GUESSED_PATTERNS)
      .optional()
      .meta({ description: 'One or more `slug` values from `patternOptions`, instead of ids.' }),
    guessedPatternId: z.int().positive().optional().meta({
      description: 'Single-guess shorthand, kept for existing clients.',
    }),
    rationaleText: z
      .string()
      .trim()
      .min(1, 'rationaleText is required')
      .max(4000)
      .meta({ description: 'Why the learner thinks it is that pattern. Graded by Gemini.' }),
    timeTakenSeconds: z
      .number()
      .min(0)
      .max(60 * 60)
      .meta({
        description: 'Seconds from seeing the problem to guessing. Drives the speed score.',
      }),
  })
  .refine(
    (body) =>
      (body.guessedPatternIds?.length ?? 0) > 0 ||
      (body.guessedPatternSlugs?.length ?? 0) > 0 ||
      body.guessedPatternId !== undefined,
    {
      error: 'Provide guessedPatternIds, guessedPatternSlugs, or guessedPatternId',
      path: ['guessedPatternIds'],
    },
  );

export type SubmitBody = z.infer<typeof submitBodySchema>;

const scoresSchema = z.object({
  correctness: z.number().meta({ description: '1 exact, 0.5 close family, 0 otherwise.' }),
  speed: z.number().meta({ description: 'Linear from 1.0 at 0s to 0.0 at 90s.' }),
  rationale: z.number().meta({ description: '1 yes, 0.5 partial, 0 no.' }),
  composite: z.number().meta({ description: 'Weighted average: 0.5 / 0.2 / 0.3.' }),
});

export const submitResponseSchema = z.object({
  attemptId: z.string().nullish(),
  correct: z
    .boolean()
    .meta({ description: 'True when any guess exactly matched any accepted pattern.' }),
  guessedPattern: patternOptionSchema.meta({
    description: 'The first guess. See `guessedPatterns` for all of them.',
  }),
  guessedPatterns: z.array(patternOptionSchema).meta({
    description: 'Every pattern the learner named, in the order given.',
  }),
  actualPattern: patternOptionSchema
    .extend({ description: z.string() })
    .meta({ description: 'The canonical pattern; the one the tell explains.' }),
  acceptedPatterns: z.array(patternOptionSchema).meta({
    description:
      'Every pattern that counts as correct for this problem, including the canonical one. ' +
      'Naming any single one of these is full credit.',
  }),
  tell: z
    .string()
    .nullable()
    .meta({ description: 'The pre-written "why this pattern" explanation. Null if none exists.' }),
  explanation: z.string().meta({ description: 'Plain-language summary of the grade.' }),
  scores: scoresSchema,
  rationale: z.object({
    verdict: z.enum(['yes', 'partial', 'no']),
    judged: z.boolean().meta({
      description: 'False when Gemini was unreachable and the rationale scored neutrally.',
    }),
  }),
  review: z.object({
    rating: z.enum(['Again', 'Hard', 'Good', 'Easy']).meta({
      description: 'The FSRS grade the composite mapped onto.',
    }),
    previousDueAt: z.iso.datetime().nullable(),
    dueAt: z.iso.datetime().meta({ description: 'When this problem comes back around.' }),
    scheduledDays: z.number(),
    state: z.int().meta({ description: '0 New, 1 Learning, 2 Review, 3 Relearning.' }),
    reps: z.int(),
    lapses: z.int(),
    stability: z.number(),
    difficulty: z.number(),
  }),
});

export const dueCountResponseSchema = z.object({
  dueCount: z.int().meta({ description: 'Cards due now — the "X reps due today" badge.' }),
  nextDueAt: z.iso
    .datetime()
    .nullable()
    .meta({ description: 'When the soonest card falls due. Null if the user has no cards.' }),
});
