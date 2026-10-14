CREATE TABLE "tenant_revalidation_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_revalidation_settings" ADD CONSTRAINT "tenant_revalidation_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;