ALTER TABLE "player" ADD COLUMN "nisn" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "guardian_whatsapp" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "document_status" text DEFAULT 'belum' NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "height_cm" smallint;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "weight_kg" real;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "medical_note" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "jersey_no" smallint;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "jersey_size" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "shoe_size" real;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_ssb_nisn" UNIQUE("ssb_id","nisn");--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_document_status" CHECK ("player"."document_status" in ('lengkap', 'sebagian', 'belum'));--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_height_range" CHECK ("player"."height_cm" between 50 and 230);--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_weight_range" CHECK ("player"."weight_kg" between 10 and 200);--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_jersey_no_range" CHECK ("player"."jersey_no" between 0 and 99);--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_shoe_size_range" CHECK ("player"."shoe_size" between 15 and 50);