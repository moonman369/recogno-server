CREATE TABLE "deck_problems" (
	"deck_id" integer NOT NULL,
	"problem_id" integer NOT NULL,
	"imported_from_deck_id" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_problems_deck_id_problem_id_pk" PRIMARY KEY("deck_id","problem_id")
);
--> statement-breakpoint
ALTER TABLE "deck_problems" ADD CONSTRAINT "deck_problems_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_problems" ADD CONSTRAINT "deck_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_problems" ADD CONSTRAINT "deck_problems_imported_from_deck_id_decks_id_fk" FOREIGN KEY ("imported_from_deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_problems_problem_idx" ON "deck_problems" USING btree ("problem_id");--> statement-breakpoint
-- Hand-added backfill: every existing problem is a member of its home deck.
-- Membership now drives every deck listing, so without this row-for-row copy
-- every deck in an existing database would read as empty.
INSERT INTO "deck_problems" ("deck_id", "problem_id")
SELECT "deck_id", "id" FROM "problems"
ON CONFLICT DO NOTHING;