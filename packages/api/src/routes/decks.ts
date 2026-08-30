/**
 * Decks: the mandatory container for every problem.
 *
 * System decks (`ownerUserId` null) hold the curated F1.1â€“F1.4 bank. They are
 * readable by everyone and writable by no one. Personal decks belong to exactly
 * one user, who is the only one who can see or add to them.
 */

import {
  db,
  deckProblems,
  decks,
  deriveProblemIdentity,
  problems,
  slugify,
  srsCards,
} from '@recogno/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { reviewModeColumn } from '../drill/eligibility.js';
import { loadVisibleDeck, visibleToUser } from '../services/decks.js';
import {
  createSubmission,
  getSubmission,
  needsSourceResolution,
  SubmissionQueueUnavailableError,
} from '../services/submissions.js';
import {
  type AddProblemBody,
  addProblemBodySchema,
  addProblemResponseSchema,
  type CreateDeckBody,
  createDeckBodySchema,
  deckDetailResponseSchema,
  deckListResponseSchema,
  deckSchema,
  type ImportProblemsBody,
  importProblemsBodySchema,
  importProblemsResponseSchema,
} from './deckSchemas.js';
import { errorResponseSchema } from './schemas.js';

/** A unique slug within the deck, suffixed only when it would actually collide. */
async function uniqueSlugInDeck(deckId: number, desired: string): Promise<string> {
  const taken = await db
    .select({ slug: problems.slug })
    .from(problems)
    .where(and(eq(problems.deckId, deckId), sql`${problems.slug} like ${`${desired}%`}`));

  const existing = new Set(taken.map((row) => row.slug));
  if (!existing.has(desired)) return desired;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${desired}-${suffix}`.slice(0, 128);
    if (!existing.has(candidate)) return candidate;
  }

  return `${desired}-${Date.now()}`.slice(0, 128);
}

export const deckRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/decks',
    {
      schema: {
        tags: ['decks'],
        summary: 'List decks',
        description: "Every system deck plus the caller's own, with problem counts.",
        response: { 200: deckListResponseSchema },
      },
    },
    async (request) => {
      const { userId } = request;

      // Counted through membership, so an imported problem counts towards the
      // deck that borrowed it as well as the one that owns it.
      const rows = await db
        .select({
          id: decks.id,
          slug: decks.slug,
          name: decks.name,
          description: decks.description,
          ownerUserId: decks.ownerUserId,
          problemCount: count(deckProblems.problemId),
        })
        .from(decks)
        .leftJoin(deckProblems, eq(deckProblems.deckId, decks.id))
        .where(visibleToUser(userId))
        .groupBy(decks.id)
        .orderBy(asc(decks.ownerUserId), asc(decks.name));

      return {
        decks: rows.map(({ ownerUserId, ...deck }) => ({
          ...deck,
          isSystem: ownerUserId === null,
        })),
      };
    },
  );

  app.post<{ Body: CreateDeckBody }>(
    '/decks',
    {
      schema: {
        tags: ['decks'],
        summary: 'Create a personal deck',
        body: createDeckBodySchema,
        response: { 201: deckSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const slug = slugify(request.body.name);

      const [existing] = await db
        .select({ id: decks.id })
        .from(decks)
        .where(and(eq(decks.ownerUserId, userId), eq(decks.slug, slug)))
        .limit(1);

      if (existing) {
        return reply
          .code(409)
          .send({ error: `You already have a deck named "${request.body.name}"` });
      }

      const [deck] = await db
        .insert(decks)
        .values({
          slug,
          name: request.body.name,
          description: request.body.description ?? null,
          ownerUserId: userId,
        })
        .returning();

      if (!deck) return reply.code(500).send({ error: 'Failed to create deck' });

      return reply.code(201).send({
        id: deck.id,
        slug: deck.slug,
        name: deck.name,
        description: deck.description,
        isSystem: false,
        problemCount: 0,
      });
    },
  );

  app.get<{ Params: { deckId: number } }>(
    '/decks/:deckId',
    {
      schema: {
        tags: ['decks'],
        summary: 'Deck detail with its problems',
        description:
          'Each problem carries the review `mode` it belongs to: `drill` when a curator gave it a ' +
          'pattern and a tell, `note` otherwise.',
        response: { 200: deckDetailResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const deckId = Number(request.params.deckId);

      if (!Number.isInteger(deckId)) {
        return reply.code(404).send({ error: 'Deck not found' });
      }

      const deck = await loadVisibleDeck(deckId, userId);
      if (!deck) return reply.code(404).send({ error: `Deck ${deckId} not found` });

      const rows = await db
        .select({
          id: problems.id,
          slug: problems.slug,
          title: problems.title,
          difficulty: problems.difficulty,
          source: problems.source,
          sourceUrl: problems.sourceUrl,
          mode: reviewModeColumn(),
          dueAt: srsCards.dueAt,
          // A problem whose home deck is elsewhere was imported into this one.
          imported: sql<boolean>`${problems.deckId} <> ${deckProblems.deckId}`,
        })
        .from(deckProblems)
        .innerJoin(problems, eq(problems.id, deckProblems.problemId))
        .leftJoin(srsCards, and(eq(srsCards.problemId, problems.id), eq(srsCards.userId, userId)))
        .where(eq(deckProblems.deckId, deckId))
        .orderBy(asc(problems.id));

      return {
        id: deck.id,
        slug: deck.slug,
        name: deck.name,
        description: deck.description,
        isSystem: deck.ownerUserId === null,
        problemCount: rows.length,
        problems: rows,
      };
    },
  );

  app.post<{ Params: { deckId: number }; Body: AddProblemBody }>(
    '/decks/:deckId/problems',
    {
      schema: {
        tags: ['decks'],
        summary: 'Add a problem and record the first attempt',
        description:
          'Accepts a link, a slug or a free-text description, together with the note and solution.\n\n' +
          'Returns immediately with a queued submission: resolving the source and running the AI ' +
          'evaluation happen on the worker. Poll `GET /submissions/{id}` for progress.\n\n' +
          'Adding a problem that already exists in the deck records another attempt against it ' +
          'rather than failing.',
        body: addProblemBodySchema,
        response: {
          202: addProblemResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const deckId = Number(request.params.deckId);
      const { input, source, title, noteText, solutionText } = request.body;

      if (!Number.isInteger(deckId)) {
        return reply.code(404).send({ error: 'Deck not found' });
      }

      const deck = await loadVisibleDeck(deckId, userId);
      if (!deck) return reply.code(404).send({ error: `Deck ${deckId} not found` });

      if (deck.ownerUserId === null) {
        return reply
          .code(403)
          .send({ error: 'System decks are read-only. Create your own deck to add problems.' });
      }

      const identity = deriveProblemIdentity(input, source);

      // Re-adding the same problem is a repeat encounter, not an error. Matched
      // through membership, so re-adding one that was imported here records
      // another attempt against it rather than creating a near-duplicate.
      const [existing] = await db
        .select({ id: problems.id, source: problems.source, statement: problems.statement })
        .from(deckProblems)
        .innerJoin(problems, eq(problems.id, deckProblems.problemId))
        .where(and(eq(deckProblems.deckId, deckId), eq(problems.slug, identity.slug)))
        .limit(1);

      let problem = existing;

      if (!problem) {
        const slug = await uniqueSlugInDeck(deckId, identity.slug);

        // The problem row and its membership are one fact; a crash between them
        // would leave a problem in no deck at all.
        const created = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(problems)
            .values({
              deckId,
              slug,
              title: title ?? identity.title,
              statement: identity.statement,
              sourceUrl: identity.sourceUrl,
              source: identity.source,
              sourceRef: input,
              addedByUserId: userId,
            })
            .returning({ id: problems.id, source: problems.source, statement: problems.statement });

          if (!row) return undefined;

          await tx.insert(deckProblems).values({ deckId, problemId: row.id });
          return row;
        });

        if (!created) return reply.code(500).send({ error: 'Failed to create problem' });
        problem = created;
      }

      let submissionId: string;
      try {
        submissionId = await createSubmission({
          userId,
          problemId: problem.id,
          noteText,
          solutionText,
          withSourceResolution: needsSourceResolution(problem),
        });
      } catch (error) {
        if (error instanceof SubmissionQueueUnavailableError) {
          request.log.error({ err: error }, 'Evaluation queue unavailable');
          return reply.code(503).send({
            error:
              'Your work was saved but the evaluation queue is unavailable. Check that Redis and ' +
              `the worker are running, then commit submission ${error.submissionId} with an ` +
              'explicit gradation, or submit again.',
          });
        }
        throw error;
      }

      const submission = await getSubmission(userId, submissionId);
      if (!submission) return reply.code(500).send({ error: 'Failed to load the new submission' });

      return reply.code(202).send({ problemId: problem.id, submission });
    },
  );

  app.post<{ Params: { deckId: number }; Body: ImportProblemsBody }>(
    '/decks/:deckId/import',
    {
      schema: {
        tags: ['decks'],
        summary: 'Import problems from another deck',
        description:
          'Adds existing problems to this deck by reference â€” nothing is copied. The problem keeps ' +
          'one identity and therefore one SRS card, so importing something already scheduled ' +
          'carries its progress across instead of restarting it.\n\n' +
          'Source problems may come from any deck the caller can see: a system deck, or one of ' +
          'their own. Ids already in the deck are counted as `skipped` rather than failing the call.',
        body: importProblemsBodySchema,
        response: {
          200: importProblemsResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const deckId = Number(request.params.deckId);

      if (!Number.isInteger(deckId)) {
        return reply.code(404).send({ error: 'Deck not found' });
      }

      const deck = await loadVisibleDeck(deckId, userId);
      if (!deck) return reply.code(404).send({ error: `Deck ${deckId} not found` });

      if (deck.ownerUserId === null) {
        return reply
          .code(403)
          .send({ error: 'System decks are read-only. Import into your own deck instead.' });
      }

      const requested = [...new Set(request.body.problemIds)];

      // Visibility is a property of the problem's home deck, so this join is the
      // authorisation check: anything not readable simply does not come back.
      const sources = await db
        .select({ id: problems.id, homeDeckId: problems.deckId })
        .from(problems)
        .innerJoin(decks, eq(decks.id, problems.deckId))
        .where(and(inArray(problems.id, requested), visibleToUser(userId)));

      if (sources.length !== requested.length) {
        const found = new Set(sources.map((row) => row.id));
        const missing = requested.filter((id) => !found.has(id));
        return reply
          .code(404)
          .send({ error: `Problem(s) not found or not visible: ${missing.join(', ')}` });
      }

      const inserted = await db
        .insert(deckProblems)
        .values(
          sources.map((row) => ({
            deckId,
            problemId: row.id,
            // Null when importing a problem into the deck that already owns it,
            // which keeps "home deck" meaning exactly one thing.
            importedFromDeckId: row.homeDeckId === deckId ? null : row.homeDeckId,
          })),
        )
        // Importing the same problem twice is idempotent, not a conflict.
        .onConflictDoNothing()
        .returning({ problemId: deckProblems.problemId });

      const [totals] = await db
        .select({ value: count() })
        .from(deckProblems)
        .where(eq(deckProblems.deckId, deckId));

      return {
        imported: inserted.length,
        skipped: requested.length - inserted.length,
        problemCount: totals?.value ?? 0,
      };
    },
  );

  app.delete<{ Params: { deckId: number; problemId: number } }>(
    '/decks/:deckId/problems/:problemId',
    {
      schema: {
        tags: ['decks'],
        summary: 'Remove an imported problem from a deck',
        description:
          'Drops the membership row only â€” the problem, its submissions and its SRS card are ' +
          'untouched, and it stays in the deck that owns it.\n\n' +
          'A problem created in this deck cannot be removed this way: there would be nowhere for ' +
          'it to live afterwards.',
        response: {
          204: { type: 'null' },
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const deckId = Number(request.params.deckId);
      const problemId = Number(request.params.problemId);

      if (!Number.isInteger(deckId) || !Number.isInteger(problemId)) {
        return reply.code(404).send({ error: 'Deck or problem not found' });
      }

      const deck = await loadVisibleDeck(deckId, userId);
      if (!deck) return reply.code(404).send({ error: `Deck ${deckId} not found` });

      if (deck.ownerUserId === null) {
        return reply.code(403).send({ error: 'System decks are read-only.' });
      }

      const [membership] = await db
        .select({ homeDeckId: problems.deckId })
        .from(deckProblems)
        .innerJoin(problems, eq(problems.id, deckProblems.problemId))
        .where(and(eq(deckProblems.deckId, deckId), eq(deckProblems.problemId, problemId)))
        .limit(1);

      if (!membership) {
        return reply.code(404).send({ error: `Problem ${problemId} is not in this deck` });
      }

      if (membership.homeDeckId === deckId) {
        return reply.code(409).send({
          error:
            'This problem was created in this deck, so it cannot be removed from it. Only ' +
            'imported problems can be removed.',
        });
      }

      await db
        .delete(deckProblems)
        .where(and(eq(deckProblems.deckId, deckId), eq(deckProblems.problemId, problemId)));

      return reply.code(204).send();
    },
  );
};

/** Shared by the routes above and by `submissions.ts`. */
export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: message });
}
