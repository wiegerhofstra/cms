ALTER TABLE "tenants" ADD COLUMN "default_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "locales" text[] DEFAULT ARRAY['en']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "content_model_fields" ADD COLUMN "localized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;