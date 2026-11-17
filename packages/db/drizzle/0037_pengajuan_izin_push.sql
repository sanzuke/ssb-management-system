CREATE TYPE "public"."absence_kind" AS ENUM('izin', 'sakit');--> statement-breakpoint
CREATE TABLE "absence_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" "absence_kind" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_request_session_player" UNIQUE("session_id","player_id"),
	CONSTRAINT "absence_request_note" CHECK ("absence_request"."note" is null or char_length("absence_request"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "absence_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mobile_login_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"ssb_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "mobile_login_code_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "mobile_login_code_membership_pair" CHECK (("mobile_login_code"."ssb_id" is null) = ("mobile_login_code"."user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "push_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_device_token_unique" UNIQUE("token"),
	CONSTRAINT "push_device_platform" CHECK ("push_device"."platform" in ('android', 'ios', 'web'))
);
--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "absence_request" ADD CONSTRAINT "absence_request_session_fk" FOREIGN KEY ("ssb_id","session_id") REFERENCES "public"."training_session"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_request" ADD CONSTRAINT "absence_request_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_request" ADD CONSTRAINT "absence_request_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_login_code" ADD CONSTRAINT "mobile_login_code_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_login_code" ADD CONSTRAINT "mobile_login_code_user_fk" FOREIGN KEY ("ssb_id","user_id") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_request_player_idx" ON "absence_request" USING btree ("ssb_id","player_id");--> statement-breakpoint
CREATE INDEX "push_device_account_idx" ON "push_device" USING btree ("account_id");--> statement-breakpoint
CREATE POLICY "absence_request_tenant" ON "absence_request" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "absence_request" FORCE ROW LEVEL SECURITY;