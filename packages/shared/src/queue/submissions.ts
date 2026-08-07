/**
 * The submission-evaluation queue, defined once so the API (producer) and the
 * worker (consumer) cannot disagree about its name or payload shape.
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export const SUBMISSION_EVALUATION_QUEUE = 'submission-evaluation';

export interface SubmissionEvaluationJobData {
  submissionId: string;
}

let queue: Queue<SubmissionEvaluationJobData> | undefined;

export function getSubmissionEvaluationQueue(): Queue<SubmissionEvaluationJobData> {
  queue ??= new Queue<SubmissionEvaluationJobData>(SUBMISSION_EVALUATION_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 200 },
      // Keep failures around: a submission stuck in `failed` needs diagnosing.
      removeOnFail: { count: 500 },
    },
  });
  return queue;
}

export async function enqueueSubmissionEvaluation(
  data: SubmissionEvaluationJobData,
): Promise<string | undefined> {
  const job = await getSubmissionEvaluationQueue().add('evaluate', data, {
    // The submission id doubles as the job id, so a double-submit cannot queue
    // the same evaluation twice.
    jobId: data.submissionId,
  });
  return job.id;
}

export async function closeSubmissionEvaluationQueue(): Promise<void> {
  if (!queue) return;
  const current = queue;
  queue = undefined;
  await current.close();
}
