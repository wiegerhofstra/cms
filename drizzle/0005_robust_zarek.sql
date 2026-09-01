CREATE TABLE "content_model_field_targets" (
	"field_id" uuid NOT NULL,
	"target_model_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_model_fields" DROP CONSTRAINT "content_model_fields_target_model_id_content_models_id_fk";
--> statement-breakpoint
ALTER TABLE "content_model_field_targets" ADD CONSTRAINT "content_model_field_targets_field_id_content_model_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."content_model_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_model_field_targets" ADD CONSTRAINT "content_model_field_targets_target_model_id_content_models_id_fk" FOREIGN KEY ("target_model_id") REFERENCES "public"."content_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "content_model_field_targets" ("field_id", "target_model_id")
SELECT "id", "target_model_id"
FROM "content_model_fields"
WHERE "target_model_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_model_field_targets_unique" ON "content_model_field_targets" USING btree ("field_id","target_model_id");--> statement-breakpoint
CREATE INDEX "content_model_field_targets_field_id_idx" ON "content_model_field_targets" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "content_model_field_targets_model_id_idx" ON "content_model_field_targets" USING btree ("target_model_id");--> statement-breakpoint
ALTER TABLE "content_model_fields" DROP COLUMN "target_model_id";
