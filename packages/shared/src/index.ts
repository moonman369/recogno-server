export {
  checkDatabaseConnection,
  client,
  closeDatabase,
  type Database,
  db,
  schema,
} from './db/index.js';
export * from './db/schema.js';
export {
  areCloseFamily,
  CANONICAL_PATTERNS,
  CLOSE_FAMILIES,
  isPatternSlug,
  PATTERN_SLUGS,
  type PatternSlug,
} from './domain/patterns.js';
export { type Env, env, envSchema, isProduction, isTest, parseEnv } from './env.js';
export { createLogger, type Logger, logger } from './logger.js';
export type { HealthResponse, JwtPayload } from './types.js';
