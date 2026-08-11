export {
  checkDatabaseConnection,
  client,
  closeDatabase,
  type Database,
  db,
  schema,
} from './db/index.js';
export * from './db/schema.js';
export { SYSTEM_DECKS, systemDeckSlugForPattern } from './domain/decks.js';
export {
  GRADATION_CRITERIA,
  GRADATION_LABELS,
  GRADATION_SCORES,
  GRADATIONS,
  type Gradation,
  isGradation,
  parseGradation,
} from './domain/gradation.js';
export {
  areCloseFamily,
  CANONICAL_PATTERNS,
  type CanonicalPattern,
  CLOSE_FAMILIES,
  isPatternSlug,
  PATTERN_CATEGORIES,
  PATTERN_SLUGS,
  type PatternCategory,
  type PatternSlug,
  patternsByCategory,
} from './domain/patterns.js';
export {
  deriveProblemIdentity,
  detectProblemSource,
  type ProblemIdentity,
  slugFromUrl,
  slugify,
  titleFromSlug,
} from './domain/problemInput.js';
export {
  type Env,
  env,
  envSchema,
  isEmailConfigured,
  isGoogleOAuthConfigured,
  isProduction,
  isTest,
  parseEnv,
} from './env.js';
export {
  GEMINI_MODEL,
  type GeneratedText,
  type GenerateTextOptions,
  generateText,
  parseJsonResponse,
} from './llm/gemini.js';
export { createLogger, type Logger, logger } from './logger.js';
export { closeRedis, getRedisConnection } from './queue/connection.js';
export {
  closeSubmissionEvaluationQueue,
  enqueueSubmissionEvaluation,
  getSubmissionEvaluationQueue,
  SUBMISSION_EVALUATION_QUEUE,
  type SubmissionEvaluationJobData,
} from './queue/submissions.js';
export type { HealthResponse, JwtPayload } from './types.js';
