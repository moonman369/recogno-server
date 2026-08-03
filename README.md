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
| correctness   | 0.50   | 1.0 if any guess names any accepted pattern, 0.5 close family, 0 otherwise |
| speed         | 0.20   | 1.0 up to 45s, then a linear decay to 0.0 at 300s                       |
| rationale     | 0.30   | one Gemini call per attempt: yes / partial / no                         |

The speed curve has a **grace window**: anything answered inside 45 seconds is
full marks, and credit only decays after that, reaching zero at five minutes.

| time | 30s | 45s | 60s | 90s | 120s | 180s | 300s+ |
| ---- | --- | --- | --- | --- | ---- | ---- | ----- |
| speed | 1.00 | 1.00 | 0.94 | 0.82 | 0.71 | 0.53 | 0.00 |

Both bounds are named constants in `packages/api/src/drill/scoring.ts`
(`SPEED_GRACE_SECONDS`, `SPEED_FLOOR_SECONDS`) — tune them there.

### The pattern taxonomy

84 patterns across 17 categories, defined in
`packages/shared/src/domain/patterns.ts`, with **one system deck per category**
and 85 hand-written LeetCode problems in
`packages/shared/src/db/fixtures.ts`. Each row
carries a `category` (Graphs, Dynamic Programming, String Algorithms, …), and
`patternOptions` on `GET /drill/next` returns it — group the picker by category
rather than rendering 84 flat options.

**Slugs are permanent.** `problems.pattern_id`, `problem_patterns` and
`drill_attempt_patterns` all point at them, so renaming one orphans real history.
`patterns.test.ts` pins the original thirteen against exactly that.

`CLOSE_FAMILIES` (the 0.5-credit neighbours) is hand-curated, not derived from
`category`: two patterns sharing a heading are often nothing alike, and a blanket
rule would inflate half-credit until it meant nothing.

### Multiple patterns

A problem may accept more than one pattern — counting islands is as fair a read
as union-find as it is BFS/DFS. Accepted patterns live in `problem_patterns`;
`problems.pattern_id` stays the canonical one that the tell explains.

A learner may likewise name several. `POST /drill/submit` takes
`guessedPatternIds` (ids), `guessedPatternSlugs` (slugs) or the original
single-value `guessedPatternId`, up to 5 guesses:

```jsonc
{ "problemId": 13,
  "guessedPatternSlugs": ["bfs-dfs", "union-find"],
  "rationaleText": "...", "timeTakenSeconds": 12 }
```

**Naming any one accepted pattern is full credit.** Extra wrong guesses alongside
a correct one do not reduce it. The response returns `guessedPatterns` and
`acceptedPatterns` alongside the original singular `guessedPattern` /
`actualPattern` fields.

The composite maps onto an FSRS grade at 0.8 / 0.55 / 0.3 (Easy / Good / Hard,
Again below that). Because correctness carries half the weight, a wrong guess
tops out at Hard however fast and well argued it was, and a correct guess with no
real reasoning lands at Hard too — recognising without being able to say why is
not treated as mastery.

If Gemini is unreachable the attempt still completes: the rationale scores
neutrally and the response carries `rationale.judged: false` so the degradation
is visible rather than silent.

### Identity

Every route requires a bearer token except `/health`, `/docs/*` and the sign-in
routes themselves. The allowlist lives in `isPublicRoute` in
`packages/api/src/plugins/auth.ts`; anything not named there is protected, so a
new route is never accidentally public.

| Route                  | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `GET /auth/providers`  | Which sign-in methods this deployment supports       |
| `POST /auth/register`  | Create an account with email + password              |
| `POST /auth/login`     | Sign in                                              |
| `POST /auth/refresh`   | Rotate the session                                   |
| `POST /auth/logout`    | Revoke one refresh token                             |
| `GET /auth/me`         | The signed-in user                                   |
| `POST /auth/logout-all`| Revoke every session for the account                 |
| `GET /auth/google`     | Begin Google sign-in (501 until configured)          |

Sessions are a 15-minute access JWT plus a 30-day refresh token. Refresh tokens
are opaque, stored only as a SHA-256 digest, and **rotate on every use** — a
replayed token is rejected. Passwords use `node:crypto` scrypt (N=2¹⁷), so there
is no native module to compile.

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your-passphrase"}' | jq -r .accessToken)

curl localhost:3000/drill/next -H "authorization: Bearer $TOKEN"
```

Every user gets their own decks, cards and history. The five system decks stay
shared and read-only for everyone.

Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; without them
`/auth/google` returns 501 and everything else runs normally. Check
`GET /auth/providers` to decide whether to show the button.

## Decks and the note/solution flow

Every problem lives in exactly one deck. Five **system decks** hold the curated
F1.1–F1.4 bank — readable by everyone, writable by no one. Users create their own
decks and add problems to those.

| Route                              | What it does                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `GET /decks`                       | System decks plus the caller's own                     |
| `POST /decks`                      | Create a personal deck                                 |
| `GET /decks/{id}`                  | Deck detail; each problem labelled `drill` or `note`   |
| `POST /decks/{id}/problems`        | Add a problem + first attempt (202, async)             |
| `POST /problems/{id}/submissions`  | Record a repeat attempt (202, async)                   |
| `GET /problems/{id}/submissions`   | Attempt history, newest first                          |
| `GET /submissions/{id}`            | Poll pipeline progress and the AI evaluation           |
| `POST /submissions/{id}/commit`    | Accept or override the grade, and reschedule           |

### Two flows, one scheduler

A problem is **drill-eligible** when a curator gave it a pattern *and* a tell —
exactly the curated bank. Everything else is graded by writing a note and a
solution. Both write to the same `srs_cards`, so `GET /review/due-count` and
`GET /review/queue` span them; `GET /drill/*` is scoped to drill-eligible
problems only.

### The async pipeline

`POST /decks/{id}/problems` returns `202` immediately with a `queued` submission.
The worker then runs the stages, which the client polls:

- **resolve-source** — only when the input was a link or a slug *and* no statement
  has been fetched yet. Free text is its own statement, so it never gets this stage.
- **evaluate** — one Gemini call producing the gradation and all three feedback
  fields together.

Stage rows exist only for work that will really run, so nothing decorative
appears in the client. A failed resolve is *not* fatal: the learner's note and
solution are what is being graded, so evaluation proceeds and the stage records
why the fetch failed.

### Gradations

`Try Again`, `Needs Work`, `Not Bad`, `Good Job`, `Excellent`. The user reviews
the AI's verdict and may override it before committing; the **final** gradation
drives scheduling.

Five tiers collapse onto FSRS's four at the bottom — `try-again` and `needs-work`
both mean it was not really solved, and FSRS treats `Again` specially. Each tier
carries a nominal composite score fed through the *same* bands the drill uses
(`packages/shared/src/domain/gradation.ts`), so one set of thresholds governs both
flows.

A submission whose evaluation failed can still be committed, but only with an
explicit gradation — the learner self-grades rather than losing the attempt.

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
