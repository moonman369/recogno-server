CREATE TABLE "scoring_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"easy_threshold" double precision NOT NULL,
	"good_threshold" double precision NOT NULL,
	"hard_threshold" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoring_settings" ADD CONSTRAINT "scoring_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;