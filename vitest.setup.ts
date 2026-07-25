/**
 * Tests must never depend on a developer's real `.env`, and importing anything
 * from `@recogno/shared` eagerly validates the environment. Seed placeholder
 * values so that validation passes deterministically everywhere (including CI).
 * Real values are never needed: tests that touch the DB or Redis mock them.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://recogno:recogno@localhost:5432/recogno_test',
  REDIS_URL: 'redis://localhost:6379',
  GEMINI_API_KEY: 'test-gemini-key',
  GROQ_API_KEY: 'test-groq-key',
  TELEGRAM_BOT_TOKEN: 'test-telegram-token',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
