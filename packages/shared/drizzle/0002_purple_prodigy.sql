CREATE TABLE "drill_attempt_patterns" (
	"attempt_id" uuid NOT NULL,
	"pattern_id" integer NOT NULL,
	CONSTRAINT "drill_attempt_patterns_attempt_id_pattern_id_pk" PRIMARY KEY("attempt_id","pattern_id")
);
--> statement-breakpoint
CREATE TABLE "problem_patterns" (
	"problem_id" integer NOT NULL,
	"pattern_id" integer NOT NULL,
	CONSTRAINT "problem_patterns_problem_id_pattern_id_pk" PRIMARY KEY("problem_id","pattern_id")
);
--> statement-breakpoint
ALTER TABLE "drill_attempt_patterns" ADD CONSTRAINT "drill_attempt_patterns_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_attempt_patterns" ADD CONSTRAINT "drill_attempt_patterns_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_patterns" ADD CONSTRAINT "problem_patterns_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_patterns" ADD CONSTRAINT "problem_patterns_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_patterns_pattern_idx" ON "problem_patterns" USING btree ("pattern_id");--> statement-breakpoint

-- Backfill: every existing problem already has exactly one accepted pattern,
-- the canonical one. Without this, grading would fall back to `pattern_id` for
-- older rows and the join table would only describe newly seeded problems.
INSERT INTO "problem_patterns" ("problem_id", "pattern_id")
SELECT "id", "pattern_id" FROM "problems" WHERE "pattern_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Same for history: each past attempt named exactly one pattern.
INSERT INTO "drill_attempt_patterns" ("attempt_id", "pattern_id")
SELECT "id", "guessed_pattern_id" FROM "drill_attempts"
ON CONFLICT DO NOTHING;
