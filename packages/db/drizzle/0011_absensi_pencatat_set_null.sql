-- Pencatat absensi yang keanggotaannya dihapus tidak boleh menghalangi penghapusan, dan riwayat absensi harus tetap ada.
-- SET NULL (kolom) butuh PostgreSQL 15 ke atas; hanya recorded_by yang dikosongkan, ssb_id tetap (kolom wajib).
-- Drizzle belum bisa menyatakan ini di schema.ts, jadi jangan menerima hasil `db:generate` yang mengembalikannya ke NO ACTION.
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_recorded_by_fk";--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_fk" FOREIGN KEY ("ssb_id","recorded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("recorded_by");
