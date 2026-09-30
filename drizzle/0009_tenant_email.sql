CREATE TABLE "tenant_email_rate_limits" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_email_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"encryption" text DEFAULT 'starttls' NOT NULL,
	"username" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"allowed_from" text[] DEFAULT '{}' NOT NULL,
	"servername" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "permissions" text[] DEFAULT '{"content:read"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_email_rate_limits" ADD CONSTRAINT "tenant_email_rate_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_email_settings" ADD CONSTRAINT "tenant_email_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;