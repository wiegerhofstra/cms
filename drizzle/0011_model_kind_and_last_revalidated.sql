CREATE TYPE "public"."model_kind" AS ENUM('content', 'block');--> statement-breakpoint
ALTER TABLE "content_models" ADD COLUMN "kind" "model_kind" DEFAULT 'content' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" ADD COLUMN "last_revalidated_at" timestamp with time zone;