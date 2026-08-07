-- Group patterns into study categories, ahead of expanding the taxonomy from 13
-- to ~84 entries.
--
-- Hand-adjusted after generation: `category` is NOT NULL but `patterns` already
-- holds the original thirteen, so the column is added nullable, backfilled by
-- slug, and only then tightened. `pnpm db:seed` rewrites these values afterwards
-- from CANONICAL_PATTERNS, which stays the source of truth.

ALTER TABLE "patterns" ADD COLUMN "category" text;--> statement-breakpoint

UPDATE "patterns" SET "category" = CASE "slug"
	WHEN 'two-pointers' THEN 'Two Pointers'
	WHEN 'sliding-window' THEN 'Two Pointers'
	WHEN 'monotonic-stack' THEN 'Stack & Queue'
	WHEN 'binary-search-on-answer' THEN 'Binary Search'
	WHEN 'greedy' THEN 'Greedy'
	WHEN 'heap' THEN 'Heap'
	WHEN 'bfs-dfs' THEN 'Graphs'
	WHEN 'union-find' THEN 'Graphs'
	WHEN 'dp-knapsack' THEN 'Dynamic Programming'
	WHEN 'dp-interval' THEN 'Dynamic Programming'
	WHEN 'dp-digit' THEN 'Dynamic Programming'
	WHEN 'backtracking' THEN 'Recursion'
	WHEN 'bitmask' THEN 'Bit Manipulation'
	-- Any slug added outside this migration lands somewhere valid rather than
	-- blocking the NOT NULL below.
	ELSE 'Miscellaneous'
END
WHERE "category" IS NULL;--> statement-breakpoint

ALTER TABLE "patterns" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "patterns_category_idx" ON "patterns" USING btree ("category");
