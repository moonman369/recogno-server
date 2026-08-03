/**
 * Shared Redis connection for BullMQ.
 *
 * Lives in `shared` rather than `worker` because the API is now a producer: it
 * enqueues submission evaluations. Both sides must agree on connection options
 * or BullMQ misbehaves in ways that only show up under load.
 *
 * Everything is lazy. Importing this module — which the shared barrel does —
 * must not open a socket, or every CLI script and unit test would connect to
 * Redis just by touching `@recogno/shared`.
 */

import { Redis } from 'ioredis';
import { env } from '../env.js';

let connection: Redis | undefined;

export function getRedisConnection(): Redis {
  connection ??= new Redis(env.REDIS_URL, {
    // Required by BullMQ for connections used by workers.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return connection;
}

export async function closeRedis(): Promise<void> {
  if (!connection) return;
  const current = connection;
  connection = undefined;
  await current.quit();
}
