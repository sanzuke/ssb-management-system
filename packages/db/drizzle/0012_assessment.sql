CREATE TYPE "public"."assessment_aspect" AS ENUM('technical', 'physical', 'tactical', 'mental', 'movement', 'game_intelligence');--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	"assessed_on" date NOT NULL,
	"note" text,
	"assessor_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "assessment_player_period" UNIQUE("ssb_id","player_id","period_id")
);
--> statement-breakpoint
ALTER TABLE "assessment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_indicator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	"aspect" "assessment_aspect" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "assessment_indicator_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "assessment_indicator_group_name" UNIQUE("ssb_id","age_group_id","name")
);
--> statement-breakpoint
ALTER TABLE "assessment_indicator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_score" (
	"ssb_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	CONSTRAINT "assessment_score_assessment_id_indicator_id_pk" PRIMARY KEY("assessment_id","indicator_id"),
	CONSTRAINT "assessment_score_range" CHECK ("assessment_score"."score" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "assessment_score" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_score_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"old_score" smallint,
	"new_score" smallint NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_score_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_assessor_fk" FOREIGN KEY ("ssb_id","assessor_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("assessor_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_indicator" ADD CONSTRAINT "assessment_indicator_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_indicator" ADD CONSTRAINT "assessment_indicator_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_assessment_fk" FOREIGN KEY ("ssb_id","assessment_id") REFERENCES "public"."assessment"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score" ADD CONSTRAINT "assessment_score_indicator_fk" FOREIGN KEY ("ssb_id","indicator_id") REFERENCES "public"."assessment_indicator"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_log" ADD CONSTRAINT "assessment_score_log_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_log" ADD CONSTRAINT "assessment_score_log_assessment_fk" FOREIGN KEY ("ssb_id","assessment_id") REFERENCES "public"."assessment"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_log" ADD CONSTRAINT "assessment_score_log_indicator_fk" FOREIGN KEY ("ssb_id","indicator_id") REFERENCES "public"."assessment_indicator"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_score_log" ADD CONSTRAINT "assessment_score_log_changed_by_fk" FOREIGN KEY ("ssb_id","changed_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("changed_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_score_log_assessment_idx" ON "assessment_score_log" USING btree ("ssb_id","assessment_id","changed_at");--> statement-breakpoint
CREATE POLICY "assessment_tenant" ON "assessment" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assessment_indicator_tenant" ON "assessment_indicator" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assessment_score_tenant" ON "assessment_score" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assessment_score_log_tenant" ON "assessment_score_log" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Pencatat yang keanggotaannya dihapus tidak menghalangi penghapusan; penilaian dan jejaknya tetap ada (lihat 0011).
ALTER TABLE "assessment_indicator" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_score" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_score_log" FORCE ROW LEVEL SECURITY;
