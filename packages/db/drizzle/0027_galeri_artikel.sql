CREATE TABLE "site_article_gallery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_article_gallery_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "site_article_gallery" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "site_article_gallery" ADD CONSTRAINT "site_article_gallery_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_article_gallery" ADD CONSTRAINT "site_article_gallery_post_id" FOREIGN KEY ("ssb_id","post_id") REFERENCES "public"."site_post"("ssb_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_article_gallery" ADD CONSTRAINT "site_article_gallery_media_id" FOREIGN KEY ("ssb_id","media_id") REFERENCES "public"."site_media"("ssb_id","id") ON DELETE SET NULL ("media_id") ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "site_article_gallery_post_idx" ON "site_article_gallery" USING btree ("ssb_id","post_id","sort_order");
--> statement-breakpoint
CREATE POLICY "site_article_gallery_tenant" ON "site_article_gallery" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "site_article_gallery" FORCE ROW LEVEL SECURITY;
