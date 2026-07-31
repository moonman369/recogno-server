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
| `pnpm db:seed`      | Upsert the pattern taxonomy + fixture problem bank    |
| `pnpm test`         | Vitest                                                |
| `pnpm lint`         | Biome lint + format check (`lint:fix` to write)       |
| `pnpm typecheck`    | `tsc --noEmit` in every package                       |
| `pnpm build`        | Bundle `api` and `worker` into their `dist/`          |

`GET /health` returns `{ "ok": true, "db": true }` on success, and `503` with
`{ "ok": false, "db": false }` if the `SELECT 1` fails.

## API docs

Start the API and open <http://localhost:3000> — the bare root redirects to
`/docs/`, which serves interactive Swagger UI. The raw OpenAPI 3.1 document is at
`/docs/json`.

The spec is generated from the same Zod schemas that validate requests at
runtime (converted with Zod 4's native `z.toJSONSchema`), so the docs cannot
drift from the code. Response schemas live in `packages/api/src/routes/schemas.ts`
and are documentation-only — the serializer is a passthrough, so a wrong schema
can never drop a field or break a working endpoint.

Use the **Authorize** button to set an `x-user-id` and drill as different users.

## The drill loop (F1.1–F1.4)

| Route                  | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `GET /drill/next`      | A problem to recognise — statement, constraints and the pattern menu only |
| `POST /drill/submit`   | Grades a guess, advances the FSRS card, reveals the tell                  |
| `GET /drill/due-count` | `{ dueCount, nextDueAt }` for the "X reps due today" badge                |

`/drill/next` prefers an SRS card that is actually due, falls back to a problem
the user has never seen, and finally offers the soonest-due card so the drill is
never empty-handed. The response's `source` field says which branch fired. The
ground-truth pattern and the tell are never in that payload.

`/drill/submit` grades three axes and combines them with the weights in
`packages/api/src/drill/scoring.ts`:

| Axis          | Weight | How it scores                                                          |
| ------------- | ------ | ---------------------------------------------------------------------- |
| correctness   | 0.50   | 1.0 exact pattern, 0.5 close family, 0 otherwise                        |
| speed         | 0.20   | linear falloff, 1.0 at 0s down to 0.0 at 90s                            |
| rationale     | 0.30   | one Gemini call per attempt: yes / partial / no                         |

The composite maps onto an FSRS grade at 0.8 / 0.55 / 0.3 (Easy / Good / Hard,
Again below that). Because correctness carries half the weight, a wrong guess
tops out at Hard however fast and well argued it was, and a correct guess with no
real reasoning lands at Hard too — recognising without being able to say why is
not treated as mastery.

If Gemini is unreachable the attempt still completes: the rationale scores
neutrally and the response carries `rationale.judged: false` so the degradation
is visible rather than silent.

### Identity

There is no auth system yet. `packages/api/src/plugins/auth.ts` reads an
`x-user-id` header and falls back to a fixed development UUID. Swap the hook body
for `request.jwtVerify()` when real auth lands.

```bash
curl localhost:3000/drill/next
curl -X POST localhost:3000/drill/submit -H 'content-type: application/json' \
  -d '{"problemId":1,"guessedPatternId":1,"rationaleText":"...","timeTakenSeconds":12}'
```

### Growing the bank

`pnpm --filter @recogno/worker tells:generate` drafts a tell with Gemini for any
problem that lacks one. It is a one-off operator script, not a queue job —
`--dry-run` prints without writing, `--limit N` caps the number of calls.

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
