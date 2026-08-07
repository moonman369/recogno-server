import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../env.js';
import { createLogger } from '../logger.js';
import * as schema from './schema.js';

const log = createLogger('db');

/**
 * Neon serves connections through a pooler, which cannot hold server-side
 * prepared statements — hence `prepare: false`.
 */
export const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  // Neon suspends an idle compute and takes several seconds to wake. Holding
  // connections a little longer avoids paying that cost between quick requests,
  // and 30s of patience covers a cold start that 10s would have aborted.
  idle_timeout: 60,
  connect_timeout: 30,
  prepare: false,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

/** Round-trips a `SELECT 1` to prove the database is reachable. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    log.error({ err: error }, 'Database health check failed');
    return false;
  }
}

/** Closes the connection pool. Call from a service's shutdown handler. */
export async function closeDatabase(): Promise<void> {
  await client.end({ timeout: 5 });
}

export { schema };
