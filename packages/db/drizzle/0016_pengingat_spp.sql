ALTER TABLE "invoice" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;