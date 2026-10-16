CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"google_sub" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_email_unique" UNIQUE("email"),
	CONSTRAINT "account_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "account_has_credential" CHECK ("account"."password_hash" is not null or "account"."google_sub" is not null)
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"label" text,
	"player_id" uuid,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "user_session_user_idx";--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "ssb_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "account_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_session" ADD COLUMN "account_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_session_account_idx" ON "user_session" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_ssb_account" UNIQUE("ssb_id","account_id");--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_membership_pair" CHECK (("user_session"."ssb_id" is null) = ("user_session"."user_id" is null));--> statement-breakpoint
CREATE POLICY "app_user_own_memberships" ON "app_user" AS PERMISSIVE FOR SELECT TO "ssb_app" USING (account_id = nullif(current_setting('app.account_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "ssb_member_read" ON "ssb" AS PERMISSIVE FOR SELECT TO "ssb_app" USING (id in (select ssb_id from app_user where account_id = nullif(current_setting('app.account_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "invitation_tenant" ON "invitation" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);