/**
 * Route protection. The database is mocked, so this exercises the guard itself
 * rather than the sign-in flow — that lives in the live end-to-end check.
 */

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import auth, { isPublicRoute } from '../src/plugins/auth.js';

describe('isPublicRoute', () => {
  it('allows sign-in and the health probe through', () => {
    for (const route of [
      '/',
      '/health',
      '/auth/providers',
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/google',
      '/auth/google/callback',
    ]) {
      expect(isPublicRoute(route), `${route} should be public`).toBe(true);
    }
  });

  it('serves the docs and their assets without a token', () => {
    expect(isPublicRoute('/docs')).toBe(true);
    expect(isPublicRoute('/docs/')).toBe(true);
    expect(isPublicRoute('/docs/static/swagger-ui.css')).toBe(true);
    expect(isPublicRoute('/docs/json')).toBe(true);
  });

  it('protects the authenticated half of /auth', () => {
    // A `/auth/` prefix rule would have exposed these.
    expect(isPublicRoute('/auth/me')).toBe(false);
    expect(isPublicRoute('/auth/logout-all')).toBe(false);
  });

  it('protects every feature route', () => {
    for (const route of [
      '/decks',
      '/decks/1',
      '/decks/1/problems',
      '/drill/next',
      '/drill/submit',
      '/drill/due-count',
      '/review/queue',
      '/review/due-count',
      '/submissions/abc',
      '/problems/1/submissions',
    ]) {
      expect(isPublicRoute(route), `${route} should be protected`).toBe(false);
    }
  });

  it('does not treat a lookalike prefix as public', () => {
    expect(isPublicRoute('/docsomething')).toBe(false);
    expect(isPublicRoute('/healthz')).toBe(false);
    expect(isPublicRoute('/authorise')).toBe(false);
  });
});

async function buildGuarded() {
  const app = Fastify();
  await app.register(await import('@fastify/jwt').then((m) => m.default), {
    secret: 'test-secret-that-is-at-least-32-characters',
  });
  await app.register(auth);
  app.get('/decks', async (request) => ({ userId: request.userId }));
  app.get('/health', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('the guard', () => {
  it('rejects a protected route with no Authorization header', async () => {
    const app = await buildGuarded();
    const response = await app.inject({ method: 'GET', url: '/decks' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    await app.close();
  });

  it('rejects a malformed or non-bearer Authorization header', async () => {
    const app = await buildGuarded();

    for (const header of ['Basic abc123', 'Bearer', 'Bearer   ', 'token abc']) {
      const response = await app.inject({
        method: 'GET',
        url: '/decks',
        headers: { authorization: header },
      });
      expect(response.statusCode, `"${header}" should be rejected`).toBe(401);
    }

    await app.close();
  });

  it('rejects a token that is not signed by this server', async () => {
    const app = await buildGuarded();
    const response = await app.inject({
      method: 'GET',
      url: '/decks',
      headers: { authorization: 'Bearer not.a.jwt' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lets a public route through untouched', async () => {
    const app = await buildGuarded();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
