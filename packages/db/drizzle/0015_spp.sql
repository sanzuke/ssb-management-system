CREATE TYPE "public"."payment_method" AS ENUM('tunai', 'transfer', 'lainnya');--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount" integer NOT NULL,
	"due_on" date NOT NULL,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "invoice_player_month" UNIQUE("ssb_id","player_id","month"),
	CONSTRAINT "invoice_amount" CHECK ("invoice"."amount" > 0),
	CONSTRAINT "invoice_month_first_day" CHECK (extract(day from "invoice"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" DEFAULT 'tunai' NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount" CHECK ("payment"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "age_group" ADD COLUMN "monthly_fee" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_fk" FOREIGN KEY ("ssb_id","invoice_id") REFERENCES "public"."invoice"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recorded_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_month_idx" ON "invoice" USING btree ("ssb_id","month");--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("ssb_id","invoice_id");--> statement-breakpoint
ALTER TABLE "age_group" ADD CONSTRAINT "age_group_fee" CHECK ("age_group"."monthly_fee" is null or "age_group"."monthly_fee" >= 0);--> statement-breakpoint
CREATE POLICY "invoice_tenant" ON "invoice" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "payment_tenant" ON "payment" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
-- Seperti tabel lain: pemilik tabel pun tunduk pada RLS. Pencatat yang keanggotaannya dihapus tidak menghalangi (lihat 0011).
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
