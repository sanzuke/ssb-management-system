CREATE TYPE "public"."attendance_status" AS ENUM('hadir', 'izin', 'sakit', 'alpa');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('GK', 'DF', 'MF', 'FW');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('aktif', 'cuti', 'keluar');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin_ssb', 'pelatih', 'korlas', 'orang_tua');--> statement-breakpoint
CREATE TABLE "age_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_age" integer NOT NULL,
	"max_age" integer NOT NULL,
	CONSTRAINT "age_group_ssb_name" UNIQUE("ssb_id","name"),
	CONSTRAINT "age_group_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "age_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"whatsapp" text,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_ssb_email" UNIQUE("ssb_id","email"),
	CONSTRAINT "app_user_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attendance" (
	"ssb_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_id_player_id_pk" PRIMARY KEY("session_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_assignment" (
	"ssb_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	CONSTRAINT "coach_assignment_user_id_age_group_id_period_id_pk" PRIMARY KEY("user_id","age_group_id","period_id")
);
--> statement-breakpoint
ALTER TABLE "coach_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "period_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "period" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"member_no" text,
	"full_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"position" "player_position",
	"school" text,
	"photo_key" text,
	"status" "player_status" DEFAULT 'aktif' NOT NULL,
	"age_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_ssb_member_no" UNIQUE("ssb_id","member_no")
);
--> statement-breakpoint
ALTER TABLE "player" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "player_guardian" (
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relationship" text,
	CONSTRAINT "player_guardian_player_id_user_id_pk" PRIMARY KEY("player_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "player_guardian" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ssb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"province" text,
	"plan" text DEFAULT 'dasar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ssb" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	"period_id" uuid,
	"session_date" date NOT NULL,
	"start_time" time,
	"location" text,
	CONSTRAINT "training_session_ssb_id" UNIQUE("ssb_id","id")
);
--> statement-breakpoint
ALTER TABLE "training_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "age_group" ADD CONSTRAINT "age_group_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_fk" FOREIGN KEY ("ssb_id","session_id") REFERENCES "public"."training_session"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_user_fk" FOREIGN KEY ("ssb_id","user_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_guardian" ADD CONSTRAINT "player_guardian_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_guardian" ADD CONSTRAINT "player_guardian_user_fk" FOREIGN KEY ("ssb_id","user_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_age_group_fk" FOREIGN KEY ("ssb_id","age_group_id") REFERENCES "public"."age_group"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_period_fk" FOREIGN KEY ("ssb_id","period_id") REFERENCES "public"."period"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_player_idx" ON "attendance" USING btree ("ssb_id","player_id");--> statement-breakpoint
CREATE INDEX "player_age_group_idx" ON "player" USING btree ("ssb_id","age_group_id");--> statement-breakpoint
CREATE INDEX "training_session_group_date_idx" ON "training_session" USING btree ("ssb_id","age_group_id","session_date");--> statement-breakpoint
CREATE POLICY "age_group_tenant" ON "age_group" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "app_user_tenant" ON "app_user" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "attendance_tenant" ON "attendance" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "coach_assignment_tenant" ON "coach_assignment" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "period_tenant" ON "period" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "player_tenant" ON "player" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "player_guardian_tenant" ON "player_guardian" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "ssb_tenant" ON "ssb" AS PERMISSIVE FOR ALL TO "ssb_app" USING (id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "training_session_tenant" ON "training_session" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);