CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_type" text DEFAULT 'acara' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"start_time" time,
	"end_time" time,
	"location" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "calendar_event_type" CHECK ("calendar_event"."event_type" in ('pertandingan', 'latihan', 'acara', 'libur', 'lainnya')),
	CONSTRAINT "calendar_event_dates" CHECK ("calendar_event"."end_date" is null or "calendar_event"."end_date" >= "calendar_event"."start_date")
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "calendar_event_date_idx" ON "calendar_event" USING btree ("ssb_id","start_date");
--> statement-breakpoint
CREATE POLICY "calendar_event_tenant" ON "calendar_event" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "calendar_event" FORCE ROW LEVEL SECURITY;
