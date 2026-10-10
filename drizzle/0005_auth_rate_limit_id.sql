ALTER TABLE "rate_limit" DROP CONSTRAINT "rate_limit_pkey";--> statement-breakpoint
ALTER TABLE "rate_limit" ADD COLUMN "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_limit" ADD CONSTRAINT "rate_limit_key_unique" UNIQUE("key");
