ALTER TABLE "app_user" DROP CONSTRAINT "app_user_ssb_email";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "password_hash";