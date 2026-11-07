ALTER TABLE "fundraising_campaign" ADD COLUMN "packages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ADD COLUMN "package_name" text;--> statement-breakpoint
ALTER TABLE "fundraising_pledge" ADD COLUMN "from_landing" boolean DEFAULT false NOT NULL;