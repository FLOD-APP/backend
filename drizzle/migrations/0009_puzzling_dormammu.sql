CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"street_en" text NOT NULL,
	"street_ar" text NOT NULL,
	"district_en" text NOT NULL,
	"district_ar" text NOT NULL,
	"city_en" text NOT NULL,
	"city_ar" text NOT NULL,
	"postal_code" text,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_addresses_user_label_unique" UNIQUE("user_id","label")
);
--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");