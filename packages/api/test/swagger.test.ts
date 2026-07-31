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

  it('publishes an OpenAPI 3.1 document covering every drill route', () => {
    const spec = app.swagger() as Json;

    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(at(spec, 'paths')).sort()).toEqual([
      '/drill/due-count',
      '/drill/next',
      '/drill/submit',
      '/health',
    ]);
  });

  it('converts the Zod body schema into JSON Schema rather than leaking Zod internals', () => {
    const body = jsonSchemaOf(app.swagger(), '/drill/submit', 'post', 'requestBody');

    expect(body.type).toBe('object');
    expect((body.required as string[]).slice().sort()).toEqual([
      'guessedPatternId',
      'problemId',
      'rationaleText',
      'timeTakenSeconds',
    ]);
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
});
