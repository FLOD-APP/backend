ALTER TABLE "users" ADD COLUMN "water_goal_ml" integer DEFAULT 2000;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hydration_reminder_interval" text DEFAULT '2h';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "beverage_preferences" jsonb;