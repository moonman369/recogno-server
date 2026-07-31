/**
 * Drizzle schema for the Recogno Postgres database.
 *
 * Covers F1.1–F1.4: the curated problem bank, the pre-written "tell" for each
 * problem, one row per drill attempt, and an FSRS scheduling card per
 * (user, problem) pair.
 */

import {
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
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);

/** Where a tell came from — hand-written during seeding, or drafted by Gemini. */
export const tellSourceEnum = pgEnum('tell_source', ['seed', 'gemini']);

export const patterns = pgTable('patterns', {
  id: serial('id').primaryKey(),
  /** Stable natural key, so seeding is idempotent and code can refer to patterns by name. */
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const problems = pgTable(
  'problems',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    title: text('title').notNull(),
    statement: text('statement').notNull(),
    constraints: text('constraints').notNull(),
    sourceUrl: text('source_url'),
    /** The ground-truth pattern. Never leaves the server before a drill is submitted. */
    patternId: integer('pattern_id')
      .notNull()
      .references(() => patterns.id, { onDelete: 'restrict' }),
    difficulty: difficultyEnum('difficulty').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('problems_pattern_id_idx').on(table.patternId)],
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
    // No users table yet (auth is stubbed), so this is deliberately unconstrained.
    userId: uuid('user_id').notNull(),
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
    userId: uuid('user_id').notNull(),
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
export type Difficulty = (typeof difficultyEnum.enumValues)[number];
