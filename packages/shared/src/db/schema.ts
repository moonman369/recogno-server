/**
 * Drizzle schema for the Recogno Postgres database.
 *
 * F1.1–F1.4: the curated problem bank, the pre-written "tell" for each problem,
 * one row per drill attempt, and an FSRS scheduling card per (user, problem).
 *
 * Decks and submissions extend that: every problem now lives in exactly one
 * deck, and problems added to a personal deck carry no curator metadata, so they
 * are graded through the note/solution + AI evaluation flow instead of the blind
 * drill. Both flows write to the same `srs_cards`, so "due today" spans them.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);

/** Where a tell came from — hand-written during seeding, or drafted by Gemini. */
export const tellSourceEnum = pgEnum('tell_source', ['seed', 'gemini']);

/** How a problem entered the bank. `curated` is the F1.1–F1.4 seed. */
export const problemSourceEnum = pgEnum('problem_source', ['curated', 'link', 'slug', 'text']);

/** The five user-facing evaluation tiers. Mirrors `GRADATIONS` in domain/gradation.ts. */
export const gradationEnum = pgEnum('gradation', [
  'try-again',
  'needs-work',
  'not-bad',
  'good-job',
  'excellent',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'queued',
  'resolving-source',
  'evaluating',
  'awaiting-review',
  'committed',
  'failed',
]);

/** Only steps that do real work. A text-only submission never gets a resolve stage. */
export const submissionStageEnum = pgEnum('submission_stage', ['resolve-source', 'evaluate']);

export const stageStatusEnum = pgEnum('stage_status', ['pending', 'running', 'done', 'failed']);

/** OAuth providers a user can link. Email/password accounts have no identity row. */
export const authProviderEnum = pgEnum('auth_provider', ['google']);

/**
 * A real account. Everything that was previously keyed by an opaque stub UUID —
 * decks, cards, attempts, submissions — now points here.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored lower-cased; the unique index below is what enforces it. */
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Null for accounts that only ever signed in through an OAuth provider. */
    passwordHash: text('password_hash'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
);

/** A linked OAuth account. One row per (provider, provider account). */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_identities_provider_account_idx').on(table.provider, table.providerAccountId),
    index('user_identities_user_idx').on(table.userId),
  ],
);

/**
 * Refresh tokens, stored as a SHA-256 digest so a database leak cannot be
 * replayed as a login. Rotated on every use.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_idx').on(table.tokenHash),
    index('refresh_tokens_user_idx').on(table.userId),
  ],
);

export const patterns = pgTable(
  'patterns',
  {
    id: serial('id').primaryKey(),
    /** Stable natural key, so seeding is idempotent and code can refer to patterns by name. */
    slug: varchar('slug', { length: 64 }).notNull().unique(),
    name: text('name').notNull(),
    /** Study grouping, so a picker over ~80 patterns stays browsable. */
    category: text('category').notNull(),
    description: text('description').notNull(),
  },
  (table) => [index('patterns_category_idx').on(table.category)],
);

/**
 * Mandatory container for every problem. `ownerUserId` null means system-owned:
 * the curated F1.1–F1.4 bank, readable by everyone and writable by no one.
 */
export const decks = pgTable(
  'decks',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 128 }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Two partial indexes rather than one composite: Postgres treats NULLs as
    // distinct, so a plain unique(owner, slug) would not constrain system decks.
    uniqueIndex('decks_system_slug_idx').on(table.slug).where(sql`owner_user_id is null`),
    uniqueIndex('decks_owner_slug_idx')
      .on(table.ownerUserId, table.slug)
      .where(sql`owner_user_id is not null`),
    index('decks_owner_idx').on(table.ownerUserId),
  ],
);

/**
 * Columns beyond `deckId`/`title` are nullable because a problem the user added
 * from a link may not have resolved yet, and one added as free text may never
 * have constraints or a curator-assigned pattern at all.
 */
export const problems = pgTable(
  'problems',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 128 }).notNull(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    statement: text('statement'),
    constraints: text('constraints'),
    sourceUrl: text('source_url'),
    source: problemSourceEnum('source').notNull().default('curated'),
    /** The raw link or slug the user typed, kept so a failed resolve can be retried. */
    sourceRef: text('source_ref'),
    addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * The ground-truth pattern. Null for personal additions, which is exactly
     * what makes a problem ineligible for the blind drill.
     */
    patternId: integer('pattern_id').references(() => patterns.id, { onDelete: 'restrict' }),
    difficulty: difficultyEnum('difficulty'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('problems_pattern_id_idx').on(table.patternId),
    index('problems_deck_id_idx').on(table.deckId),
    // Slugs only need to be unique within their deck: two users may each add the
    // same LeetCode problem to their own deck.
    uniqueIndex('problems_deck_slug_idx').on(table.deckId, table.slug),
  ],
);

/**
 * Every pattern a problem legitimately accepts, including the primary one held
 * on `problems.pattern_id`.
 *
 * A grid-connectivity problem is a fair read as either BFS/DFS or union-find, so
 * naming either is correct. `problems.pattern_id` stays the canonical one — it
 * drives deck grouping and the tell — while this table is what grading checks.
 */
export const problemPatterns = pgTable(
  'problem_patterns',
  {
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    patternId: integer('pattern_id')
      .notNull()
      .references(() => patterns.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.problemId, table.patternId] }),
    index('problem_patterns_pattern_idx').on(table.patternId),
  ],
);

/**
 * Every pattern the learner named on one attempt. `drill_attempts.guessed_pattern_id`
 * keeps the first of them so existing reads stay valid.
 */
export const drillAttemptPatterns = pgTable(
  'drill_attempt_patterns',
  {
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => drillAttempts.id, { onDelete: 'cascade' }),
    patternId: integer('pattern_id')
      .notNull()
      .references(() => patterns.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.patternId] })],
);

