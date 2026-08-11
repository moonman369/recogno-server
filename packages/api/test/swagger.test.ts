import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppInstance } from '../src/app.js';
import { DOCS_ROUTE_PREFIX, DOCS_URL } from '../src/plugins/swagger.js';

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, checkDatabaseConnection: vi.fn().mockResolvedValue(true) };
});

const { buildApp } = await import('../src/app.js');

type Json = Record<string, unknown>;

/** Walks the spec, failing the test with the path so far if a hop is missing. */
function at(root: unknown, ...path: (string | number)[]): Json {
  let node: unknown = root;
  const walked: (string | number)[] = [];

  for (const key of path) {
    walked.push(key);
    if (node === null || typeof node !== 'object') {
      throw new Error(`Spec has no object at ${walked.join('.')}`);
    }
    node = (node as Json)[String(key)];
  }

  if (node === null || typeof node !== 'object') {
    throw new Error(`Spec has no object at ${walked.join('.')}`);
  }
  return node as Json;
}

const jsonSchemaOf = (spec: unknown, route: string, method: string, ...rest: string[]): Json =>
  at(spec, 'paths', route, method, ...rest, 'content', 'application/json', 'schema');

describe('swagger', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('redirects the bare root to the docs', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(DOCS_URL);
  });

  it('redirects /docs to /docs/, whose relative assets are the only ones that resolve', async () => {
    const response = await app.inject({ method: 'GET', url: DOCS_ROUTE_PREFIX });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(DOCS_URL);
  });

  it('serves the Swagger UI', async () => {
    const response = await app.inject({ method: 'GET', url: DOCS_URL });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('serves the UI assets the page actually references', async () => {
    for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-initializer.js']) {
      const response = await app.inject({ method: 'GET', url: `${DOCS_URL}static/${asset}` });
      expect(response.statusCode, `${asset} should be served`).toBe(200);
    }
  });

  it('publishes an OpenAPI 3.1 document covering every route', () => {
    const spec = app.swagger() as Json;

    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(at(spec, 'paths')).sort()).toEqual([
      '/auth/forgot-password',
      '/auth/google',
      '/auth/google/callback',
      '/auth/login',
      '/auth/logout',
      '/auth/logout-all',
      '/auth/me',
      '/auth/providers',
      '/auth/refresh',
      '/auth/register',
      '/auth/reset-password',
      '/auth/verify-email/confirm',
      '/auth/verify-email/request',
      '/decks',
      '/decks/{deckId}',
      '/decks/{deckId}/problems',
      '/drill/due-count',
      '/drill/next',
      '/drill/submit',
      '/health',
      '/problems/{problemId}/submissions',
      '/review/due-count',
      '/review/queue',
      '/submissions/{submissionId}',
      '/submissions/{submissionId}/commit',
    ]);
  });

  it('documents the submission pipeline stages a client polls for', () => {
    const ok = jsonSchemaOf(
      app.swagger(),
      '/submissions/{submissionId}',
      'get',
      'responses',
      '200',
    );
    const stages = at(ok, 'properties', 'stages', 'items', 'properties');

    expect(Object.keys(stages).sort()).toEqual([
      'detail',
      'finishedAt',
      'position',
      'stage',
      'startedAt',
      'status',
    ]);
  });

  it('converts the Zod body schema into JSON Schema rather than leaking Zod internals', () => {
    const body = jsonSchemaOf(app.swagger(), '/drill/submit', 'post', 'requestBody');

    expect(body.type).toBe('object');
    // The three guess fields are each optional; a refinement requires one of them.
    expect((body.required as string[]).slice().sort()).toEqual([
      'problemId',
      'rationaleText',
      'timeTakenSeconds',
    ]);
    expect(Object.keys(at(body, 'properties')).sort()).toEqual([
      'guessedPatternId',
      'guessedPatternIds',
      'guessedPatternSlugs',
      'problemId',
      'rationaleText',
      'timeTakenSeconds',
    ]);
    expect(at(body, 'properties', 'guessedPatternIds')).toMatchObject({
      type: 'array',
      maxItems: 5,
    });
    // The bounds that actually validate requests must show up in the docs.
    expect(at(body, 'properties', 'rationaleText')).toMatchObject({
      type: 'string',
      maxLength: 4000,
    });
  });

  it('documents responses without a dangling JSON Schema dialect declaration', () => {
    const ok = jsonSchemaOf(app.swagger(), '/drill/next', 'get', 'responses', '200');

    expect(ok.$schema).toBeUndefined();
    expect(Object.keys(at(ok, 'properties')).sort()).toEqual([
      'dueAt',
      'patternOptions',
      'problem',
      'source',
    ]);
  });

  it('keeps the answer out of the documented /drill/next payload', () => {
    const ok = jsonSchemaOf(app.swagger(), '/drill/next', 'get', 'responses', '200');
    const problem = Object.keys(at(ok, 'properties', 'problem', 'properties'));

    expect(problem).not.toContain('patternId');
    expect(problem).not.toContain('tell');
    expect(problem).toContain('constraints');
  });

  it('hides the root redirect from the published spec', () => {
    expect(at(app.swagger(), 'paths')['/']).toBeUndefined();
  });

  it('documents bearer auth as the global scheme', () => {
    const spec = app.swagger() as Json;

    expect(at(spec, 'components', 'securitySchemes', 'bearerAuth')).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it('marks the sign-in routes as needing no token', () => {
    const spec = app.swagger() as Json;

    const publicOperations: [string, string][] = [
      ['/auth/login', 'post'],
      ['/auth/register', 'post'],
      ['/auth/refresh', 'post'],
      ['/auth/logout', 'post'],
      ['/auth/providers', 'get'],
      ['/auth/google', 'get'],
      ['/auth/google/callback', 'get'],
    ];

    for (const [route, method] of publicOperations) {
      expect(at(spec, 'paths', route, method).security, `${method} ${route}`).toEqual([]);
    }
  });

  it('leaves the authenticated routes on the global requirement', () => {
    const spec = app.swagger() as Json;
    // No per-operation override means the global `security` applies.
    expect(at(spec, 'paths', '/auth/me', 'get').security).toBeUndefined();
    expect(at(spec, 'paths', '/decks', 'get').security).toBeUndefined();
  });
});
