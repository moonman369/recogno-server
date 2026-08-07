/**
 * Creating and reading problem submissions.
 *
 * Shared by "add a problem to a deck" (which creates the first submission) and
 * "review this problem again" (which creates another one). Both paths are
 * identical once the problem row exists.
 */

import {
  db,
  enqueueSubmissionEvaluation,
  GRADATION_LABELS,
  type Gradation,
  problemSubmissions,
  problems,
  submissionStages,
} from '@recogno/shared';
import { and, asc, desc, eq } from 'drizzle-orm';

/**
 * A resolve stage only exists when there is genuinely something to fetch: the
 * problem came from a link or a slug and we still have no statement for it.
 * Free-text problems, and ones already resolved, go straight to evaluation.
 */
export function needsSourceResolution(problem: {
  source: string;
  statement: string | null;
}): boolean {
  if (problem.source !== 'link' && problem.source !== 'slug') return false;
  return problem.statement === null || problem.statement.trim().length === 0;
}

export interface CreateSubmissionInput {
  userId: string;
  problemId: number;
  noteText: string;
  solutionText: string;
  withSourceResolution: boolean;
}

/**
 * Enqueueing must not outlive a human's patience. ioredis buffers commands while
 * disconnected and BullMQ needs `maxRetriesPerRequest: null` on this connection,
 * so without a bound the request hangs forever when Redis is down.
 */
const ENQUEUE_TIMEOUT_MS = 5_000;

/** Thrown when the submission was stored but could not be queued for evaluation. */
export class SubmissionQueueUnavailableError extends Error {
  constructor(
    readonly submissionId: string,
    readonly reason: string,
  ) {
    super(`Submission ${submissionId} was saved but could not be queued: ${reason}`);
    this.name = 'SubmissionQueueUnavailableError';
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Writes the submission and its stage rows in one transaction, then enqueues.
 * Enqueueing after the commit means the worker can never pick up a job whose
 * rows are not yet visible.
 */
export async function createSubmission(input: CreateSubmissionInput): Promise<string> {
  const submissionId = await db.transaction(async (tx) => {
    const [submission] = await tx
      .insert(problemSubmissions)
      .values({
        userId: input.userId,
        problemId: input.problemId,
        noteText: input.noteText,
        solutionText: input.solutionText,
        status: 'queued',
      })
      .returning({ id: problemSubmissions.id });

    if (!submission) throw new Error('Failed to create submission');

    const stages = input.withSourceResolution
      ? ([
          { stage: 'resolve-source' as const, position: 1 },
          { stage: 'evaluate' as const, position: 2 },
        ] as const)
      : ([{ stage: 'evaluate' as const, position: 1 }] as const);

    await tx
      .insert(submissionStages)
      .values(
        stages.map((s) => ({ submissionId: submission.id, stage: s.stage, position: s.position })),
      );

    return submission.id;
  });

  try {
    await withTimeout(
      enqueueSubmissionEvaluation({ submissionId }),
      ENQUEUE_TIMEOUT_MS,
      'Enqueueing the evaluation',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The note and solution are already stored, so mark the submission failed
    // rather than leaving it stuck at `queued` waiting on a job that was never
    // created. The learner can still commit it with an explicit gradation.
    await db
      .update(problemSubmissions)
      .set({
        status: 'failed',
        failureReason: `Could not queue the evaluation: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(problemSubmissions.id, submissionId));

    throw new SubmissionQueueUnavailableError(submissionId, message);
  }

  return submissionId;
}

export interface SubmissionView {
  id: string;
  problemId: number;
  problemTitle: string;
  status: string;
  failureReason: string | null;
  noteText: string;
  solutionText: string;
  stages: {
    stage: string;
    status: string;
    position: number;
    detail: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }[];
  evaluation: {
    gradation: Gradation;
    label: string;
    approachSummary: string;
    missed: string;
    optimizations: string;
    model: string | null;
  } | null;
  finalGradation: Gradation | null;
  overridden: boolean;
  committedAt: Date | null;
  createdAt: Date;
}

function toView(
  row: typeof problemSubmissions.$inferSelect & { problemTitle: string },
  stages: SubmissionView['stages'],
): SubmissionView {
  return {
    id: row.id,
    problemId: row.problemId,
    problemTitle: row.problemTitle,
    status: row.status,
    failureReason: row.failureReason,
    noteText: row.noteText,
    solutionText: row.solutionText,
    stages,
    evaluation: row.aiGradation
      ? {
          gradation: row.aiGradation,
          label: GRADATION_LABELS[row.aiGradation],
          approachSummary: row.aiApproachSummary ?? '',
          missed: row.aiMissed ?? '',
          optimizations: row.aiOptimizations ?? '',
          model: row.aiModel,
        }
      : null,
    finalGradation: row.finalGradation,
    overridden: row.overridden,
    committedAt: row.committedAt,
    createdAt: row.createdAt,
  };
}

/** Scoped to the owner: a submission is private to the user who wrote it. */
export async function getSubmission(
  userId: string,
  submissionId: string,
): Promise<SubmissionView | undefined> {
  const [row] = await db
    .select({ submission: problemSubmissions, problemTitle: problems.title })
    .from(problemSubmissions)
    .innerJoin(problems, eq(problems.id, problemSubmissions.problemId))
    .where(and(eq(problemSubmissions.id, submissionId), eq(problemSubmissions.userId, userId)))
    .limit(1);

  if (!row) return undefined;

  const stages = await db
    .select({
      stage: submissionStages.stage,
      status: submissionStages.status,
      position: submissionStages.position,
      detail: submissionStages.detail,
      startedAt: submissionStages.startedAt,
      finishedAt: submissionStages.finishedAt,
    })
    .from(submissionStages)
    .where(eq(submissionStages.submissionId, submissionId))
    .orderBy(asc(submissionStages.position));

  return toView({ ...row.submission, problemTitle: row.problemTitle }, stages);
}

/** Newest first — the history of how an approach improved. */
export async function listSubmissionsForProblem(
  userId: string,
  problemId: number,
): Promise<SubmissionView[]> {
  const rows = await db
    .select({ submission: problemSubmissions, problemTitle: problems.title })
    .from(problemSubmissions)
    .innerJoin(problems, eq(problems.id, problemSubmissions.problemId))
    .where(and(eq(problemSubmissions.userId, userId), eq(problemSubmissions.problemId, problemId)))
    .orderBy(desc(problemSubmissions.createdAt));

  if (rows.length === 0) return [];

  const allStages = await db
    .select({
      submissionId: submissionStages.submissionId,
      stage: submissionStages.stage,
      status: submissionStages.status,
      position: submissionStages.position,
      detail: submissionStages.detail,
      startedAt: submissionStages.startedAt,
      finishedAt: submissionStages.finishedAt,
    })
    .from(submissionStages)
    .orderBy(asc(submissionStages.position));

  const stagesBySubmission = new Map<string, SubmissionView['stages']>();
  for (const { submissionId, ...stage } of allStages) {
    const list = stagesBySubmission.get(submissionId) ?? [];
    list.push(stage);
    stagesBySubmission.set(submissionId, list);
  }

  return rows.map((row) =>
    toView(
      { ...row.submission, problemTitle: row.problemTitle },
      stagesBySubmission.get(row.submission.id) ?? [],
    ),
  );
}
