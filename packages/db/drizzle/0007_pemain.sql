CREATE TABLE "player_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"field" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_history_field" CHECK ("player_history"."field" in ('age_group', 'status'))
);
--> statement-breakpoint
ALTER TABLE "player_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ssb" ADD COLUMN "member_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_history" ADD CONSTRAINT "player_history_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_history_player_idx" ON "player_history" USING btree ("ssb_id","player_id","changed_at");--> statement-breakpoint
CREATE POLICY "player_history_tenant" ON "player_history" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
ALTER TABLE "player_history" FORCE ROW LEVEL SECURITY;