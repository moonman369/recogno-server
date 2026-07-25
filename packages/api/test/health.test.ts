import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppInstance } from '../src/app.js';

const checkDatabaseConnection = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, checkDatabaseConnection };
});

const { buildApp } = await import('../src/app.js');

describe('GET /health', () => {
  let app: AppInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    vi.resetAllMocks();
    await app.close();
  });

  it('reports ok when the database answers', async () => {
    checkDatabaseConnection.mockResolvedValue(true);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, db: true });
  });

  it('reports 503 when the database is unreachable', async () => {
    checkDatabaseConnection.mockResolvedValue(false);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, db: false });
  });
});
