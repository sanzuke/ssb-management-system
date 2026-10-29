CREATE TABLE "player_badge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"awarded_by" uuid,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "player_badge_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "player_badge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_badge" ADD CONSTRAINT "player_badge_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badge" ADD CONSTRAINT "player_badge_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badge" ADD CONSTRAINT "player_badge_awarded_by_fk" FOREIGN KEY ("ssb_id","awarded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("awarded_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badge" ADD CONSTRAINT "player_badge_revoked_by_fk" FOREIGN KEY ("ssb_id","revoked_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("revoked_by") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_badge_active" ON "player_badge" USING btree ("ssb_id","player_id","badge") WHERE revoked_at is null;--> statement-breakpoint
CREATE POLICY "player_badge_tenant" ON "player_badge" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Pemberi dan pencabut yang keanggotaannya dihapus tidak menghalangi penghapusan; lencananya tetap ada (lihat 0011).
ALTER TABLE "player_badge" FORCE ROW LEVEL SECURITY;