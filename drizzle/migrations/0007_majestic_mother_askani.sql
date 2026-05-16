ALTER TABLE "users" ADD COLUMN "daily_step_goal" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "health_kit_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "add_steps_to_calories" boolean DEFAULT false NOT NULL;