/** The "why this pattern" explanation revealed after a guess. One per problem. */
export const tells = pgTable('tells', {
  id: serial('id').primaryKey(),
  problemId: integer('problem_id')
    .notNull()
    .unique()
    .references(() => problems.id, { onDelete: 'cascade' }),
  tellText: text('tell_text').notNull(),
  source: tellSourceEnum('source').notNull().default('seed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per submitted guess. Append-only: this is the training history that
 * later features (tell clustering, weak-pattern reports) will read.
 */
export const drillAttempts = pgTable(
  'drill_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    guessedPatternId: integer('guessed_pattern_id')
      .notNull()
      .references(() => patterns.id, { onDelete: 'restrict' }),
    rationaleText: text('rationale_text').notNull(),
    timeTakenSeconds: integer('time_taken_seconds').notNull(),
    correctnessScore: real('correctness_score').notNull(),
    speedScore: real('speed_score').notNull(),
    rationaleScore: real('rationale_score').notNull(),
    compositeScore: real('composite_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('drill_attempts_user_problem_idx').on(table.userId, table.problemId),
    index('drill_attempts_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/**
 * FSRS scheduling state, one card per (user, problem).
 *
 * Column set mirrors ts-fsrs's `Card` exactly — including `state`,
 * `scheduled_days` and `learning_steps`, which look like internals but are
 * genuine inputs to the next scheduling step. Dropping them would silently
 * restart every card's learning phase on each review.
 */
export const srsCards = pgTable(
  'srs_cards',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    stability: doublePrecision('stability').notNull(),
    difficulty: doublePrecision('difficulty').notNull(),
    elapsedDays: doublePrecision('elapsed_days').notNull().default(0),
    scheduledDays: doublePrecision('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** ts-fsrs `State`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
    state: smallint('state').notNull().default(0),
    lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.problemId] }),
    // Drives both `GET /drill/next` (soonest due) and `GET /drill/due-count`.
    index('srs_cards_user_due_idx').on(table.userId, table.dueAt),
  ],
);

/**
 * One row per encounter with a problem: the learner's note and solution, the AI's
 * evaluation of it, and the gradation that was finally committed.
 *
 * Append-only. A repeat review creates a new submission rather than editing the
 * previous one, so the history of how an approach improved stays intact.
 */
export const problemSubmissions = pgTable(
  'problem_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemId: integer('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),

    /** The learner's approach and any issues they hit. */
    noteText: text('note_text').notNull(),
    /** Code, pseudocode or prose — stored opaquely, never parsed. */
    solutionText: text('solution_text').notNull(),

    status: submissionStatusEnum('status').notNull().default('queued'),
    failureReason: text('failure_reason'),

    aiGradation: gradationEnum('ai_gradation'),
    aiApproachSummary: text('ai_approach_summary'),
    aiMissed: text('ai_missed'),
    aiOptimizations: text('ai_optimizations'),
    aiModel: text('ai_model'),

    /** What actually drove scheduling — the AI's grade unless the user overrode it. */
    finalGradation: gradationEnum('final_gradation'),
    overridden: boolean('overridden').notNull().default(false),
    committedAt: timestamp('committed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('problem_submissions_user_created_idx').on(table.userId, table.createdAt),
    index('problem_submissions_user_problem_idx').on(table.userId, table.problemId),
    index('problem_submissions_status_idx').on(table.status),
  ],
);

/**
 * Per-stage progress for the async pipeline, so a polling client can show what
 * is genuinely happening. A row exists only for work that will really run:
 * a free-text submission has no `resolve-source` row at all.
 */
export const submissionStages = pgTable(
  'submission_stages',
  {
    id: serial('id').primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => problemSubmissions.id, { onDelete: 'cascade' }),
    stage: submissionStageEnum('stage').notNull(),
    status: stageStatusEnum('status').notNull().default('pending'),
    /** Display order, so the client never has to know the pipeline's shape. */
    position: smallint('position').notNull(),
    detail: text('detail'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('submission_stages_submission_stage_idx').on(table.submissionId, table.stage),
  ],
);

export type Pattern = typeof patterns.$inferSelect;
export type NewPattern = typeof patterns.$inferInsert;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Tell = typeof tells.$inferSelect;
export type NewTell = typeof tells.$inferInsert;
export type DrillAttempt = typeof drillAttempts.$inferSelect;
export type NewDrillAttempt = typeof drillAttempts.$inferInsert;
export type SrsCard = typeof srsCards.$inferSelect;
export type NewSrsCard = typeof srsCards.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserIdentity = typeof userIdentities.$inferSelect;
export type NewUserIdentity = typeof userIdentities.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type AuthProvider = (typeof authProviderEnum.enumValues)[number];
export type ProblemPattern = typeof problemPatterns.$inferSelect;
export type NewProblemPattern = typeof problemPatterns.$inferInsert;
export type DrillAttemptPattern = typeof drillAttemptPatterns.$inferSelect;
export type NewDrillAttemptPattern = typeof drillAttemptPatterns.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type ProblemSubmission = typeof problemSubmissions.$inferSelect;
export type NewProblemSubmission = typeof problemSubmissions.$inferInsert;
export type SubmissionStage = typeof submissionStages.$inferSelect;
export type NewSubmissionStage = typeof submissionStages.$inferInsert;
export type Difficulty = (typeof difficultyEnum.enumValues)[number];
export type ProblemSource = (typeof problemSourceEnum.enumValues)[number];
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];
export type SubmissionStageName = (typeof submissionStageEnum.enumValues)[number];
export type StageStatus = (typeof stageStatusEnum.enumValues)[number];
