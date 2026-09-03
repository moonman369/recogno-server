/**
 * Request and response shapes for a user's scoring settings: the
 * composite→FSRS-rating thresholds that decide which grade (Again/Hard/Good/
 * Easy) a drill or note-flow attempt earns. FSRS's own interval math is
 * untouched by any of this — see `packages/api/src/drill/scoring.ts`.
 */

import { z } from 'zod';

export const ratingThresholdsSchema = z.object({
  easy: z.number().min(0).max(1).meta({ description: 'Composite at or above this earns Easy.' }),
  good: z.number().min(0).max(1).meta({ description: 'Composite at or above this earns Good.' }),
  hard: z.number().min(0).max(1).meta({
    description: 'Composite at or above this earns Hard. Below it, the card lapses (Again).',
  }),
});

export const scoringSettingsResponseSchema = z.object({
  thresholds: ratingThresholdsSchema,
  isDefault: z.boolean().meta({
    description: 'True when no override is set, so `thresholds` is just the built-in default.',
  }),
});

export const updateScoringSettingsBodySchema = ratingThresholdsSchema.refine(
  (thresholds) => thresholds.hard < thresholds.good && thresholds.good < thresholds.easy,
  { error: 'Thresholds must satisfy hard < good < easy', path: ['easy'] },
);

export type UpdateScoringSettingsBody = z.infer<typeof updateScoringSettingsBodySchema>;
