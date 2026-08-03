-- Decks, personal problem additions, and the note/solution submission pipeline.
--
-- Hand-adjusted after generation: `problems.deck_id` is NOT NULL, but the table
-- already holds the curated F1.1-F1.4 bank. The column is therefore added
-- nullable, backfilled from each problem's pattern, and only then tightened.

CREATE TYPE "public"."gradation" AS ENUM('try-again', 'needs-work', 'not-bad', 'good-job', 'excellent');--> statement-breakpoint
CREATE TYPE "public"."problem_source" AS ENUM('curated', 'link', 'slug', 'text');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."submission_stage" AS ENUM('resolve-source', 'evaluate');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('queued', 'resolving-source', 'evaluating', 'awaiting-review', 'committed', 'failed');--> statement-breakpoint

CREATE TABLE "decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "decks_system_slug_idx" ON "decks" USING btree ("slug") WHERE owner_user_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "decks_owner_slug_idx" ON "decks" USING btree ("owner_user_id","slug") WHERE owner_user_id is not null;--> statement-breakpoint
CREATE INDEX "decks_owner_idx" ON "decks" USING btree ("owner_user_id");--> statement-breakpoint

-- The system decks must exist before existing problems can be assigned to one.
-- Kept in sync with SYSTEM_DECKS in shared/src/domain/decks.ts; `pnpm db:seed`
-- refreshes the names and descriptions afterwards.
INSERT INTO "decks" ("slug", "name", "description", "owner_user_id") VALUES
	('arrays-and-strings', 'Arrays & Strings', 'Linear scans over sequences where the answer is a contiguous span or a provable pointer move.', NULL),
	('search-and-greedy', 'Search & Greedy', 'Problems solved by searching the answer space or committing to a locally optimal choice.', NULL),
	('graphs', 'Graphs', 'Traversal, shortest paths on unweighted edges, and incremental connectivity.', NULL),
	('dynamic-programming', 'Dynamic Programming', 'Overlapping subproblems over a bounded state space.', NULL),
	('combinatorial-search', 'Combinatorial Search', 'Exhaustive enumeration over a space small enough to explore, with pruning.', NULL)
ON CONFLICT DO NOTHING;--> statement-breakpoint

CREATE TABLE "problem_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" integer NOT NULL,
	"note_text" text NOT NULL,
	"solution_text" text NOT NULL,
	"status" "submission_status" DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"ai_gradation" "gradation",
	"ai_approach_summary" text,
	"ai_missed" text,
	"ai_optimizations" text,
	"ai_model" text,
	"final_gradation" "gradation",
	"overridden" boolean DEFAULT false NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"stage" "submission_stage" NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"position" smallint NOT NULL,
	"detail" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "problems" DROP CONSTRAINT "problems_slug_unique";--> statement-breakpoint
ALTER TABLE "problems" ALTER COLUMN "statement" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ALTER COLUMN "constraints" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ALTER COLUMN "pattern_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "deck_id" integer;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "source" "problem_source" DEFAULT 'curated' NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "added_by_user_id" uuid;--> statement-breakpoint

-- Backfill: every pre-existing problem is curated and pattern-tagged, so its
-- system deck follows from its pattern.
UPDATE "problems" p
SET "deck_id" = d."id"
FROM "patterns" pat
JOIN "decks" d ON d."owner_user_id" IS NULL AND d."slug" = CASE pat."slug"
	WHEN 'sliding-window' THEN 'arrays-and-strings'
	WHEN 'two-pointers' THEN 'arrays-and-strings'
	WHEN 'monotonic-stack' THEN 'arrays-and-strings'
	WHEN 'binary-search-on-answer' THEN 'search-and-greedy'
	WHEN 'greedy' THEN 'search-and-greedy'
	WHEN 'heap' THEN 'search-and-greedy'
	WHEN 'bfs-dfs' THEN 'graphs'
	WHEN 'union-find' THEN 'graphs'
	WHEN 'dp-knapsack' THEN 'dynamic-programming'
	WHEN 'dp-interval' THEN 'dynamic-programming'
	WHEN 'dp-digit' THEN 'dynamic-programming'
	WHEN 'backtracking' THEN 'combinatorial-search'
	WHEN 'bitmask' THEN 'combinatorial-search'
END
WHERE p."pattern_id" = pat."id" AND p."deck_id" IS NULL;--> statement-breakpoint

-- Fails loudly if any problem was left unassigned, rather than silently
-- dropping it out of every deck listing.
ALTER TABLE "problems" ALTER COLUMN "deck_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "problem_submissions" ADD CONSTRAINT "problem_submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_stages" ADD CONSTRAINT "submission_stages_submission_id_problem_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."problem_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_submissions_user_created_idx" ON "problem_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "problem_submissions_user_problem_idx" ON "problem_submissions" USING btree ("user_id","problem_id");--> statement-breakpoint
CREATE INDEX "problem_submissions_status_idx" ON "problem_submissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_stages_submission_stage_idx" ON "submission_stages" USING btree ("submission_id","stage");--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problems_deck_id_idx" ON "problems" USING btree ("deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problems_deck_slug_idx" ON "problems" USING btree ("deck_id","slug");
