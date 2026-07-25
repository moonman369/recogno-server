# recogno-server

Backend for **Recogno**, a spaced-repetition DSA / system-design prep app.

pnpm monorepo, Node 22, TypeScript strict mode.

| Package            | What it is                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `packages/api`     | Fastify HTTP service (CORS, JWT, Zod validation, `ts-fsrs` for the SRS) |
| `packages/worker`  | BullMQ consumers and cron jobs (Gemini + Groq clients)                  |
| `packages/shared`  | Drizzle schema, validated env config, Pino logger, shared types         |

`@recogno/shared` is consumed directly from source — there is no build step for it, and
`api`/`worker` bundle it in when they build.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in the values
```

Every variable in `.env.example` is required. The Zod schema in
`packages/shared/src/env.ts` validates them at boot and throws a listing every
problem if anything is missing or malformed. Real environment variables always
win over `.env`, so Docker and CI need no file at all.

## Scripts

| Command             | Effect                                              |
| ------------------- | --------------------------------------------------- |
| `pnpm dev:api`      | Fastify with watch mode; `GET /health` queries the DB |
| `pnpm dev:worker`   | BullMQ worker; self-enqueues one `ping` job on boot   |
| `pnpm db:generate`  | Generate a migration from the Drizzle schema          |
| `pnpm db:migrate`   | Apply pending migrations                              |
| `pnpm test`         | Vitest                                                |
| `pnpm lint`         | Biome lint + format check (`lint:fix` to write)       |
| `pnpm typecheck`    | `tsc --noEmit` in every package                       |
| `pnpm build`        | Bundle `api` and `worker` into their `dist/`          |

`GET /health` returns `{ "ok": true, "db": true }` on success, and `503` with
`{ "ok": false, "db": false }` if the `SELECT 1` fails.

## Database

Postgres 18 on [Neon](https://neon.tech). The pooled connection means prepared
statements are disabled (`prepare: false` in `packages/shared/src/db/index.ts`).

Schema lives in `packages/shared/src/db/schema.ts` — currently empty, no feature
tables yet.

## Docker

Scaffolded, not production-hardened.

```bash
docker compose -f docker/compose.yml up --build
```

Brings up `api`, `worker`, and `redis`. Postgres is commented out in
`docker/compose.yml` since the database is hosted on Neon.

## CI

`.github/workflows/ci.yml` runs install → `pnpm lint` → `pnpm typecheck` →
`pnpm test` on every pull request and on pushes to `main`.
