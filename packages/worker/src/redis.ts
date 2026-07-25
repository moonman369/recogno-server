import { env } from '@recogno/shared';
import { Redis } from 'ioredis';

/**
 * Shared ioredis connection for every BullMQ queue and worker.
 * BullMQ requires `maxRetriesPerRequest: null` on connections used by workers.
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export async function closeRedis(): Promise<void> {
  await connection.quit();
}
