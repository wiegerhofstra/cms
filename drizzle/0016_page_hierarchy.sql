CREATE TABLE "page_path_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"path" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "page_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD COLUMN "page_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "page_path_history" ADD CONSTRAINT "page_path_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_path_history" ADD CONSTRAINT "page_path_history_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_path_history_tenant_locale_path_unique" ON "page_path_history" USING btree ("tenant_id","locale","path");--> statement-breakpoint
CREATE INDEX "page_path_history_entry_idx" ON "page_path_history" USING btree ("tenant_id","entry_id");--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_page_parent_id_content_entries_id_fk" FOREIGN KEY ("page_parent_id") REFERENCES "public"."content_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_entries_page_parent_idx" ON "content_entries" USING btree ("tenant_id","page_parent_id");