/**
 * Route protection. Exercises the guard through real requests rather than a URL
 * helper, because publicness now comes from the matched route's schema.
 */

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import auth, { isPublicPrefix } from '../src/plugins/auth.js';

async function buildGuarded() {
  const app = Fastify({ routerOptions: { ignoreTrailingSlash: true } });
  await app.register(await import('@fastify/jwt').then((m) => m.default), {
    secret: 'test-secret-that-is-at-least-32-characters',
  });
  await app.register(auth);

  // Public: declares `security: []`, exactly as /health and the sign-in routes do.
  app.get('/health', { schema: { security: [] } }, async () => ({ ok: true }));
  app.post('/auth/login', { schema: { security: [] } }, async () => ({ token: 'x' }));

  // Protected: no annotation, so the default applies.
  app.get('/decks', async (request) => ({ userId: request.userId }));
  app.get('/auth/me', async (request) => ({ userId: request.userId }));

  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildGuarded>>, url: string) =>
  app.inject({ method: 'GET', url });

describe('public routes', () => {
  it('lets a route through when its schema says security: []', async () => {
    const app = await buildGuarded();
    expect((await get(app, '/health')).statusCode).toBe(200);
    await app.close();
  });

  it('tolerates a trailing slash', async () => {
    // This is what actually broke: `/health/` used to answer 401.
    const app = await buildGuarded();
    expect((await get(app, '/health/')).statusCode).toBe(200);
    await app.close();
  });

  it('ignores the query string when deciding', async () => {
    const app = await buildGuarded();
    expect((await get(app, '/health?probe=1')).statusCode).toBe(200);
    await app.close();
  });

  it('allows a public POST as well as a public GET', async () => {
    const app = await buildGuarded();
    const response = await app.inject({ method: 'POST', url: '/auth/login' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe('protected routes', () => {
  it('rejects a route that declares no security annotation', async () => {
    const app = await buildGuarded();
    const response = await get(app, '/decks');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    await app.close();
  });

  it('protects the authenticated half of /auth', async () => {
    // A `/auth/` prefix rule would have exposed this.
    const app = await buildGuarded();
    expect((await get(app, '/auth/me')).statusCode).toBe(401);
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

  it('rejects a token this server did not sign', async () => {
    const app = await buildGuarded();
    const response = await app.inject({
      method: 'GET',
      url: '/decks',
      headers: { authorization: 'Bearer not.a.jwt' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe('unknown paths', () => {
  it('answers 404, not 401, so a typo is not mistaken for a permissions problem', async () => {
    const app = await buildGuarded();

    for (const url of ['/HEALTH', '/nope', '/decks/../secret', '/health/extra']) {
      const response = await get(app, url);
      expect(response.statusCode, `${url} should be 404`).toBe(404);
    }

    await app.close();
  });
});

describe('isPublicPrefix', () => {
  it('covers the docs bundle, which we do not define and cannot annotate', () => {
    expect(isPublicPrefix('/docs')).toBe(true);
    expect(isPublicPrefix('/docs/')).toBe(true);
    expect(isPublicPrefix('/docs/static/swagger-ui.css')).toBe(true);
    expect(isPublicPrefix('/docs/json')).toBe(true);
  });

  it('does not match a lookalike prefix', () => {
    expect(isPublicPrefix('/docsomething')).toBe(false);
    expect(isPublicPrefix('/')).toBe(false);
    expect(isPublicPrefix('/decks')).toBe(false);
  });
});
