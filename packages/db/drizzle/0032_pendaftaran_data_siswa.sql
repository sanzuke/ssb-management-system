ALTER TABLE "trial_registration" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "nisn" text;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "school" text;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "position" "player_position";--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "height_cm" smallint;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "weight_kg" real;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "jersey_size" text;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "shoe_size" real;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "medical_note" text;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "commitment_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD COLUMN "media_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trial_registration" ADD CONSTRAINT "trial_registration_height_range" CHECK ("trial_registration"."height_cm" between 50 and 230);--> statement-breakpoint
ALTER TABLE "trial_registration" ADD CONSTRAINT "trial_registration_weight_range" CHECK ("trial_registration"."weight_kg" between 10 and 200);--> statement-breakpoint
ALTER TABLE "trial_registration" ADD CONSTRAINT "trial_registration_shoe_size_range" CHECK ("trial_registration"."shoe_size" between 15 and 50);