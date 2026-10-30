CREATE TABLE "player_injury" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"body_part" text NOT NULL,
	"started_on" date NOT NULL,
	"expected_return_on" date,
	"recovered_on" date,
	"note" text,
	"recorded_by" uuid,
	"recovered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_injury_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_injury_expected" CHECK ("player_injury"."expected_return_on" is null or "player_injury"."expected_return_on" >= "player_injury"."started_on"),
	CONSTRAINT "player_injury_recovered" CHECK ("player_injury"."recovered_on" is null or "player_injury"."recovered_on" >= "player_injury"."started_on"),
	CONSTRAINT "player_injury_note" CHECK ("player_injury"."note" is null or char_length("player_injury"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "player_injury" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_injury" ADD CONSTRAINT "player_injury_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_injury" ADD CONSTRAINT "player_injury_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_injury" ADD CONSTRAINT "player_injury_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recorded_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_injury" ADD CONSTRAINT "player_injury_recovered_by_fk" FOREIGN KEY ("ssb_id","recovered_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recovered_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_injury_player" ON "player_injury" USING btree ("ssb_id","player_id","started_on");--> statement-breakpoint
CREATE POLICY "player_injury_tenant" ON "player_injury" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Pencatat yang keanggotaannya dihapus tidak menghalangi penghapusan; catatan cederanya tetap ada (lihat 0011).
ALTER TABLE "player_injury" FORCE ROW LEVEL SECURITY;