CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	CONSTRAINT "location_ssb_name" UNIQUE("ssb_id","name"),
	CONSTRAINT "location_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_ssb_name" UNIQUE("ssb_id","name");--> statement-breakpoint
ALTER TABLE "age_group" ADD CONSTRAINT "age_group_range" CHECK ("age_group"."min_age" >= 0 AND "age_group"."max_age" >= "age_group"."min_age");--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_dates" CHECK ("period"."end_date" >= "period"."start_date");--> statement-breakpoint
CREATE POLICY "location_tenant" ON "location" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
ALTER TABLE "location" FORCE ROW LEVEL SECURITY;