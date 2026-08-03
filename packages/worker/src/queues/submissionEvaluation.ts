/**
 * The async pipeline behind a problem submission.
 *
 * Stages are rows in `submission_stages`, created by the API when it enqueues
 * the job — one per step that will really run. A free-text submission has
 * nothing to resolve, so it has no `resolve-source` row and the client never
 * sees a stage that does nothing.
 */

import {
  createLogger,
  db,
  getRedisConnection,
  patterns,
  problemSubmissions,
  problems,
  SUBMISSION_EVALUATION_QUEUE,
  type SubmissionEvaluationJobData,
  submissionStages,
} from '@recogno/shared';
import { type Job, Worker } from 'bullmq';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { evaluateSubmission } from '../services/evaluateSubmission.js';
import { resolveFromLink, resolveFromSlug } from '../services/problemSource.js';

const log = createLogger('queue:submission-evaluation');

async function startStage(
  submissionId: string,
  stage: 'resolve-source' | 'evaluate',
): Promise<void> {
  await db
    .update(submissionStages)
    .set({ status: 'running', startedAt: new Date(), finishedAt: null, detail: null })
    .where(and(eq(submissionStages.submissionId, submissionId), eq(submissionStages.stage, stage)));
}

async function finishStage(
  submissionId: string,
  stage: 'resolve-source' | 'evaluate',
  status: 'done' | 'failed',
  detail: string,
): Promise<void> {
  await db
    .update(submissionStages)
    .set({ status, detail, finishedAt: new Date() })
    .where(and(eq(submissionStages.submissionId, submissionId), eq(submissionStages.stage, stage)));
}

async function hasStage(submissionId: string, stage: 'resolve-source'): Promise<boolean> {
  const [row] = await db
    .select({ id: submissionStages.id })
    .from(submissionStages)
    .where(and(eq(submissionStages.submissionId, submissionId), eq(submissionStages.stage, stage)))
    .limit(1);
  return Boolean(row);
}

/**
 * Fills in whatever the source can tell us. Never throws: a dead link is a
 * failed stage, not a failed submission, because the grading target is the
 * learner's own note and solution.
 */
async function runResolveSource(submissionId: string, problemId: number): Promise<void> {
  await startStage(submissionId, 'resolve-source');

  const [problem] = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      source: problems.source,
      sourceRef: problems.sourceRef,
      sourceUrl: problems.sourceUrl,
    })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    await finishStage(submissionId, 'resolve-source', 'failed', 'Problem no longer exists');
    return;
  }

  try {
    let resolved: Awaited<ReturnType<typeof resolveFromLink>>;

    if (problem.source === 'link') {
      const target = problem.sourceUrl ?? problem.sourceRef;
      if (!target) throw new Error('No URL stored for this problem');
      resolved = await resolveFromLink(target);
    } else {
      // Reuse a curated problem's text when the slug matches one we already have.
      const [curated] = await db
        .select({
          title: problems.title,
          statement: problems.statement,
          constraints: problems.constraints,
        })
        .from(problems)
        .where(
          and(
            eq(problems.slug, problem.slug),
            ne(problems.id, problem.id),
            // Curated rows are the only trustworthy source of a statement.
            eq(problems.source, 'curated'),
          ),
        )
        .limit(1);

      resolved = resolveFromSlug(problem.slug, curated);
    }

    const updates: Record<string, unknown> = {};
    if (resolved.title) updates.title = resolved.title;
    if (resolved.statement) updates.statement = resolved.statement;

    if (Object.keys(updates).length > 0) {
      await db.update(problems).set(updates).where(eq(problems.id, problemId));
    }

    await finishStage(submissionId, 'resolve-source', 'done', resolved.detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ err: error, problemId }, 'Source resolution failed; grading the note anyway');
    await finishStage(
      submissionId,
      'resolve-source',
      'failed',
      `Could not resolve the source: ${message}`,
    );
  }
}

