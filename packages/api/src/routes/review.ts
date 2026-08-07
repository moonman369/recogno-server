/**
 * The "what's due today" view, spanning both flows.
 *
 * `srs_cards` is the single scheduling table, so a due card may belong to either
 * the blind drill or the note/solution flow. Each item says which, so the client
 * knows whether to open `/drill/next` or a submission form.
 */

import { db, decks, problems, srsCards } from '@recogno/shared';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { isDrillEligible, reviewModeColumn } from '../drill/eligibility.js';
import { reviewDueCountResponseSchema, reviewQueueResponseSchema } from './deckSchemas.js';

const MAX_QUEUE_ITEMS = 100;

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/review/due-count',
    {
      schema: {
        tags: ['review'],
        summary: 'Reps due across both flows',
        description:
          'The unified badge count. Broken down by flow so a client can show "3 drills, 2 writeups".',
        response: { 200: reviewDueCountResponseSchema },
      },
    },
    async (request) => {
      const { userId } = request;
      const now = new Date();

      const [totals] = await db
        .select({
          dueCount: sql<number>`count(*)::int`,
          drillDueCount: sql<number>`count(*) filter (where ${isDrillEligible()})::int`,
          noteDueCount: sql<number>`count(*) filter (where not (${isDrillEligible()}))::int`,
        })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)));

      const [next] = await db
        .select({ dueAt: srsCards.dueAt })
        .from(srsCards)
        .where(eq(srsCards.userId, userId))
        .orderBy(asc(srsCards.dueAt))
        .limit(1);

      return {
        dueCount: totals?.dueCount ?? 0,
        drillDueCount: totals?.drillDueCount ?? 0,
        noteDueCount: totals?.noteDueCount ?? 0,
        nextDueAt: next?.dueAt ?? null,
      };
    },
  );

  app.get(
    '/review/queue',
    {
      schema: {
        tags: ['review'],
        summary: 'Everything due now, oldest first',
        description:
          'Spans both flows. `mode` is `drill` for curated pattern-tagged problems and `note` for ' +
          'everything else.',
        response: { 200: reviewQueueResponseSchema },
      },
    },
    async (request) => {
      const { userId } = request;
      const now = new Date();

      const items = await db
        .select({
          problemId: problems.id,
          title: problems.title,
          deckId: decks.id,
          deckName: decks.name,
          mode: reviewModeColumn(),
          dueAt: srsCards.dueAt,
          reps: srsCards.reps,
          lapses: srsCards.lapses,
        })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .innerJoin(decks, eq(decks.id, problems.deckId))
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)))
        .orderBy(asc(srsCards.dueAt))
        .limit(MAX_QUEUE_ITEMS);

      return { items };
    },
  );
};
