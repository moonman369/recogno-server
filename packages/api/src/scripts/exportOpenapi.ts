/**
 * Writes the OpenAPI document to a file for handing to client repos.
 *
 * Builds the Fastify app and reads the same spec `/docs/json` serves, so the
 * file can never disagree with the running server. No database or Redis
 * connection is opened.
 *
 *   pnpm openapi:export            # -> openapi.json at the repo root
 *   pnpm openapi:export -- path.json
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLogger } from '@recogno/shared';
import { buildApp } from '../app.js';

const log = createLogger('openapi-export');

const DEFAULT_OUTPUT = resolve(process.cwd(), '../../openapi.json');

async function main(): Promise<void> {
  const target = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_OUTPUT;

  const app = await buildApp();
  await app.ready();

  const spec = app.swagger();
  await app.close();

  await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  const paths = Object.keys((spec as { paths: Record<string, unknown> }).paths).length;
  log.info({ target, paths }, 'Wrote OpenAPI document');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    log.error({ err: error }, 'Failed to export the OpenAPI document');
    process.exit(1);
  });
