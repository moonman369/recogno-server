import { closeDatabase, closeRedis, createLogger } from '@recogno/shared';
import { createPingWorker, enqueuePing, pingQueue } from './queues/ping.js';
import {
  countStalledSubmissions,
  createSubmissionEvaluationWorker,
} from './queues/submissionEvaluation.js';

const log = createLogger('worker');

async function main(): Promise<void> {
  const pingWorker = createPingWorker();
  const submissionWorker = createSubmissionEvaluationWorker();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutting down worker');
    await Promise.all([pingWorker.close(), submissionWorker.close()]);
    await pingQueue.close();
    await closeRedis();
    await closeDatabase();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  await Promise.all([pingWorker.waitUntilReady(), submissionWorker.waitUntilReady()]);

  const stalled = await countStalledSubmissions();
  if (stalled > 0) {
    log.warn({ stalled }, 'Submissions were left mid-flight by a previous run');
  }

  log.info({ queues: ['ping', 'submission-evaluation'] }, 'Worker ready');

  // Self-enqueue one job so a fresh boot visibly proves the pipeline works.
  await enqueuePing('hello from worker boot');
}

main().catch((error) => {
  log.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
