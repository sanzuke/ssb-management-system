CREATE TABLE "fee_setting" (
	"ssb_id" uuid PRIMARY KEY NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"reminder_template" text NOT NULL,
	"bank_info" text,
	"reminder_interval_days" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_setting_due_day" CHECK ("fee_setting"."due_day" between 1 and 28),
	CONSTRAINT "fee_setting_interval" CHECK ("fee_setting"."reminder_interval_days" between 0 and 90)
);
--> statement-breakpoint
ALTER TABLE "fee_setting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "player_fee_override" (
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"monthly_fee" integer NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_fee_override_ssb_id_player_id_pk" PRIMARY KEY("ssb_id","player_id"),
	CONSTRAINT "player_fee_override_amount" CHECK ("player_fee_override"."monthly_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "player_fee_override" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_player_month";--> statement-breakpoint
ALTER TABLE "fee_setting" ADD CONSTRAINT "fee_setting_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_fee_override" ADD CONSTRAINT "player_fee_override_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- SET NULL (kolom) butuh PostgreSQL 15 ke atas; hanya created_by yang dikosongkan, ssb_id tetap (kolom wajib).
ALTER TABLE "player_fee_override" ADD CONSTRAINT "player_fee_override_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_player_month" ON "invoice" USING btree ("ssb_id","player_id","month") WHERE voided_at is null;--> statement-breakpoint
CREATE POLICY "fee_setting_tenant" ON "fee_setting" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "player_fee_override_tenant" ON "player_fee_override" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
-- Seperti tabel lain: pemilik tabel pun tunduk pada RLS.
ALTER TABLE "fee_setting" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_fee_override" FORCE ROW LEVEL SECURITY;