/**
 * Request and response shapes for decks, submissions and the unified review
 * queue. Documentation-only on the response side, like `schemas.ts`.
 */

import { GRADATIONS } from '@recogno/shared';
import { z } from 'zod';

export const gradationSchema = z.enum(GRADATIONS);

export const deckSchema = z.object({
  id: z.int(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z
    .boolean()
    .meta({ description: 'System decks hold the curated bank and are read-only.' }),
  problemCount: z.int(),
});

export const deckListResponseSchema = z.object({
  decks: z.array(deckSchema),
});

export const createDeckBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

export const problemSummarySchema = z.object({
  id: z.int(),
  slug: z.string(),
  title: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
  source: z.enum(['curated', 'link', 'slug', 'text']),
  sourceUrl: z.string().nullable(),
  mode: z.enum(['drill', 'note']).meta({
    description: 'Which review flow this problem uses. Decided by whether it has a pattern + tell.',
  }),
  dueAt: z.iso.datetime().nullable(),
  imported: z.boolean().meta({
    description:
      'True when this problem was imported from another deck rather than created here. ' +
      'Only imported problems can be removed from a deck.',
  }),
});

/** Cap on one import call — enough to take a whole curated deck, short of a denial of service. */
export const MAX_IMPORT_PROBLEMS = 500;

export const importProblemsBodySchema = z.object({
  problemIds: z
    .array(z.int().positive())
    .min(1, 'Select at least one problem')
    .max(MAX_IMPORT_PROBLEMS)
    .meta({
      description:
        'Problem ids from any deck the caller can see — a system deck, or one of their own.',
    }),
});

export const importProblemsResponseSchema = z.object({
  imported: z.int().meta({ description: 'Problems newly added to the deck.' }),
  skipped: z.int().meta({
    description: 'Ids that were already in the deck. Re-importing is a no-op, not an error.',
  }),
  problemCount: z.int().meta({ description: 'Total problems in the deck after the import.' }),
});

export const deckDetailResponseSchema = deckSchema.extend({
  problems: z.array(problemSummarySchema),
});

const noteFields = {
  noteText: z
    .string()
    .trim()
    .min(1, 'noteText is required')
    .max(20_000)
    .meta({ description: 'The approach taken and any issues faced.' }),
  solutionText: z
    .string()
    .trim()
    .min(1, 'solutionText is required')
    .max(50_000)
    .meta({ description: 'Code, pseudocode or prose. Stored opaquely and never parsed.' }),
};

export const addProblemBodySchema = z.object({
  input: z
    .string()
    .trim()
    .min(1, 'input is required')
    .max(20_000)
    .meta({ description: 'A problem link, a slug, or a free-text description.' }),
  source: z.enum(['link', 'slug', 'text']).optional().meta({
    description: 'Force the interpretation of `input`. Auto-detected when omitted.',
  }),
  title: z.string().trim().min(1).max(200).optional().meta({
    description: 'Overrides the title derived from the input.',
  }),
  ...noteFields,
});

export const createSubmissionBodySchema = z.object(noteFields);

export const stageSchema = z.object({
  stage: z.enum(['resolve-source', 'evaluate']),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  position: z.int(),
  detail: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const submissionStatusSchema = z.enum([
  'queued',
  'resolving-source',
  'evaluating',
  'awaiting-review',
  'committed',
  'failed',
]);

export const submissionResponseSchema = z.object({
  id: z.string(),
  problemId: z.int(),
  problemTitle: z.string(),
  status: submissionStatusSchema,
  failureReason: z.string().nullable(),
  noteText: z.string(),
  solutionText: z.string(),
  stages: z.array(stageSchema).meta({
    description: 'Only steps that genuinely run for this submission, in display order.',
  }),
  evaluation: z
    .object({
      gradation: gradationSchema,
      label: z.string(),
      approachSummary: z.string(),
      missed: z.string(),
      optimizations: z.string(),
      model: z.string().nullable(),
    })
    .nullable()
    .meta({ description: 'Null until the evaluate stage completes.' }),
  finalGradation: gradationSchema.nullable(),
  overridden: z.boolean(),
  committedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const addProblemResponseSchema = z.object({
  problemId: z.int(),
  submission: submissionResponseSchema,
});

export const commitBodySchema = z.object({
  gradation: gradationSchema.optional().meta({
    description: "Overrides the AI's grade. Required when the evaluation failed.",
  }),
});

export const commitResponseSchema = z.object({
  submissionId: z.string(),
  finalGradation: gradationSchema,
  label: z.string(),
  overridden: z.boolean(),
  aiGradation: gradationSchema.nullable(),
  review: z.object({
    rating: z.enum(['Again', 'Hard', 'Good', 'Easy']),
    previousDueAt: z.iso.datetime().nullable(),
    dueAt: z.iso.datetime(),
    scheduledDays: z.number(),
    state: z.int(),
    reps: z.int(),
    lapses: z.int(),
    stability: z.number(),
    difficulty: z.number(),
  }),
});

export const submissionListResponseSchema = z.object({
  submissions: z.array(submissionResponseSchema),
});

export const reviewQueueItemSchema = z.object({
  problemId: z.int(),
  title: z.string(),
  deckId: z.int(),
  deckName: z.string(),
  mode: z.enum(['drill', 'note']),
  dueAt: z.iso.datetime(),
  reps: z.int(),
  lapses: z.int(),
});

export const reviewQueueResponseSchema = z.object({
  items: z.array(reviewQueueItemSchema),
});

/**
 * Shared by the deck-scoped variants of the drill and review endpoints. Coerced
 * because it arrives as a query string.
 */
export const deckScopeQuerySchema = z.object({
  deckId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .meta({ description: 'Restrict to one deck. Omit for everything the caller can see.' }),
});

export const reviewDueCountResponseSchema = z.object({
  dueCount: z.int(),
  drillDueCount: z.int().meta({ description: 'Due cards eligible for the blind drill.' }),
  noteDueCount: z.int().meta({ description: 'Due cards graded by note + AI evaluation.' }),
  nextDueAt: z.iso.datetime().nullable(),
});

export type CreateDeckBody = z.infer<typeof createDeckBodySchema>;
export type AddProblemBody = z.infer<typeof addProblemBodySchema>;
export type ImportProblemsBody = z.infer<typeof importProblemsBodySchema>;
export type DeckScopeQuery = z.infer<typeof deckScopeQuerySchema>;
export type CreateSubmissionBody = z.infer<typeof createSubmissionBodySchema>;
export type CommitBody = z.infer<typeof commitBodySchema>;
