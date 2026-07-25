import { type Logger, pino } from 'pino';
import { env, isProduction } from './env.js';

const baseLogger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProduction ? 'info' : 'debug',
  // Structured JSON in production; human-readable output while developing.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export const logger = baseLogger;

/** Child logger tagged with the service that emitted the line. */
export function createLogger(service: string): Logger {
  return baseLogger.child({ service });
}

export type { Logger };
