CREATE TABLE "site_content" (
	"ssb_id" uuid PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_published_pair" CHECK (("site_content"."published" is null) = ("site_content"."published_at" is null))
);
--> statement-breakpoint
ALTER TABLE "site_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"code" text NOT NULL,
	"child_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"gender" text NOT NULL,
	"program_id" text,
	"parent_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"preferred_session" text,
	"apply_scholarship" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" text DEFAULT 'baru' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_registration_ssb_code" UNIQUE("ssb_id","code"),
	CONSTRAINT "trial_registration_status" CHECK ("trial_registration"."status" in ('baru', 'dihubungi', 'diterima', 'ditolak')),
	CONSTRAINT "trial_registration_gender" CHECK ("trial_registration"."gender" in ('Putra', 'Putri'))
);
--> statement-breakpoint
ALTER TABLE "trial_registration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_content" ADD CONSTRAINT "site_content_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_content" ADD CONSTRAINT "site_content_published_by_fk" FOREIGN KEY ("ssb_id","published_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("published_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD CONSTRAINT "trial_registration_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_registration_status_idx" ON "trial_registration" USING btree ("ssb_id","status","created_at");--> statement-breakpoint
CREATE POLICY "site_content_tenant" ON "site_content" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "trial_registration_tenant" ON "trial_registration" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
-- Seperti tabel lain: pemilik tabel pun tunduk pada RLS. Anggota yang dikeluarkan tidak menghalangi (hanya published_by yang dikosongkan).
ALTER TABLE "site_content" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_registration" FORCE ROW LEVEL SECURITY;