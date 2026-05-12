CREATE TYPE "public"."branch_type" AS ENUM('main', 'express');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('first_plan', 'renewal', 'promo_code', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."express_classification" AS ENUM('buffet', 'grab_and_go');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_mode" AS ENUM('pickup', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."package_category" AS ENUM('mixed', 'chicken', 'snack', 'sandwich', 'customer_choice');--> statement-breakpoint
CREATE TYPE "public"."price_tier" AS ENUM('base', 'subscription', 'express_base', 'express_subscription', 'app');--> statement-breakpoint
CREATE TYPE "public"."rotation_type" AS ENUM('snack', 'sandwich');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending_payment', 'active', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"foodics_ref" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"type" "branch_type" NOT NULL,
	"express_classification" "express_classification",
	"manager_name" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"google_maps_url" text,
	"open_hour" time,
	"close_hour" time,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_stage0" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_foodics_ref_unique" UNIQUE("foodics_ref")
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "discount_type" NOT NULL,
	"code" text,
	"discount_percent" numeric(5, 2) NOT NULL,
	"applies_to" text[] DEFAULT '{"main_meals"}' NOT NULL,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_meal_distribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"protein_type" text NOT NULL,
	"meal_count" integer NOT NULL,
	CONSTRAINT "package_meal_dist_unique" UNIQUE("package_id","protein_type")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "package_category" NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"meals_per_day" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"total_meals" integer NOT NULL,
	"price_incl_vat" numeric(8, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_unique" UNIQUE("category","meals_per_day","duration_days")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"in_subscription" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"tier" "price_tier" NOT NULL,
	"branch_id" uuid,
	"price_incl_vat" numeric(8, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_unique" UNIQUE("product_id","tier","branch_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"sku" text,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"description_en" text,
	"description_ar" text,
	"calories" integer,
	"protein_g" numeric(5, 1),
	"carbs_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"serving_size_g" integer,
	"allergens" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"protein_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotation_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "rotation_type" NOT NULL,
	"day_number" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"price_incl_vat" numeric(8, 2) NOT NULL,
	CONSTRAINT "rotation_schedule_unique" UNIQUE("type","day_number")
);
--> statement-breakpoint
CREATE TABLE "rotation_swap_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"swap_product_id" uuid NOT NULL,
	CONSTRAINT "rotation_swap_unique" UNIQUE("schedule_id","swap_product_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_daily_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"meal_slot" integer DEFAULT 1 NOT NULL,
	"product_id" uuid NOT NULL,
	"price_incl_vat" numeric(8, 2) NOT NULL,
	"is_collected" boolean DEFAULT false NOT NULL,
	"collected_at" timestamp with time zone,
	"is_swapped" boolean DEFAULT false NOT NULL,
	"swapped_from_id" uuid,
	"swap_price_diff" numeric(8, 2) DEFAULT '0',
	CONSTRAINT "sub_daily_meals_unique" UNIQUE("subscription_id","day_number","meal_slot")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"fulfilment" "fulfilment_mode" DEFAULT 'pickup' NOT NULL,
	"status" "subscription_status" DEFAULT 'pending_payment' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"current_day" integer DEFAULT 0 NOT NULL,
	"total_days" integer NOT NULL,
	"pause_days_used" integer DEFAULT 0 NOT NULL,
	"pause_days_limit" integer NOT NULL,
	"discount_id" uuid,
	"discount_percent" numeric(5, 2) DEFAULT '0',
	"amount_paid" numeric(8, 2) NOT NULL,
	"wallet_balance" numeric(8, 2) DEFAULT '0' NOT NULL,
	"payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"email" text,
	"language_preference" text DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(8, 2) NOT NULL,
	"balance_after" numeric(8, 2) NOT NULL,
	"description" text,
	"meal_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_meal_distribution" ADD CONSTRAINT "package_meal_distribution_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_schedules" ADD CONSTRAINT "rotation_schedules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_swap_options" ADD CONSTRAINT "rotation_swap_options_schedule_id_rotation_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."rotation_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_swap_options" ADD CONSTRAINT "rotation_swap_options_swap_product_id_products_id_fk" FOREIGN KEY ("swap_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD CONSTRAINT "subscription_daily_meals_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD CONSTRAINT "subscription_daily_meals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_daily_meals" ADD CONSTRAINT "subscription_daily_meals_swapped_from_id_products_id_fk" FOREIGN KEY ("swapped_from_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_id_discount_rules_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discount_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;