import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import stubAuth, { STUB_USER_ID, USER_ID_HEADER } from '../src/plugins/auth.js';

async function buildProbe() {
  const app = Fastify();
  await app.register(stubAuth);
  app.get('/whoami', async (request) => ({ userId: request.userId }));
  await app.ready();
  return app;
}

describe('stub auth', () => {
  it('falls back to the development user when no header is sent', async () => {
    const app = await buildProbe();
    const response = await app.inject({ method: 'GET', url: '/whoami' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: STUB_USER_ID });
    await app.close();
  });

  it('uses the caller-supplied id', async () => {
    const app = await buildProbe();
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { [USER_ID_HEADER]: userId },
    });

    expect(response.json()).toEqual({ userId });
    await app.close();
  });

  it('accepts well-formed ids that fail the strict RFC version/variant check', async () => {
    const app = await buildProbe();

    for (const userId of [STUB_USER_ID, '11111111-2222-3333-4444-555555555555']) {
      const response = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { [USER_ID_HEADER]: userId },
      });
      expect(response.statusCode, `${userId} should be accepted`).toBe(200);
      expect(response.json()).toEqual({ userId });
    }

    await app.close();
  });

  it('rejects an id that is not a UUID at all', async () => {
    const app = await buildProbe();
    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { [USER_ID_HEADER]: 'not-a-uuid' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
