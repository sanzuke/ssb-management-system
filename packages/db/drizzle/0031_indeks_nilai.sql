CREATE TABLE "player_market_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	"mvi" integer,
	"category" text,
	"coverage" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_by" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_market_value_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_market_value_player_period" UNIQUE("ssb_id","player_id","period_id"),
	CONSTRAINT "player_market_value_range" CHECK ("player_market_value"."mvi" is null or "player_market_value"."mvi" between 0 and 100),
	CONSTRAINT "player_market_value_pair" CHECK (("player_market_value"."mvi" is null) = ("player_market_value"."category" is null)),
	CONSTRAINT "player_market_value_category" CHECK ("player_market_value"."category" is null or "player_market_value"."category" in ('Sangat Rendah', 'Rendah', 'Baik', 'Sangat Baik', 'Elit')),
	CONSTRAINT "player_market_value_coverage" CHECK ("player_market_value"."coverage" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "player_market_value" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "player_match_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"starts" integer DEFAULT 0 NOT NULL,
	"yellow_cards" integer DEFAULT 0 NOT NULL,
	"red_cards" integer DEFAULT 0 NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_match_stat_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_match_stat_player_period" UNIQUE("ssb_id","player_id","period_id"),
	CONSTRAINT "player_match_stat_range" CHECK ("player_match_stat"."matches_played" between 0 and 200 and "player_match_stat"."goals" between 0 and 500 and "player_match_stat"."assists" between 0 and 500),
	CONSTRAINT "player_match_stat_within_matches" CHECK ("player_match_stat"."starts" between 0 and "player_match_stat"."matches_played" and "player_match_stat"."yellow_cards" between 0 and "player_match_stat"."matches_played" and "player_match_stat"."red_cards" between 0 and "player_match_stat"."matches_played")
);
--> statement-breakpoint
ALTER TABLE "player_match_stat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "player_physical_test" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"tested_on" date NOT NULL,
	"speed_30m" real,
	"zig_zag" real,
	"vertical_jump" real,
	"bleep_level" real,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_physical_test_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_physical_test_player_day" UNIQUE("ssb_id","player_id","tested_on"),
	CONSTRAINT "player_physical_test_any" CHECK ("player_physical_test"."speed_30m" is not null or "player_physical_test"."zig_zag" is not null or "player_physical_test"."vertical_jump" is not null or "player_physical_test"."bleep_level" is not null),
	CONSTRAINT "player_physical_test_range" CHECK (("player_physical_test"."speed_30m" is null or "player_physical_test"."speed_30m" between 3 and 15) and ("player_physical_test"."zig_zag" is null or "player_physical_test"."zig_zag" between 5 and 40) and ("player_physical_test"."vertical_jump" is null or "player_physical_test"."vertical_jump" between 5 and 100) and ("player_physical_test"."bleep_level" is null or "player_physical_test"."bleep_level" between 1 and 21))
);
--> statement-breakpoint
ALTER TABLE "player_physical_test" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_market_value" ADD CONSTRAINT "player_market_value_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_market_value" ADD CONSTRAINT "player_market_value_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_market_value" ADD CONSTRAINT "player_market_value_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_market_value" ADD CONSTRAINT "player_market_value_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_market_value" ADD CONSTRAINT "player_market_value_computed_by_fk" FOREIGN KEY ("ssb_id","computed_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("computed_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recorded_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_physical_test" ADD CONSTRAINT "player_physical_test_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_physical_test" ADD CONSTRAINT "player_physical_test_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_physical_test" ADD CONSTRAINT "player_physical_test_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recorded_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_market_value_group_idx" ON "player_market_value" USING btree ("ssb_id","age_group_id","period_id");--> statement-breakpoint
CREATE INDEX "player_physical_test_player_idx" ON "player_physical_test" USING btree ("ssb_id","player_id","tested_on");--> statement-breakpoint
CREATE POLICY "player_market_value_tenant" ON "player_market_value" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "player_match_stat_tenant" ON "player_match_stat" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "player_physical_test_tenant" ON "player_physical_test" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "player_market_value" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_match_stat" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_physical_test" FORCE ROW LEVEL SECURITY;