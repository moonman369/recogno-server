/**
 * The "what's due today" view, spanning both flows.
 *
 * `srs_cards` is the single scheduling table, so a due card may belong to either
 * the blind drill or the note/solution flow. Each item says which, so the client
 * knows whether to open `/drill/next` or a submission form.
 *
 * Both endpoints take an optional `deckId`. That is a filter on the same queue,
 * not a second queue: a card's due date is a property of the (user, problem)
 * pair, so reviewing "just this deck" changes what you are shown, never when
 * something falls due.
 */

import { db, decks, problems, srsCards } from '@recogno/shared';
import { and, asc, eq, lte, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { inDeck, isDrillEligible, reviewModeColumn } from '../drill/eligibility.js';
import { loadVisibleDeck } from '../services/decks.js';
import {
  type DeckScopeQuery,
  deckScopeQuerySchema,
  reviewDueCountResponseSchema,
  reviewQueueResponseSchema,
} from './deckSchemas.js';
import { errorResponseSchema } from './schemas.js';

const MAX_QUEUE_ITEMS = 100;

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: DeckScopeQuery }>(
    '/review/due-count',
    {
      schema: {
        tags: ['review'],
        summary: 'Reps due across both flows',
        description:
          'The unified badge count. Broken down by flow so a client can show "3 drills, 2 writeups".\n\n' +
          'Pass `deckId` to count within one deck.',
        querystring: deckScopeQuerySchema,
        response: { 200: reviewDueCountResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const { deckId } = request.query;
      const now = new Date();

      if (deckId !== undefined && !(await loadVisibleDeck(deckId, userId))) {
        return reply.code(404).send({ error: `Deck ${deckId} not found` });
      }

      const scope: SQL | undefined = deckId === undefined ? undefined : inDeck(deckId);

      const [totals] = await db
        .select({
          dueCount: sql<number>`count(*)::int`,
          drillDueCount: sql<number>`count(*) filter (where ${isDrillEligible()})::int`,
          noteDueCount: sql<number>`count(*) filter (where not (${isDrillEligible()}))::int`,
        })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now), scope));

      // Joined to `problems` only when scoped: the unscoped lookahead spans every
      // card the user has, and a join there would cost a scan for nothing.
      const nextQuery =
        scope === undefined
          ? db.select({ dueAt: srsCards.dueAt }).from(srsCards).where(eq(srsCards.userId, userId))
          : db
              .select({ dueAt: srsCards.dueAt })
              .from(srsCards)
              .innerJoin(problems, eq(problems.id, srsCards.problemId))
              .where(and(eq(srsCards.userId, userId), scope));

      const [next] = await nextQuery.orderBy(asc(srsCards.dueAt)).limit(1);

      return {
        dueCount: totals?.dueCount ?? 0,
        drillDueCount: totals?.drillDueCount ?? 0,
        noteDueCount: totals?.noteDueCount ?? 0,
        nextDueAt: next?.dueAt ?? null,
      };
    },
  );

  app.get<{ Querystring: DeckScopeQuery }>(
    '/review/queue',
    {
      schema: {
        tags: ['review'],
        summary: 'Everything due now, oldest first',
        description:
          'Spans both flows. `mode` is `drill` for curated pattern-tagged problems and `note` for ' +
          'everything else.\n\n' +
          'Pass `deckId` to review one deck only. `deckId`/`deckName` on each item stay the ' +
          "problem's home deck, which is where it was created — not necessarily the deck filtered on.",
        querystring: deckScopeQuerySchema,
        response: { 200: reviewQueueResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const { deckId } = request.query;
      const now = new Date();

      if (deckId !== undefined && !(await loadVisibleDeck(deckId, userId))) {
        return reply.code(404).send({ error: `Deck ${deckId} not found` });
      }

      const scope: SQL | undefined = deckId === undefined ? undefined : inDeck(deckId);

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
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now), scope))
        .orderBy(asc(srsCards.dueAt))
        .limit(MAX_QUEUE_ITEMS);

      return { items };
    },
  );
};
