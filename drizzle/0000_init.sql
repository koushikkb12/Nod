CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"norm_label" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"answer" text NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"draft" jsonb NOT NULL,
	"approved_hash" text,
	"cv_pdf_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_ats_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"fields" jsonb NOT NULL,
	"resume_file" text,
	"resume_sha256" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"application_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" text,
	"text" text NOT NULL,
	"org" text,
	"role" text,
	"start_date" text,
	"end_date" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'cv' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_company" text NOT NULL,
	"external_id" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"workplace" text DEFAULT 'unknown' NOT NULL,
	"employment_type" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"description_html" text DEFAULT '' NOT NULL,
	"description_text" text DEFAULT '' NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apply_url" text NOT NULL,
	"source_url" text NOT NULL,
	"questions" jsonb,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"dedupe_key" text NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sponsor_match" text,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"score" integer NOT NULL,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"dismiss_reason" text,
	"ai_summary" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"titles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workplace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seniority" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_salary" integer,
	"salary_currency" text DEFAULT 'GBP' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_companies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs_sponsorship" boolean,
	"right_to_work" text DEFAULT '' NOT NULL,
	"notice_period" text DEFAULT '' NOT NULL,
	"willing_to_relocate" boolean DEFAULT false NOT NULL,
	"daily_cap" integer DEFAULT 10 NOT NULL,
	"per_company_monthly_cap" integer DEFAULT 2 NOT NULL,
	"agent_paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cv_file_name" text,
	"cv_text" text,
	"parsed_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"user_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"adapter" text NOT NULL,
	"status" text NOT NULL,
	"payload_hash" text NOT NULL,
	"needs" jsonb,
	"form_screenshot" text,
	"confirmation_screenshot" text,
	"confirmation_text" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_user_id_norm_label_index" ON "answers" USING btree ("user_id","norm_label");--> statement-breakpoint
CREATE INDEX "applications_user_id_updated_at_index" ON "applications" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "approvals_user_id_created_at_index" ON "approvals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_application_id_index" ON "approvals" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "events_application_id_created_at_index" ON "events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "facts_user_id_position_index" ON "facts" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "jobs_dedupe_key_index" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_is_open_index" ON "jobs" USING btree ("is_open");--> statement-breakpoint
CREATE INDEX "matches_user_id_score_index" ON "matches" USING btree ("user_id","score");