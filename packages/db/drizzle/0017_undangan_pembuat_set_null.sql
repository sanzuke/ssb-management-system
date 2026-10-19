ALTER TABLE "invitation" DROP CONSTRAINT "invitation_created_by_fk";
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_fk" FOREIGN KEY ("ssb_id","created_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("created_by") ON UPDATE no action;
--> statement-breakpoint
-- Anggota yang dikeluarkan tidak boleh terhalang undangan yang pernah dibuatnya (seperti 0011); hanya created_by yang dikosongkan, ssb_id tetap.
