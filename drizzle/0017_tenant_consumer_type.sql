CREATE TYPE "public"."consumer_type" AS ENUM('nextjs', 'astro');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "consumer_type" "consumer_type" DEFAULT 'nextjs' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" ADD COLUMN "consumer_type" "consumer_type" DEFAULT 'nextjs' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" ADD COLUMN "last_deployment_id" text;--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" DROP CONSTRAINT "tenant_revalidation_settings_pkey";--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" ADD CONSTRAINT "tenant_revalidation_settings_tenant_id_consumer_type_pk" PRIMARY KEY("tenant_id","consumer_type");
