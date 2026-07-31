/**
 * F1.1–F1.4: the Blind Recognition Drill loop.
 *
 *   GET  /drill/next       pick a problem, revealing statement + constraints only
 *   POST /drill/submit     grade a guess, advance the FSRS card, reveal the tell
 *   GET  /drill/due-count  badge count for "X reps due today"
 */

import { db, drillAttempts, patterns, problems, srsCards, tells } from '@recogno/shared';
import { and, asc, count, eq, lte, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { gradeAttempt, ratingName, round4, toFsrsRating } from '../drill/scoring.js';
import { createEmptyCard, scheduler, toFsrsCard, toSrsCardColumns } from '../drill/srs.js';
import { judgeRationale } from '../services/rationale.js';
import {
  dueCountResponseSchema,
  errorResponseSchema,
  nextResponseSchema,
  type SubmitBody,
  submitBodySchema,
  submitResponseSchema,
} from './schemas.js';

/** Columns safe to show before a guess — deliberately no pattern and no tell. */
const blindProblemColumns = {
  id: problems.id,
  slug: problems.slug,
  title: problems.title,
  statement: problems.statement,
  constraints: problems.constraints,
  sourceUrl: problems.sourceUrl,
  difficulty: problems.difficulty,
};

type BlindProblem = {
  id: number;
  slug: string;
  title: string;
  statement: string;
  constraints: string;
  sourceUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
};

/** How `GET /drill/next` arrived at this problem, surfaced so the UI can label it. */
type SelectionSource = 'due' | 'unseen' | 'review-ahead';

type Selection = BlindProblem & { dueAt: Date | null; source: SelectionSource };

export const drillRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Preference order: a card that is actually due, then a problem never seen,
   * then the soonest-due card so the drill is never empty-handed.
   */
  app.get(
    '/drill/next',
    {
      schema: {
        tags: ['drill'],
        summary: 'Get a problem to recognise',
        description:
          'Returns the statement and constraints only. The ground-truth pattern and the tell ' +
          'are withheld until the guess is submitted.\n\n' +
          'Prefers an SRS card that is due, then a problem never seen, then the soonest-due card.',
        response: { 200: nextResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const now = new Date();

      const [due] = await db
        .select({ ...blindProblemColumns, dueAt: srsCards.dueAt })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)))
        .orderBy(asc(srsCards.dueAt))
        .limit(1);

      let selected: Selection | undefined = due ? { ...due, source: 'due' } : undefined;

      if (!selected) {
        const [unseen] = await db
          .select(blindProblemColumns)
          .from(problems)
          .where(
            sql`not exists (
            select 1 from ${srsCards}
            where ${srsCards.userId} = ${userId} and ${srsCards.problemId} = ${problems.id}
          )`,
          )
          .orderBy(sql`random()`)
          .limit(1);

        if (unseen) selected = { ...unseen, dueAt: null, source: 'unseen' };
      }

      if (!selected) {
        // Everything has been seen and nothing is due yet: offer the next one up.
        const [ahead] = await db
          .select({ ...blindProblemColumns, dueAt: srsCards.dueAt })
          .from(srsCards)
          .innerJoin(problems, eq(problems.id, srsCards.problemId))
          .where(eq(srsCards.userId, userId))
          .orderBy(asc(srsCards.dueAt))
          .limit(1);

        if (ahead) selected = { ...ahead, source: 'review-ahead' };
      }

      if (!selected) {
        return reply.code(404).send({ error: 'No problems in the bank. Run `pnpm db:seed`.' });
      }

      // The full taxonomy is not a leak — it is the multiple-choice menu.
      const patternOptions = await db
        .select({ id: patterns.id, slug: patterns.slug, name: patterns.name })
        .from(patterns)
        .orderBy(asc(patterns.name));

      const { source, dueAt, ...problem } = selected;
      return { problem, source, dueAt, patternOptions };
    },
  );

  app.post<{ Body: SubmitBody }>(
    '/drill/submit',
    {
      schema: {
        tags: ['drill'],
        summary: 'Submit a guess and advance the schedule',
        description:
          'Grades correctness, speed and rationale, combines them into a composite, maps that ' +
          'onto an FSRS rating, and upserts the SRS card. Reveals the tell in the response.\n\n' +
          'A wrong guess cannot exceed the Hard band however fast or well argued it was, ' +
          'and a correct guess with no real reasoning lands there too.',
        body: submitBodySchema,
        response: {
          200: submitResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;
      const { problemId, guessedPatternId, rationaleText, timeTakenSeconds } = request.body;

      const [problem] = await db
        .select({
          id: problems.id,
          title: problems.title,
          statement: problems.statement,
          constraints: problems.constraints,
          patternId: problems.patternId,
          patternSlug: patterns.slug,
          patternName: patterns.name,
          patternDescription: patterns.description,
          tellText: tells.tellText,
        })
        .from(problems)
        .innerJoin(patterns, eq(patterns.id, problems.patternId))
        .leftJoin(tells, eq(tells.problemId, problems.id))
        .where(eq(problems.id, problemId))
        .limit(1);

      if (!problem) {
        return reply.code(404).send({ error: `Problem ${problemId} not found` });
      }

      const [guessed] = await db
        .select({ id: patterns.id, slug: patterns.slug, name: patterns.name })
        .from(patterns)
        .where(eq(patterns.id, guessedPatternId))
        .limit(1);

      if (!guessed) {
        return reply.code(400).send({ error: `Pattern ${guessedPatternId} not found` });
      }

      const { verdict, judged } = await judgeRationale({
        statement: problem.statement,
        constraints: problem.constraints,
        actualPatternName: problem.patternName,
        guessedPatternName: guessed.name,
        rationaleText,
      });

      const scores = gradeAttempt({
        guessedSlug: guessed.slug,
        actualSlug: problem.patternSlug,
        timeTakenSeconds,
        verdict,
      });

      const rating = toFsrsRating(scores.composite);
      const now = new Date();

      const [existing] = await db
        .select()
        .from(srsCards)
        .where(and(eq(srsCards.userId, userId), eq(srsCards.problemId, problemId)))
        .limit(1);

      const previousDueAt = existing?.dueAt ?? null;
      const currentCard = existing ? toFsrsCard(existing) : createEmptyCard(now);
      const { card: nextCard } = scheduler.next(currentCard, now, rating);

      const attemptId = await db.transaction(async (tx) => {
        const columns = toSrsCardColumns(nextCard);

        await tx
          .insert(srsCards)
          .values({ userId, problemId, ...columns })
          .onConflictDoUpdate({
            target: [srsCards.userId, srsCards.problemId],
            set: { ...columns, updatedAt: now },
          });

        const [attempt] = await tx
          .insert(drillAttempts)
          .values({
            userId,
            problemId,
            guessedPatternId,
            rationaleText,
            timeTakenSeconds: Math.round(timeTakenSeconds),
            correctnessScore: scores.correctness,
            speedScore: scores.speed,
            rationaleScore: scores.rationale,
            compositeScore: scores.composite,
          })
          .returning({ id: drillAttempts.id });

        return attempt?.id;
      });

      return {
        attemptId,
        correct: scores.correctness === 1,
        guessedPattern: guessed,
        actualPattern: {
          id: problem.patternId,
          slug: problem.patternSlug,
          name: problem.patternName,
          description: problem.patternDescription,
        },
        tell: problem.tellText,
        explanation: buildExplanation({
          scores,
          guessedName: guessed.name,
          actualName: problem.patternName,
          timeTakenSeconds,
          verdict,
          judged,
        }),
        scores,
        rationale: { verdict, judged },
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

  app.get(
    '/drill/due-count',
    {
      schema: {
        tags: ['drill'],
        summary: 'Count the reps waiting',
        description: 'Cards whose due date has passed, for the "X reps due today" badge.',
        response: { 200: dueCountResponseSchema },
      },
    },
    async (request) => {
      const { userId } = request;
      const now = new Date();

      const [due] = await db
        .select({ value: count() })
        .from(srsCards)
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now)));

      const [next] = await db
        .select({ dueAt: srsCards.dueAt })
        .from(srsCards)
        .where(eq(srsCards.userId, userId))
        .orderBy(asc(srsCards.dueAt))
        .limit(1);

      return { dueCount: due?.value ?? 0, nextDueAt: next?.dueAt ?? null };
    },
  );
};

/** Plain-language summary of the grade. Deterministic — no second LLM call. */
function buildExplanation(input: {
  scores: { correctness: number; speed: number; rationale: number; composite: number };
  guessedName: string;
  actualName: string;
  timeTakenSeconds: number;
  verdict: string;
  judged: boolean;
}): string {
  const { scores, guessedName, actualName, timeTakenSeconds, verdict, judged } = input;

  const correctness =
    scores.correctness === 1
      ? `Correct — this is ${actualName}.`
      : scores.correctness === 0.5
        ? `Close. You said ${guessedName}; it is ${actualName}, a near neighbour, so you get half credit.`
        : `Not quite. You said ${guessedName}; it is ${actualName}.`;

  const speed = `You took ${Math.round(timeTakenSeconds)}s (speed ${scores.speed.toFixed(2)}).`;

  const rationale = judged
    ? verdict === 'yes'
      ? 'Your rationale cited a concrete constraint-based tell.'
      : verdict === 'partial'
        ? 'Your rationale was on the right track but stayed vague.'
        : 'Your rationale did not cite anything from the constraints.'
    : 'Your rationale could not be graded this time, so it scored neutrally.';

  return `${correctness} ${speed} ${rationale} Composite ${scores.composite.toFixed(2)}.`;
}
