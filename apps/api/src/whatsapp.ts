import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import { DEFAULT_TRIAL_REPLY_TEMPLATE, trialWaSettingsSchema, whatsappSettingsSchema, whatsappTestSchema, type TrialWaSettings, type WhatsappSettings } from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { dekripsi, enkripsi } from "./crypto";
import { HttpError } from "./errors";
import { kirimFonnte, keFonnte, profilFonnte } from "./fonnte";
import { zv } from "./validator";

/** Pengaturan WhatsApp bawaan: belum ada token, kode negara Indonesia, otomatis nonaktif. */
export const whatsappAwal = (): WhatsappSettings => ({ hasToken: false, countryCode: "62", autoReminder: false });

/** Baca pengaturan WhatsApp milik satu SSB. Nilai token tidak ikut dikembalikan. */
export async function bacaWhatsapp(db: Db, ssbId: string): Promise<WhatsappSettings> {
  return withTenant(db, ssbId, async (tx) => {
    const [row] = await tx.select().from(schema.whatsappSetting).where(eq(schema.whatsappSetting.ssbId, ssbId)).limit(1);
    if (!row) return whatsappAwal();
    return { hasToken: row.tokenEncrypted !== null, countryCode: row.countryCode, autoReminder: row.autoReminder };
  });
}

/**
 * Token Fonnte milik satu SSB dalam bentuk/plain. Null bila belum diatur atau
 * tidak bisa didekripsi (mis. kunci server berubah).
 */
export async function tokenFonnte(db: Db, ssbId: string, secret: string): Promise<string | null> {
  return withTenant(db, ssbId, async (tx) => {
    const [row] = await tx.select().from(schema.whatsappSetting).where(eq(schema.whatsappSetting.ssbId, ssbId)).limit(1);
    if (!row?.tokenEncrypted) return null;
    return dekripsi(secret, row.tokenEncrypted);
  });
}

/** Pengaturan pesan untuk pendaftar trial milik satu SSB; templat bawaan dipakai bila belum diubah. */
export async function bacaTrialWa(db: Db, ssbId: string): Promise<TrialWaSettings> {
  return withTenant(db, ssbId, async (tx) => {
    const [row] = await tx.select().from(schema.whatsappSetting).where(eq(schema.whatsappSetting.ssbId, ssbId)).limit(1);
    return {
      hasToken: !!row?.tokenEncrypted,
      replyEnabled: row?.trialReplyEnabled ?? false,
      replyTemplate: row?.trialReplyTemplate ?? DEFAULT_TRIAL_REPLY_TEMPLATE,
      replyTemplateDefault: row?.trialReplyTemplate == null,
      notifyEnabled: row?.trialNotifyEnabled ?? false,
      notifyNumber: row?.trialNotifyNumber ?? null,
    };
  });
}

/**
 * Pengaturan pengiriman WhatsApp lewat Fonnte. Admin menyimpan token API satu
 * kali; server mengenkripsi token itu dan tidak pernah mengirimkannya kembali.
 */
