CREATE TABLE "whatsapp_setting" (
	"ssb_id" uuid PRIMARY KEY NOT NULL,
	"token_encrypted" text,
	"country_code" text DEFAULT '62' NOT NULL,
	"auto_reminder" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_setting_country_code" CHECK ("whatsapp_setting"."country_code" ~ '^[0-9]{1,4}$')
);
--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD CONSTRAINT "whatsapp_setting_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "whatsapp_setting_tenant" ON "whatsapp_setting" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
-- Seperti tabel lain: pemilik tabel pun tunduk pada RLS.
ALTER TABLE "whatsapp_setting" FORCE ROW LEVEL SECURITY;