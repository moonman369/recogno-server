/**
 * One-shot migration runner, baked into the API image.
 *
 * The deploy pipeline ships code but has no way to reach the database itself,
 * so a schema change used to land as a running API referencing tables that did
 * not exist yet (`42P01`). This closes that window: the deploy job runs this
 * against the freshly pulled image *before* starting the new containers, so the
 * schema is always at least as new as the code serving traffic.
 *
 * Deliberately a separate entrypoint rather than something `index.ts` does on
 * boot: migrations must run exactly once and must be able to fail the deploy,
 * whereas the API restarting for any reason should never re-enter DDL.
 *
 * `drizzle-orm` is a production dependency and carries this migrator, so none
 * of it drags `drizzle-kit` (a devDependency, deliberately stripped from the
 * runtime image) back in. Local development still uses `pnpm db:migrate`.
 */

import { fileURLToPath } from 'node:url';
import { closeDatabase, createLogger, db } from '@recogno/shared';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const log = createLogger('migrate');

/**
 * `dist/migrate.js` sits at `/app/dist`, and the Dockerfile copies the SQL to
 * `/app/drizzle` — so `../drizzle` resolves correctly inside the image.
 * `MIGRATIONS_DIR` overrides it for anything run outside that layout.
 */
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url));

try {
  log.info({ migrationsFolder }, 'Applying pending migrations');
  await migrate(db, { migrationsFolder });
  log.info('Schema is up to date');
} catch (error) {
  // A non-zero exit is the point: the deploy script runs under `set -e`, so a
  // failed migration stops the rollout instead of starting code against a
  // schema that cannot support it.
  log.error({ err: error }, 'Migration failed — deployment should not proceed');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
