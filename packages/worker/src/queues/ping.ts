import { createLogger } from '@recogno/shared';
import { type Job, Queue, Worker } from 'bullmq';
import { connection } from '../redis.js';

const log = createLogger('queue:ping');

export const PING_QUEUE = 'ping';

export interface PingJobData {
  message: string;
  enqueuedAt: string;
}

export interface PingJobResult {
  echoedAt: string;
}

export const pingQueue = new Queue<PingJobData, PingJobResult>(PING_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export async function enqueuePing(message: string): Promise<void> {
  const job = await pingQueue.add('ping', { message, enqueuedAt: new Date().toISOString() });
  log.info({ jobId: job.id, message }, 'Enqueued ping job');
}

export function createPingWorker(): Worker<PingJobData, PingJobResult> {
  const worker = new Worker<PingJobData, PingJobResult>(
    PING_QUEUE,
    async (job: Job<PingJobData, PingJobResult>) => {
      log.info({ jobId: job.id, data: job.data }, 'Processing ping job');
      return { echoedAt: new Date().toISOString() };
    },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job, result) => {
    log.info({ jobId: job.id, result }, 'Ping job completed');
  });

  worker.on('failed', (job, error) => {
    log.error({ jobId: job?.id, err: error }, 'Ping job failed');
  });

  return worker;
}
