CREATE TABLE "goal_why_matrix" (
	"goal" text PRIMARY KEY NOT NULL,
	"top_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
