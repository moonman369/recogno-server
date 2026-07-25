import { closeDatabase, createLogger } from '@recogno/shared';
import { createPingWorker, enqueuePing, pingQueue } from './queues/ping.js';
import { closeRedis } from './redis.js';

const log = createLogger('worker');

async function main(): Promise<void> {
  const pingWorker = createPingWorker();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutting down worker');
    await pingWorker.close();
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

  await pingWorker.waitUntilReady();
  log.info({ queues: ['ping'] }, 'Worker ready');

  // Self-enqueue one job so a fresh boot visibly proves the pipeline works.
  await enqueuePing('hello from worker boot');
}

main().catch((error) => {
  log.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