export function whatsappSettingRoutes(db: Db, opts: { secret: string }) {
  return (
    new Hono<AppEnv>()
      // Status pengaturan: apakah token tersimpan, kode negara, dan mode otomatis.
      .get("/whatsapp/settings", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        return c.json(await bacaWhatsapp(db, m.ssbId));
      })

      // Simpan pengaturan. Token kosong menghapus token yang tersimpan.
      .put("/whatsapp/settings", requirePermission("fee.manage"), zv("json", whatsappSettingsSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const b = c.req.valid("json");
        const token = b.token?.trim() ?? "";
        await withTenant(db, m.ssbId, async (tx) => {
          const [lama] = await tx
            .select({ tokenEncrypted: schema.whatsappSetting.tokenEncrypted })
            .from(schema.whatsappSetting)
            .where(eq(schema.whatsappSetting.ssbId, m.ssbId))
            .limit(1);
          // Token kosong berarti hapus; bila tidak, pakai yang baru (disimpan terenkripsi).
          const tokenEncrypted = token ? enkripsi(opts.secret, token) : (lama?.tokenEncrypted ?? null);
          if (!token) {
            // Admin sengaja menghapus token: pengiriman otomatis ikut dimatikan.
            await tx
              .insert(schema.whatsappSetting)
              .values({ ssbId: m.ssbId, tokenEncrypted: null, countryCode: b.countryCode, autoReminder: false, updatedAt: new Date() })
              .onConflictDoUpdate({
                target: schema.whatsappSetting.ssbId,
                set: {
                  tokenEncrypted: null,
                  countryCode: b.countryCode,
                  autoReminder: false,
                  trialReplyEnabled: false,
                  trialNotifyEnabled: false,
                  updatedAt: new Date(),
                },
              });
            return;
          }
          await tx
            .insert(schema.whatsappSetting)
            .values({ ssbId: m.ssbId, tokenEncrypted, countryCode: b.countryCode, autoReminder: b.autoReminder, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: schema.whatsappSetting.ssbId,
              set: { tokenEncrypted, countryCode: b.countryCode, autoReminder: b.autoReminder, updatedAt: new Date() },
            });
        });
        return c.json(await bacaWhatsapp(db, m.ssbId));
      })

      // Periksa token: hubungi Fonnte untuk membaca profil perangkat dan sisa kuota.
      .post("/whatsapp/settings/check", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const token = await tokenFonnte(db, m.ssbId, opts.secret);
        if (!token) throw new HttpError(409, "no_token", "Token API Fonnte belum diisi");
        const profil = await profilFonnte(token);
        if (!profil.ok) throw new HttpError(422, "fonnte_rejected", profil.reason);
        return c.json({
          device: profil.device,
          deviceStatus: profil.deviceStatus,
          name: profil.name,
          quota: profil.quota,
          expired: profil.expired,
          package: profil.package,
        });
      })

      // Kirim satu pesan uji ke nomor yang dipilih, untuk memastikan token dan perangkat siap.
      .post("/whatsapp/test", requirePermission("fee.manage"), zv("json", whatsappTestSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const b = c.req.valid("json");
        const token = await tokenFonnte(db, m.ssbId, opts.secret);
        if (!token) throw new HttpError(409, "no_token", "Token API Fonnte belum diisi");
        const pengaturan = await bacaWhatsapp(db, m.ssbId);
        const hasil = await kirimFonnte({
          token,
          target: keFonnte(b.number, pengaturan.countryCode),
          message: b.message,
          countryCode: pengaturan.countryCode,
        });
        if (!hasil.ok) throw new HttpError(422, "fonnte_rejected", hasil.reason);
        return c.json({ ok: true, ids: hasil.ids });
      })

      // Pengaturan pesan untuk pendaftar trial. Hanya menyimpan pengaturan; pengiriman otomatisnya belum dijalankan server.
      .get("/whatsapp/trial-settings", requirePermission("trial.manage"), async (c) => {
        return c.json(await bacaTrialWa(db, c.get("auth")!.member!.ssbId));
      })
      .put("/whatsapp/trial-settings", requirePermission("trial.manage"), zv("json", trialWaSettingsSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const b = c.req.valid("json");
        const sekarang = await bacaTrialWa(db, m.ssbId);
        if ((b.replyEnabled || b.notifyEnabled) && !sekarang.hasToken) {
          throw new HttpError(409, "no_token", "Token API Fonnte belum diisi. Isi di menu WhatsApp dulu.");
        }
        // Templat yang sama dengan bawaan disimpan kosong, supaya perubahan bawaan di versi berikut ikut berlaku.
        const templat = b.replyTemplate && b.replyTemplate !== DEFAULT_TRIAL_REPLY_TEMPLATE ? b.replyTemplate : null;
        const nilai = {
          trialReplyEnabled: b.replyEnabled,
          trialReplyTemplate: templat,
          trialNotifyEnabled: b.notifyEnabled,
          trialNotifyNumber: b.notifyNumber ?? null,
          updatedAt: new Date(),
        };
        await withTenant(db, m.ssbId, (tx) =>
          tx
            .insert(schema.whatsappSetting)
            .values({ ssbId: m.ssbId, ...nilai })
            .onConflictDoUpdate({ target: schema.whatsappSetting.ssbId, set: nilai }),
        );
        return c.json(await bacaTrialWa(db, m.ssbId));
      })
  );
}
