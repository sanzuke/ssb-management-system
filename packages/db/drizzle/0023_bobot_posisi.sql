CREATE TABLE "position_weight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"position" "player_position" NOT NULL,
	"indicator" text NOT NULL,
	"weight" smallint NOT NULL,
	CONSTRAINT "position_weight_unique" UNIQUE("ssb_id","position","indicator"),
	CONSTRAINT "position_weight_range" CHECK ("position_weight"."weight" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "position_weight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position_weight" ADD CONSTRAINT "position_weight_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "position_weight_tenant" ON "position_weight" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "position_weight" FORCE ROW LEVEL SECURITY;