CREATE TYPE "public"."foodics_sync_status" AS ENUM('pending', 'synced', 'failed', 'retrying');--> statement-breakpoint
CREATE TABLE "foodics_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"status" "foodics_sync_status" DEFAULT 'pending' NOT NULL,
	"foodics_order_id" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error_message" text,
	"request_payload" jsonb,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "foodics_branch_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "foodics_product_id" text;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD COLUMN "foodics_order_id" text;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD COLUMN "foodics_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD COLUMN "foodics_sync_status" "foodics_sync_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "foodics_customer_id" text;--> statement-breakpoint
ALTER TABLE "foodics_sync_log" ADD CONSTRAINT "foodics_sync_log_meal_id_subscription_daily_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."subscription_daily_meals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foodics_sync_log_status_retry_idx" ON "foodics_sync_log" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "foodics_sync_log_meal_idx" ON "foodics_sync_log" USING btree ("meal_id");