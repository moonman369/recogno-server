import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/recogno',
  REDIS_URL: 'redis://localhost:6379',
  GEMINI_API_KEY: 'gemini',
  GROQ_API_KEY: 'groq',
  TELEGRAM_BOT_TOKEN: 'telegram',
  JWT_SECRET: 'a'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a fully populated environment', () => {
    expect(parseEnv(validEnv)).toMatchObject({
      NODE_ENV: 'test',
      DATABASE_URL: validEnv.DATABASE_URL,
    });
  });

  it('defaults NODE_ENV to development', () => {
    const { NODE_ENV: _omitted, ...rest } = validEnv;
    expect(parseEnv(rest).NODE_ENV).toBe('development');
  });

  it('throws when a required variable is missing', () => {
    const { GEMINI_API_KEY: _omitted, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow(/GEMINI_API_KEY/);
  });

  it('throws when a connection string is not a valid URL', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });
});
