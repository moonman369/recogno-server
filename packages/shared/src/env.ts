import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { z } from 'zod';

/**
 * Every service reads the same `.env` at the repo root, but each one runs with a
 * different cwd (`packages/api`, `packages/worker`, ...). Walk up until we find it.
 *
 * `process.loadEnvFile` never overwrites variables that are already set, so real
 * environment variables (Docker, CI, hosting provider) always win over the file.
 */
function loadDotEnv(): void {
  let dir = process.cwd();
  const { root } = parse(dir);

  while (true) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    if (dir === root) return;
    dir = dirname(dir);
  }
}

/** A secret that must be present and non-empty, reported by its own variable name. */
function secret(name: string, minLength = 1) {
  return z
    .string({ error: `${name} is required` })
    .min(minLength, `${name} must be at least ${minLength} characters`);
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ error: 'DATABASE_URL must be a valid Postgres connection string' }),
  REDIS_URL: z.url({ error: 'REDIS_URL must be a valid Redis connection string' }),
  GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  GROQ_API_KEY: secret('GROQ_API_KEY'),
  TELEGRAM_BOT_TOKEN: secret('TELEGRAM_BOT_TOKEN'),
  JWT_SECRET: secret('JWT_SECRET', 32),

  // Google sign-in is optional: the routes register only when both halves are
  // present, so a missing credential disables that provider instead of
  // preventing the whole API from booting.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  /** Where to send the browser after a successful OAuth callback. */
  OAUTH_SUCCESS_REDIRECT: z.url().optional(),

  /**
   * Where the frontend lives. Verification and password-reset emails link to
   * pages there, not to this API — the token is consumed by a POST the page
   * makes, so the link must open the app.
   */
  APP_BASE_URL: z.url().default('http://localhost:5173'),
  /**
   * Transactional email, optional like Google. Without a key the API still
   * issues tokens and reports success; outside production it logs the link so
   * local development needs no mail provider at all.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('Recogno <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate an arbitrary environment object. Exported so tests can exercise the
 * schema without touching `process.env`.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

loadDotEnv();

/** Validated environment. Importing this module throws at boot if anything is missing. */
export const env: Env = parseEnv();

/** True only when both halves of the Google credential are configured. */
export const isGoogleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** True when outbound email can actually be delivered rather than only logged. */
export const isEmailConfigured = Boolean(env.RESEND_API_KEY);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
