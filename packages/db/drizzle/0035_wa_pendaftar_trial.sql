ALTER TABLE "whatsapp_setting" ADD COLUMN "trial_reply_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD COLUMN "trial_reply_template" text;--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD COLUMN "trial_notify_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD COLUMN "trial_notify_number" text;--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD CONSTRAINT "whatsapp_setting_trial_template" CHECK ("whatsapp_setting"."trial_reply_template" is null or char_length("whatsapp_setting"."trial_reply_template") between 1 and 1000);--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD CONSTRAINT "whatsapp_setting_trial_number" CHECK ("whatsapp_setting"."trial_notify_number" is null or "whatsapp_setting"."trial_notify_number" ~ '^[0-9]{8,15}$');--> statement-breakpoint
ALTER TABLE "whatsapp_setting" ADD CONSTRAINT "whatsapp_setting_trial_notify_pair" CHECK ("whatsapp_setting"."trial_notify_enabled" = false or "whatsapp_setting"."trial_notify_number" is not null);