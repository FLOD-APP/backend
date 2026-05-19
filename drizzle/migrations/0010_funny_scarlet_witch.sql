CREATE TABLE "plan_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"duration" integer NOT NULL,
	"meals_per_day" integer NOT NULL,
	"branch_id" uuid,
	"fulfilment" "fulfilment_mode" DEFAULT 'pickup' NOT NULL,
	"delivery_address_id" uuid,
	"start_date" date,
	"slot" text DEFAULT 'morning' NOT NULL,
	"add_ons" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_selections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "plan_selections" ADD CONSTRAINT "plan_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_selections" ADD CONSTRAINT "plan_selections_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_selections" ADD CONSTRAINT "plan_selections_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;