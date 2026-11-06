CREATE TABLE "fundraising_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"calendar_event_id" uuid,
	"target_amount" integer,
	"deadline" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"payment_info" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundraising_campaign_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "fundraising_campaign_status" CHECK ("fundraising_campaign"."status" in ('draft', 'aktif', 'selesai')),
	CONSTRAINT "fundraising_campaign_target" CHECK ("fundraising_campaign"."target_amount" is null or "fundraising_campaign"."target_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "fundraising_campaign" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "fundraising_pledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"donor_id" uuid,
	"donor_name" text NOT NULL,
	"donor_whatsapp" text,
	"kind" text DEFAULT 'donasi' NOT NULL,
	"amount" integer NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"received_on" date,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundraising_pledge_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "fundraising_pledge_kind" CHECK ("fundraising_pledge"."kind" in ('donasi', 'sponsor')),
	CONSTRAINT "fundraising_pledge_status" CHECK ("fundraising_pledge"."status" in ('menunggu', 'diterima', 'ditolak')),
	CONSTRAINT "fundraising_pledge_amount" CHECK ("fundraising_pledge"."amount" between 1 and 1000000000),
	CONSTRAINT "fundraising_pledge_received_pair" CHECK (("fundraising_pledge"."status" = 'diterima') = ("fundraising_pledge"."received_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fundraising_campaign" ADD CONSTRAINT "fundraising_campaign_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fundraising_campaign" ADD CONSTRAINT "fundraising_campaign_event_fk" FOREIGN KEY ("ssb_id","calendar_event_id") REFERENCES "public"."calendar_event"("ssb_id","id") ON DELETE SET NULL ("calendar_event_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fundraising_campaign" ADD CONSTRAINT "fundraising_campaign_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ADD CONSTRAINT "fundraising_pledge_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ADD CONSTRAINT "fundraising_pledge_campaign_fk" FOREIGN KEY ("ssb_id","campaign_id") REFERENCES "public"."fundraising_campaign"("ssb_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ADD CONSTRAINT "fundraising_pledge_donor_fk" FOREIGN KEY ("ssb_id","donor_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("donor_id") ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "fundraising_campaign_status_idx" ON "fundraising_campaign" USING btree ("ssb_id","status");
--> statement-breakpoint
CREATE INDEX "fundraising_pledge_campaign_idx" ON "fundraising_pledge" USING btree ("ssb_id","campaign_id","status");
--> statement-breakpoint
CREATE INDEX "fundraising_pledge_donor_idx" ON "fundraising_pledge" USING btree ("ssb_id","donor_id");
--> statement-breakpoint
CREATE POLICY "fundraising_campaign_tenant" ON "fundraising_campaign" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "fundraising_pledge_tenant" ON "fundraising_pledge" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "fundraising_campaign" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fundraising_pledge" FORCE ROW LEVEL SECURITY;
