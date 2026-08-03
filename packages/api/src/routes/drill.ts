/**
 * F1.1–F1.4: the Blind Recognition Drill loop.
 *
 *   GET  /drill/next       pick a problem, revealing statement + constraints only
 *   POST /drill/submit     grade a guess, advance the FSRS card, reveal the tell
 *   GET  /drill/due-count  badge count for "X reps due today"
 */

import {
  db,
  drillAttemptPatterns,
  drillAttempts,
  patterns,
  problemPatterns,
  problems,
  srsCards,
  tells,
} from '@recogno/shared';
import { and, asc, count, eq, inArray, lte, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { isDrillEligible } from '../drill/eligibility.js';
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

/**
 * Nullable where the columns are: personal deck additions may have no statement,
 * constraints or difficulty. `isDrillEligible()` keeps those out of this route,
 * so in practice a served problem always has a statement.
 */
type BlindProblem = {
  id: number;
  slug: string;
  title: string;
  statement: string | null;
  constraints: string | null;
  sourceUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
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
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now), isDrillEligible()))
        .orderBy(asc(srsCards.dueAt))
        .limit(1);

      let selected: Selection | undefined = due ? { ...due, source: 'due' } : undefined;

      if (!selected) {
        const [unseen] = await db
          .select(blindProblemColumns)
          .from(problems)
          .where(
            and(
              isDrillEligible(),
              sql`not exists (
            select 1 from ${srsCards}
            where ${srsCards.userId} = ${userId} and ${srsCards.problemId} = ${problems.id}
          )`,
            ),
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
          .where(and(eq(srsCards.userId, userId), isDrillEligible()))
          .orderBy(asc(srsCards.dueAt))
          .limit(1);

        if (ahead) selected = { ...ahead, source: 'review-ahead' };
      }

      if (!selected) {
        return reply.code(404).send({ error: 'No drill-eligible problems. Run `pnpm db:seed`.' });
      }

      // The full taxonomy is not a leak — it is the multiple-choice menu.
      const patternOptions = await db
        .select({
          id: patterns.id,
          slug: patterns.slug,
          name: patterns.name,
          category: patterns.category,
        })
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
      const {
        problemId,
        guessedPatternIds,
        guessedPatternSlugs,
        guessedPatternId,
        rationaleText,
        timeTakenSeconds,
      } = request.body;

      const [problem] = await db
        .select({
          id: problems.id,
          title: problems.title,
          statement: problems.statement,
          constraints: problems.constraints,
          patternId: problems.patternId,
          patternSlug: patterns.slug,
          patternName: patterns.name,
          patternCategory: patterns.category,
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

      // Ids, slugs and the single-guess shorthand all funnel into one ordered,
      // de-duplicated list so the rest of the handler sees a single shape.
      const requestedIds = [...(guessedPatternIds ?? [])];
      if (guessedPatternId !== undefined) requestedIds.push(guessedPatternId);
      const requestedSlugs = (guessedPatternSlugs ?? []).map((slug) => slug.toLowerCase());

      const candidates = await db
        .select({
          id: patterns.id,
          slug: patterns.slug,
          name: patterns.name,
          category: patterns.category,
        })
        .from(patterns)
        .where(
          or(
            requestedIds.length > 0 ? inArray(patterns.id, requestedIds) : sql`false`,
            requestedSlugs.length > 0 ? inArray(patterns.slug, requestedSlugs) : sql`false`,
          ),
        );

      const byId = new Map(candidates.map((p) => [p.id, p]));
      const bySlug = new Map(candidates.map((p) => [p.slug, p]));

      const unknownIds = requestedIds.filter((id) => !byId.has(id));
      const unknownSlugs = requestedSlugs.filter((slug) => !bySlug.has(slug));

      if (unknownIds.length > 0 || unknownSlugs.length > 0) {
        const unknown = [...unknownIds.map(String), ...unknownSlugs];
        return reply.code(400).send({ error: `Unknown pattern(s): ${unknown.join(', ')}` });
      }

      const guessedPatterns = [
        ...new Map(
          [
            ...requestedIds.map((id) => byId.get(id)),
            ...requestedSlugs.map((slug) => bySlug.get(slug)),
          ]
            .filter((p) => p !== undefined)
            .map((p) => [p.id, p] as const),
        ).values(),
      ];

      const guessed = guessedPatterns[0];
      if (!guessed) {
        return reply.code(400).send({ error: 'No patterns were guessed' });
      }

      // Every pattern this problem accepts. Falls back to the canonical one for
      // problems seeded before alternatives existed.
      const acceptedRows = await db
        .select({
          id: patterns.id,
          slug: patterns.slug,
          name: patterns.name,
          category: patterns.category,
        })
        .from(problemPatterns)
        .innerJoin(patterns, eq(patterns.id, problemPatterns.patternId))
        .where(eq(problemPatterns.problemId, problemId));

      const acceptedPatterns =
        acceptedRows.length > 0
          ? acceptedRows
          : [
              {
                id: problem.patternId,
                slug: problem.patternSlug,
                name: problem.patternName,
                category: problem.patternCategory,
              },
            ];

      const { verdict, judged } = await judgeRationale({
        statement: problem.statement,
        constraints: problem.constraints,
        actualPatternName: problem.patternName,
        guessedPatternName: guessedPatterns.map((p) => p.name).join(' + '),
        rationaleText,
      });

      const scores = gradeAttempt({
        guessedSlug: guessedPatterns.map((p) => p.slug),
        actualSlug: acceptedPatterns.map((p) => p.slug),
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
            // The first guess, so single-guess readers of this column still work.
            guessedPatternId: guessed.id,
            rationaleText,
            timeTakenSeconds: Math.round(timeTakenSeconds),
            correctnessScore: scores.correctness,
            speedScore: scores.speed,
            rationaleScore: scores.rationale,
            compositeScore: scores.composite,
          })
          .returning({ id: drillAttempts.id });

        if (!attempt) throw new Error('Failed to record the drill attempt');

        await tx
          .insert(drillAttemptPatterns)
          .values(guessedPatterns.map((p) => ({ attemptId: attempt.id, patternId: p.id })));

        return attempt.id;
      });

      return {
        attemptId,
        correct: scores.correctness === 1,
        guessedPattern: guessed,
        guessedPatterns,
        actualPattern: {
          id: problem.patternId,
          slug: problem.patternSlug,
          name: problem.patternName,
          category: problem.patternCategory,
          description: problem.patternDescription,
        },
        acceptedPatterns,
        tell: problem.tellText,
        explanation: buildExplanation({
          scores,
          guessedNames: guessedPatterns.map((p) => p.name),
          actualName: problem.patternName,
          acceptedNames: acceptedPatterns.map((p) => p.name),
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
        summary: 'Count the drill reps waiting',
        description:
          'Drill-eligible cards whose due date has passed. For the badge that spans both flows, ' +
          'use `GET /review/due-count`.',
        response: { 200: dueCountResponseSchema },
      },
    },
    async (request) => {
      const { userId } = request;
      const now = new Date();

      const [due] = await db
        .select({ value: count() })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .where(and(eq(srsCards.userId, userId), lte(srsCards.dueAt, now), isDrillEligible()));

      const [next] = await db
        .select({ dueAt: srsCards.dueAt })
        .from(srsCards)
        .innerJoin(problems, eq(problems.id, srsCards.problemId))
        .where(and(eq(srsCards.userId, userId), isDrillEligible()))
        .orderBy(asc(srsCards.dueAt))
        .limit(1);

      return { dueCount: due?.value ?? 0, nextDueAt: next?.dueAt ?? null };
    },
  );
};

/** Plain-language summary of the grade. Deterministic — no second LLM call. */
function buildExplanation(input: {
  scores: { correctness: number; speed: number; rationale: number; composite: number };
  guessedNames: string[];
  actualName: string;
  acceptedNames: string[];
  timeTakenSeconds: number;
  verdict: string;
  judged: boolean;
}): string {
  const { scores, guessedNames, actualName, acceptedNames, timeTakenSeconds, verdict, judged } =
    input;

  const said = formatList(guessedNames);
  // Mentioning the alternatives only when they exist keeps single-pattern
  // problems reading exactly as they did before.
  const others = acceptedNames.filter((name) => name !== actualName);
  const alternatives = others.length > 0 ? ` It also accepts ${formatList(others)}.` : '';

  const correctness =
    scores.correctness === 1
      ? `Correct — this is ${actualName}.${alternatives}`
      : scores.correctness === 0.5
        ? `Close. You said ${said}; it is ${actualName}, a near neighbour, so you get half credit.${alternatives}`
        : `Not quite. You said ${said}; it is ${actualName}.${alternatives}`;

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

/** "A", "A and B", "A, B and C". */
function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
