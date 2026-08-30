import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../env.js';
import { createLogger } from '../logger.js';
import * as schema from './schema.js';

const log = createLogger('db');

/**
 * A direct TCP connection to Postgres, so the driver defaults hold: real
 * persistent connections and server-side prepared statements. Only a
 * transaction-pooling proxy in front (PgBouncer and friends) would force
 * `prepare: false` back on.
 *
 * TLS is decided entirely by the URL. postgres.js turns `?sslmode=require`
 * into a handshake with `rejectUnauthorized: false` — encrypted but with the
 * certificate unchecked, which is what a self-signed cert on the database host
 * needs — while a URL with no `sslmode` connects in the clear, which is what
 * same-docker-network and loopback deployments want. Deliberately no `ssl`
 * option here: any value passed in code outranks the URL, `undefined`
 * included, so setting it would silently disarm `sslmode=require`.
 */
export const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  // Sized for a database on the same host or LAN, which is always warm.
  // Reconnecting costs about a millisecond, while every idle connection holds
  // a server-side backend process against `max_connections` (100 by default,
  // shared with the worker, migrations and any psql session). 30s keeps a
  // connection across a burst of requests without hoarding the pool overnight.
  idle_timeout: 30,
  // Such a database either accepts at once or is down. 10s absorbs a container
  // restart while still surfacing a wrong host as an error rather than a hang.
  connect_timeout: 10,
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
