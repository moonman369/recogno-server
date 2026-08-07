/**
 * Decks: the mandatory container for every problem.
 *
 * System decks (`ownerUserId` null) hold the curated F1.1–F1.4 bank. They are
 * readable by everyone and writable by no one. Personal decks belong to exactly
 * one user, who is the only one who can see or add to them.
 */

import { db, decks, deriveProblemIdentity, problems, slugify, srsCards } from '@recogno/shared';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { reviewModeColumn } from '../drill/eligibility.js';
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
} from './deckSchemas.js';
import { errorResponseSchema } from './schemas.js';

/** Visible to this user: every system deck, plus their own. */
function visibleToUser(userId: string) {
  return or(isNull(decks.ownerUserId), eq(decks.ownerUserId, userId));
}

async function loadDeck(deckId: number, userId: string) {
  const [deck] = await db
    .select({
      id: decks.id,
      slug: decks.slug,
      name: decks.name,
      description: decks.description,
      ownerUserId: decks.ownerUserId,
    })
    .from(decks)
    .where(and(eq(decks.id, deckId), visibleToUser(userId)))
    .limit(1);

  return deck;
}

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

      const rows = await db
        .select({
          id: decks.id,
          slug: decks.slug,
          name: decks.name,
          description: decks.description,
          ownerUserId: decks.ownerUserId,
          problemCount: count(problems.id),
        })
        .from(decks)
        .leftJoin(problems, eq(problems.deckId, decks.id))
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

      const deck = await loadDeck(deckId, userId);
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
        })
        .from(problems)
        .leftJoin(srsCards, and(eq(srsCards.problemId, problems.id), eq(srsCards.userId, userId)))
        .where(eq(problems.deckId, deckId))
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

      const deck = await loadDeck(deckId, userId);
      if (!deck) return reply.code(404).send({ error: `Deck ${deckId} not found` });

      if (deck.ownerUserId === null) {
        return reply
          .code(403)
          .send({ error: 'System decks are read-only. Create your own deck to add problems.' });
      }

      const identity = deriveProblemIdentity(input, source);

      // Re-adding the same problem is a repeat encounter, not an error.
      const [existing] = await db
        .select({ id: problems.id, source: problems.source, statement: problems.statement })
        .from(problems)
        .where(and(eq(problems.deckId, deckId), eq(problems.slug, identity.slug)))
        .limit(1);

      let problem = existing;

      if (!problem) {
        const slug = await uniqueSlugInDeck(deckId, identity.slug);
        const [created] = await db
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
};

/** Shared by the routes above and by `submissions.ts`. */
export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: message });
}
