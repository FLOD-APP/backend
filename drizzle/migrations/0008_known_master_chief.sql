CREATE TABLE "daily_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_steps_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "daily_steps" ADD CONSTRAINT "daily_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;