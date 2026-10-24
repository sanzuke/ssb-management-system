CREATE TABLE "site_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_media_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "site_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "site_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title_id" text NOT NULL,
	"title_en" text,
	"excerpt_id" text DEFAULT '' NOT NULL,
	"excerpt_en" text,
	"body_id" text NOT NULL,
	"body_en" text,
	"category" text DEFAULT '' NOT NULL,
	"cover_media_id" uuid,
	"cover_alt" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_post_ssb_slug" UNIQUE("ssb_id","slug"),
	CONSTRAINT "site_post_status" CHECK ("site_post"."status" in ('draft', 'published')),
	CONSTRAINT "site_post_published_pair" CHECK (("site_post"."status" = 'published') = ("site_post"."published_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "site_post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_media" ADD CONSTRAINT "site_media_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_media" ADD CONSTRAINT "site_media_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_post" ADD CONSTRAINT "site_post_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_post" ADD CONSTRAINT "site_post_cover_fk" FOREIGN KEY ("ssb_id","cover_media_id") REFERENCES "public"."site_media"("ssb_id","id") ON DELETE SET NULL ("cover_media_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_post" ADD CONSTRAINT "site_post_author_fk" FOREIGN KEY ("ssb_id","author_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("author_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_post_list_idx" ON "site_post" USING btree ("ssb_id","status","published_at");--> statement-breakpoint
CREATE POLICY "site_media_tenant" ON "site_media" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "site_post_tenant" ON "site_post" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Seperti tabel lain: pemilik tabel pun tunduk pada RLS. Menghapus anggota atau gambar hanya mengosongkan rujukannya, tidak menghapus artikel.
ALTER TABLE "site_media" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_post" FORCE ROW LEVEL SECURITY;
