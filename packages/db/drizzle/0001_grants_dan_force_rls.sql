-- Prasyarat: role ssb_app sudah ada (lihat docs/database.md). Role ini tanpa BYPASSRLS dan bukan pemilik tabel.

-- FORCE: pemilik tabel pun tunduk pada RLS, jadi tidak ada jalan pintas tanpa konteks tenant.
ALTER TABLE "ssb" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_user" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "age_group" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "period" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_guardian" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_assignment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO "ssb_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "ssb_app";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "ssb_app";
