/**
 * One error handler for the whole API.
 *
 * Without this, a database failure reaches the client as an opaque 500 and
 * reaches the log as drizzle's `Failed query: ...` wrapper — which prints the
 * SQL and the parameters but not the reason it failed. The real Postgres error
 * sits on `error.cause`, so unwrap it before logging.
 */

import { createLogger, isProduction } from '@recogno/shared';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const log = createLogger('http');

/**
 * Postgres/driver conditions that mean "try again shortly" rather than "your
 * request was wrong" — most often a Neon compute that had suspended while idle.
 */
const TRANSIENT_DB_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_DESTROYED',
  'CONNECTION_ENDED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

interface CauseLike {
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
  routine?: string;
}

/** Walks the `cause` chain to the deepest error, which is the one that explains. */
function rootCause(error: unknown): CauseLike | undefined {
  let current: unknown = error;
  let deepest: CauseLike | undefined;

  for (let hops = 0; hops < 5 && current instanceof Error; hops += 1) {
    const next: unknown = (current as { cause?: unknown }).cause;
    if (!(next instanceof Error)) break;
    deepest = next as CauseLike;
    current = next;
  }

  return deepest;
}

const errorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((rawError, request, reply) => {
    const error = rawError as FastifyError;

    // Schema validation failures are already meaningful; leave them alone.
    if (error.validation) {
      return reply.code(error.statusCode ?? 400).send({
        error: error.message,
        code: 'VALIDATION_ERROR',
      });
    }

    const status = error.statusCode ?? 500;

    // Anything the routes raised deliberately (403, 404, 409, ...) passes through.
    if (status < 500) {
      return reply.code(status).send({ error: error.message });
    }

    const cause = rootCause(error);
    const code = cause?.code ?? (error as CauseLike).code;
    const transient = code !== undefined && TRANSIENT_DB_CODES.has(code);

    log.error(
      {
        method: request.method,
        url: request.url,
        // The reason, which drizzle's own message omits.
        cause: cause?.message ?? error.message,
        code,
        detail: cause?.detail,
        hint: cause?.hint,
        err: error,
      },
      transient ? 'Database temporarily unavailable' : 'Unhandled error',
    );

    if (transient) {
      return reply.code(503).send({
        error:
          'The database is temporarily unavailable. If it is hosted on Neon it may have been ' +
          'suspended while idle; retry in a few seconds.',
        code,
      });
    }

    return reply.code(500).send({
      error: 'Internal server error',
      code,
      // The cause is the whole point of this handler; withhold it only in production.
      ...(isProduction ? {} : { cause: cause?.message ?? error.message }),
    });
  });
};

export default fp(errorHandler, { name: 'error-handler' });
