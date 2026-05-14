ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activity_level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "height_cm" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weight_kg" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_weight_kg" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allergies" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_calories" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "protein_grams" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "carbs_grams" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fat_grams" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_complete" boolean DEFAULT false NOT NULL;