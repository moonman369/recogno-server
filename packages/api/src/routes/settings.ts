/**
 * A user's own composite→FSRS-rating thresholds.
 *
 *   GET    /settings/scoring  the effective thresholds (default until overridden)
 *   PUT    /settings/scoring  set an override
 *   DELETE /settings/scoring  clear it, reverting to the default
 *
 * These only change which of FSRS's four grades a score earns — `POST
 * /drill/submit` and `POST /submissions/:id/commit` both read this before
 * calling `toFsrsRating`. FSRS's own stability/difficulty model, and the
 * interval it computes for whichever grade wins, are untouched.
 */

import type { FastifyPluginAsync } from 'fastify';
import { RATING_THRESHOLDS } from '../drill/scoring.js';
import {
  clearThresholds,
  getThresholdOverride,
  setThresholds,
} from '../services/scoringSettings.js';
import { errorResponseSchema } from './schemas.js';
import {
  scoringSettingsResponseSchema,
  type UpdateScoringSettingsBody,
  updateScoringSettingsBodySchema,
} from './settingsSchemas.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/settings/scoring',
    {
      schema: {
        tags: ['settings'],
        summary: 'The thresholds currently grading this user',
        description:
          'Defaults to the built-in bands (0.8 / 0.55 / 0.3) until this user sets an override.',
        response: { 200: scoringSettingsResponseSchema },
      },
    },
    async (request) => {
      const override = await getThresholdOverride(request.userId);
      return { thresholds: override ?? RATING_THRESHOLDS, isDefault: override === undefined };
    },
  );

  app.put<{ Body: UpdateScoringSettingsBody }>(
    '/settings/scoring',
    {
      schema: {
        tags: ['settings'],
        summary: 'Set custom thresholds',
        description:
          'Replaces any existing override outright. Must satisfy `hard < good < easy`. ' +
          "Takes effect on the learner's next graded attempt — it does not reschedule cards " +
          'already due.',
        body: updateScoringSettingsBodySchema,
        response: { 200: scoringSettingsResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request) => {
      const thresholds = await setThresholds(request.userId, request.body);
      return { thresholds, isDefault: false };
    },
  );

  app.delete(
    '/settings/scoring',
    {
      schema: {
        tags: ['settings'],
        summary: 'Reset to the default thresholds',
        response: { 200: scoringSettingsResponseSchema },
      },
    },
    async (request) => {
      await clearThresholds(request.userId);
      return { thresholds: RATING_THRESHOLDS, isDefault: true };
    },
  );
};
