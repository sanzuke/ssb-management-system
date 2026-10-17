CREATE TABLE "development_plan_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"aspect" "assessment_aspect",
	"area" text NOT NULL,
	"target" text,
	"note" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_plan_item_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "development_plan_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "development_plan_item" ADD CONSTRAINT "development_plan_item_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_plan_item" ADD CONSTRAINT "development_plan_item_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_plan_item" ADD CONSTRAINT "development_plan_item_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_plan_item" ADD CONSTRAINT "development_plan_item_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "development_plan_item_player_period_idx" ON "development_plan_item" USING btree ("ssb_id","player_id","period_id","sort_order");--> statement-breakpoint
CREATE POLICY "development_plan_item_tenant" ON "development_plan_item" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Pembuat yang keanggotaannya dihapus tidak menghalangi penghapusan; rencananya tetap ada (lihat 0011).
ALTER TABLE "development_plan_item" FORCE ROW LEVEL SECURITY;
