/**
 * Polling a submission, committing its gradation, and recording repeat attempts.
 *
 * Committing is where this flow meets F1.4: the final gradation — the AI's
 * unless the user overrode it — becomes an FSRS rating and advances the same
 * `srs_cards` row the blind drill uses.
 */

import {
  db,
  decks,
  GRADATION_LABELS,
  GRADATION_SCORES,
  type Gradation,
  problemSubmissions,
  problems,
  srsCards,
} from '@recogno/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { ratingName, round4, toFsrsRating } from '../drill/scoring.js';
import { createEmptyCard, scheduler, toFsrsCard, toSrsCardColumns } from '../drill/srs.js';
import {
  createSubmission,
  getSubmission,
  listSubmissionsForProblem,
  needsSourceResolution,
  SubmissionQueueUnavailableError,
} from '../services/submissions.js';
import {
  type CommitBody,
  type CreateSubmissionBody,
  commitBodySchema,
  commitResponseSchema,
  createSubmissionBodySchema,
  submissionListResponseSchema,
  submissionResponseSchema,
} from './deckSchemas.js';
import { errorResponseSchema } from './schemas.js';

export const submissionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { submissionId: string } }>(
    '/submissions/:submissionId',
    {
      schema: {
        tags: ['submissions'],
        summary: 'Poll a submission',
        description:
          'Returns the pipeline stages and, once evaluation finishes, the AI gradation and ' +
          'explanation. `status` reaches `awaiting-review` when it is ready to commit.',
        response: { 200: submissionResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const submission = await getSubmission(request.userId, request.params.submissionId);
      if (!submission) {
        return reply.code(404).send({ error: 'Submission not found' });
      }
      return submission;
    },
  );

  app.post<{ Params: { submissionId: string }; Body: CommitBody }>(
    '/submissions/:submissionId/commit',
    {
      schema: {
        tags: ['submissions'],
        summary: 'Accept or override the grade, and reschedule',
        description:
          "The final gradation drives FSRS. Omit `gradation` to accept the AI's verdict; supply " +
          'one to override it.\n\n' +
          'A submission whose evaluation failed can still be committed, but only with an explicit ' +
          'gradation — the learner self-grades rather than losing the attempt.',
        body: commitBodySchema,
        response: {
          200: commitResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const { submissionId } = request.params;

      const [row] = await db
        .select()
        .from(problemSubmissions)
        .where(and(eq(problemSubmissions.id, submissionId), eq(problemSubmissions.userId, userId)))
        .limit(1);

      if (!row) return reply.code(404).send({ error: 'Submission not found' });

      if (row.status === 'committed') {
        return reply.code(409).send({ error: 'This submission has already been committed' });
      }

      const override = request.body.gradation;

      if (!override && row.status !== 'awaiting-review') {
        return reply.code(409).send({
          error:
            row.status === 'failed'
              ? 'Evaluation failed. Commit with an explicit gradation to grade it yourself.'
              : `Evaluation is still ${row.status}. Wait for it, or commit with an explicit gradation.`,
        });
      }

      const finalGradation: Gradation | undefined = override ?? row.aiGradation ?? undefined;
      if (!finalGradation) {
        return reply.code(400).send({ error: 'No gradation available; supply one to commit' });
      }

      const overridden = Boolean(override && override !== row.aiGradation);

      // The 5 tiers reach FSRS through the same bands the drill uses, so both
      // flows schedule off one set of thresholds.
      const rating = toFsrsRating(GRADATION_SCORES[finalGradation]);
      const now = new Date();

      const [existingCard] = await db
        .select()
        .from(srsCards)
        .where(and(eq(srsCards.userId, userId), eq(srsCards.problemId, row.problemId)))
        .limit(1);

      const previousDueAt = existingCard?.dueAt ?? null;
      const currentCard = existingCard ? toFsrsCard(existingCard) : createEmptyCard(now);
      const { card: nextCard } = scheduler.next(currentCard, now, rating);

      await db.transaction(async (tx) => {
        const columns = toSrsCardColumns(nextCard);

        await tx
          .insert(srsCards)
          .values({ userId, problemId: row.problemId, ...columns })
          .onConflictDoUpdate({
            target: [srsCards.userId, srsCards.problemId],
            set: { ...columns, updatedAt: now },
          });

        await tx
          .update(problemSubmissions)
          .set({
            status: 'committed',
            finalGradation,
            overridden,
            committedAt: now,
            updatedAt: now,
          })
          .where(eq(problemSubmissions.id, submissionId));
      });

      return {
        submissionId,
        finalGradation,
        label: GRADATION_LABELS[finalGradation],
        overridden,
        aiGradation: row.aiGradation,
        review: {
          rating: ratingName(rating),
          previousDueAt,
          dueAt: nextCard.due,
          scheduledDays: nextCard.scheduled_days,
          state: nextCard.state,
          reps: nextCard.reps,
          lapses: nextCard.lapses,
          stability: round4(nextCard.stability),
          difficulty: round4(nextCard.difficulty),
        },
      };
    },
  );

  app.post<{ Params: { problemId: number }; Body: CreateSubmissionBody }>(
    '/problems/:problemId/submissions',
    {
      schema: {
        tags: ['submissions'],
        summary: 'Record another attempt at a problem',
        description:
          'The repeat-encounter path: a problem came due, the learner worked it again, and this ' +
          'is a fresh submission rather than an edit of the last one, so history is preserved.',
        body: createSubmissionBodySchema,
        response: {
          202: submissionResponseSchema,
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const problemId = Number(request.params.problemId);

      if (!Number.isInteger(problemId)) {
        return reply.code(404).send({ error: 'Problem not found' });
      }

      const [problem] = await db
        .select({
          id: problems.id,
          source: problems.source,
          statement: problems.statement,
          ownerUserId: decks.ownerUserId,
        })
        .from(problems)
        .innerJoin(decks, eq(decks.id, problems.deckId))
        .where(eq(problems.id, problemId))
        .limit(1);

      if (!problem) return reply.code(404).send({ error: `Problem ${problemId} not found` });

      // System-deck problems are readable by everyone, so anyone may submit
      // against them; a personal deck is private to its owner.
      if (problem.ownerUserId !== null && problem.ownerUserId !== userId) {
        return reply.code(404).send({ error: `Problem ${problemId} not found` });
      }

      let submissionId: string;
      try {
        submissionId = await createSubmission({
          userId,
          problemId,
          noteText: request.body.noteText,
          solutionText: request.body.solutionText,
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

      return reply.code(202).send(submission);
    },
  );

  app.get<{ Params: { problemId: number } }>(
    '/problems/:problemId/submissions',
    {
      schema: {
        tags: ['submissions'],
        summary: 'Attempt history for a problem',
        description: 'Newest first. Every encounter is its own record.',
        response: { 200: submissionListResponseSchema },
      },
    },
    async (request) => {
      const problemId = Number(request.params.problemId);
      if (!Number.isInteger(problemId)) return { submissions: [] };

      return { submissions: await listSubmissionsForProblem(request.userId, problemId) };
    },
  );
};