async function runEvaluation(submissionId: string): Promise<void> {
  await startStage(submissionId, 'evaluate');

  const [row] = await db
    .select({
      noteText: problemSubmissions.noteText,
      solutionText: problemSubmissions.solutionText,
      problemTitle: problems.title,
      problemStatement: problems.statement,
      problemConstraints: problems.constraints,
      patternName: patterns.name,
    })
    .from(problemSubmissions)
    .innerJoin(problems, eq(problems.id, problemSubmissions.problemId))
    .leftJoin(patterns, eq(patterns.id, problems.patternId))
    .where(eq(problemSubmissions.id, submissionId))
    .limit(1);

  if (!row) throw new Error(`Submission ${submissionId} disappeared mid-flight`);

  const result = await evaluateSubmission({
    problemTitle: row.problemTitle,
    problemStatement: row.problemStatement,
    problemConstraints: row.problemConstraints,
    noteText: row.noteText,
    solutionText: row.solutionText,
  });

  await db
    .update(problemSubmissions)
    .set({
      status: 'awaiting-review',
      aiGradation: result.gradation,
      aiApproachSummary: result.approachSummary,
      aiMissed: result.missed,
      aiOptimizations: result.optimizations,
      aiModel: result.model,
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(problemSubmissions.id, submissionId));

  await finishStage(submissionId, 'evaluate', 'done', `Graded as "${result.gradation}"`);
}

/**
 * @param isFinalAttempt when false, a failure leaves the submission in flight
 *   because BullMQ will retry it. Only the last attempt may mark it `failed`.
 */
export async function processSubmission(
  submissionId: string,
  isFinalAttempt = true,
): Promise<void> {
  const [submission] = await db
    .select({
      id: problemSubmissions.id,
      problemId: problemSubmissions.problemId,
      status: problemSubmissions.status,
    })
    .from(problemSubmissions)
    .where(eq(problemSubmissions.id, submissionId))
    .limit(1);

  if (!submission) {
    log.warn({ submissionId }, 'Submission no longer exists; dropping job');
    return;
  }

  // A committed submission is final — a retry must never re-grade it.
  if (submission.status === 'committed') {
    log.info({ submissionId }, 'Submission already committed; nothing to do');
    return;
  }

  try {
    if (await hasStage(submissionId, 'resolve-source')) {
      await db
        .update(problemSubmissions)
        .set({ status: 'resolving-source', updatedAt: new Date() })
        .where(eq(problemSubmissions.id, submissionId));

      await runResolveSource(submissionId, submission.problemId);
    }

    await db
      .update(problemSubmissions)
      .set({ status: 'evaluating', updatedAt: new Date() })
      .where(eq(problemSubmissions.id, submissionId));

    await runEvaluation(submissionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isFinalAttempt) {
      await finishStage(submissionId, 'evaluate', 'failed', message);
      await db
        .update(problemSubmissions)
        .set({ status: 'failed', failureReason: message, updatedAt: new Date() })
        .where(eq(problemSubmissions.id, submissionId));
    } else {
      // A retry is still coming, so the work is genuinely still in flight.
      // Reporting `failed` here would show a client a terminal state that then
      // un-fails — transient provider errors (a Gemini 503) do exactly this.
      await db
        .update(submissionStages)
        .set({ status: 'running', detail: `Attempt failed, retrying: ${message}` })
        .where(
          and(
            eq(submissionStages.submissionId, submissionId),
            eq(submissionStages.stage, 'evaluate'),
          ),
        );
    }

    // Rethrow either way so BullMQ schedules the retry (or records the final failure).
    throw error;
  }
}

export function createSubmissionEvaluationWorker(): Worker<SubmissionEvaluationJobData> {
  const worker = new Worker<SubmissionEvaluationJobData>(
    SUBMISSION_EVALUATION_QUEUE,
    async (job: Job<SubmissionEvaluationJobData>) => {
      // `attemptsMade` counts attempts before this one, so this run is the last
      // when adding it reaches the configured ceiling.
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      log.info(
        {
          jobId: job.id,
          submissionId: job.data.submissionId,
          attempt: job.attemptsMade + 1,
          maxAttempts,
        },
        'Evaluating submission',
      );
      await processSubmission(job.data.submissionId, isFinalAttempt);
    },
    {
      connection: getRedisConnection(),
      // LLM calls dominate the runtime, so a little concurrency goes a long way,
      // but Gemini rate limits punish more than this.
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, submissionId: job.data.submissionId }, 'Submission evaluated');
  });

  worker.on('failed', (job, error) => {
    log.error(
      { jobId: job?.id, submissionId: job?.data.submissionId, err: error },
      'Evaluation failed',
    );
  });

  return worker;
}

/**
 * Submissions left mid-flight by a crash. Surfaced at boot so an operator can
 * see them rather than discovering them through a stuck client.
 */
export async function countStalledSubmissions(): Promise<number> {
  const rows = await db
    .select({ id: problemSubmissions.id })
    .from(problemSubmissions)
    .where(
      and(
        isNull(problemSubmissions.committedAt),
        ne(problemSubmissions.status, 'awaiting-review'),
        ne(problemSubmissions.status, 'failed'),
      ),
    );
  return rows.length;
}
