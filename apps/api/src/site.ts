import { randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  emptySiteContent,
  playerFormSchema,
  programsFromAgeGroups,
  siteContentSchema,
  trialConvertSchema,
  trialInputSchema,
  trialStatusSchema,
  trialUpdateSchema,
  whatsappSchema,
  type SiteAdminView,
  type SiteContent,
  type SitePublicView,
  type TrialConvertResult,
  type TrialRow,
} from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { ssbIdBySlug, createInvitation } from "./auth/service";
import { HttpError } from "./errors";
import { createRateLimiter } from "./rate-limit";
import { insertPlayer } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);

/** Huruf dan angka tanpa karakter yang mudah tertukar (0/O, 1/I), untuk kode yang dibacakan lewat telepon. */
const KODE_ALFABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const buatKode = () => `TRL-${Array.from({ length: 6 }, () => KODE_ALFABET[randomInt(KODE_ALFABET.length)]).join("")}`;

/** Draf yang tersimpan sudah lolos skema saat disimpan; membaca ulang menjaga dari baris yang diubah di luar API. */
function bacaKonten(raw: unknown, fallbackName: string): SiteContent {
  const p = siteContentSchema.safeParse(raw);
  return p.success ? p.data : emptySiteContent(fallbackName);
}

/** jsonb di PostgreSQL menyusun ulang urutan kunci, jadi bandingkan strukturnya, bukan teks JSON-nya. */
const sama = (a: SiteContent, rawPublished: unknown) => isDeepStrictEqual(a, bacaKonten(rawPublished, ""));

/** Pendaftar beserta nama KU yang dipilih dan siswa hasil konversinya (bila ada). */
const trialSelect = (tx: Tx) =>
  tx
    .select({ t: schema.trialRegistration, kuName: schema.ageGroup.name, playerName: schema.player.fullName })
    .from(schema.trialRegistration)
    .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.trialRegistration.ssbId), eq(schema.ageGroup.id, schema.trialRegistration.ageGroupId)))
    .leftJoin(schema.player, and(eq(schema.player.ssbId, schema.trialRegistration.ssbId), eq(schema.player.id, schema.trialRegistration.playerId)));

const toTrialRow = ({ t: r, kuName, playerName }: Awaited<ReturnType<typeof trialSelect>>[number]): TrialRow => ({
  id: r.id,
  code: r.code,
  childName: r.childName,
  birthDate: r.birthDate,
  gender: r.gender === "Putri" ? "Putri" : "Putra",
  programId: r.programId,
  ageGroup: r.ageGroupId && kuName ? { id: r.ageGroupId, name: kuName } : null,
  player: r.playerId && playerName ? { id: r.playerId, name: playerName } : null,
  parentName: r.parentName,
  phone: r.phone,
  email: r.email,
  address: r.address,
  preferredSession: r.preferredSession,
  applyScholarship: r.applyScholarship,
  notes: r.notes,
  birthPlace: r.birthPlace,
  nisn: r.nisn,
  school: r.school,
  position: r.position,
  heightCm: r.heightCm,
  weightKg: r.weightKg,
  jerseySize: r.jerseySize,
  shoeSize: r.shoeSize,
  medicalNote: r.medicalNote,
  commitmentAcceptedAt: r.commitmentAcceptedAt?.toISOString() ?? null,
  mediaConsent: r.mediaConsent,
  status: trialStatusSchema.catch("baru").parse(r.status),
  adminNote: r.adminNote,
  createdAt: r.createdAt.toISOString(),
});

/** Konten situs dan kotak masuk pendaftar trial, untuk admin SSB. */
export function siteRoutes(db: Db, opts: { webUrl: string }) {
  const baca = async (ssbId: string): Promise<SiteAdminView> =>
    withTenant(db, ssbId, async (tx) => {
      const [s] = await tx.select({ name: schema.ssb.name }).from(schema.ssb).where(eq(schema.ssb.id, ssbId)).limit(1);
      const [row] = await tx.select().from(schema.siteContent).where(eq(schema.siteContent.ssbId, ssbId)).limit(1);
      const name = s?.name ?? "SSB";
      if (!row) return { draft: emptySiteContent(name), dirty: false, published: false, publishedAt: null, updatedAt: null };
      const draft = bacaKonten(row.draft, name);
      return {
        draft,
        dirty: row.published === null ? true : !sama(draft, row.published),
        published: row.published !== null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

  return (
    new Hono<AppEnv>()
      .get("/site", requirePermission("site.manage"), async (c) => c.json(await baca(c.get("auth")!.member!.ssbId)))

      // Simpan draf. Belum tampil ke pengunjung sampai diterbitkan.
      .put("/site", requirePermission("site.manage"), zv("json", siteContentSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const draft = c.req.valid("json");
        await withTenant(db, m.ssbId, (tx) =>
          tx
            .insert(schema.siteContent)
            .values({ ssbId: m.ssbId, draft })
            .onConflictDoUpdate({ target: schema.siteContent.ssbId, set: { draft, updatedAt: new Date() } }),
        );
        return c.json(await baca(m.ssbId));
      })

      // Terbitkan: salinan draf menjadi versi yang dibaca landing.
      .post("/site/publish", requirePermission("site.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const ok = await withTenant(db, m.ssbId, async (tx) => {
          const [row] = await tx.select().from(schema.siteContent).where(eq(schema.siteContent.ssbId, m.ssbId)).limit(1);
          if (!row) return false;
          await tx
            .update(schema.siteContent)
            .set({ published: row.draft, publishedAt: new Date(), publishedBy: m.userId })
            .where(eq(schema.siteContent.ssbId, m.ssbId));
          return true;
        });
        if (!ok) throw new HttpError(409, "no_draft", "Belum ada draf untuk diterbitkan. Simpan konten dulu");
        return c.json(await baca(m.ssbId));
      })

      // Tarik dari publik; draf tetap ada.
      .post("/site/unpublish", requirePermission("site.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        await withTenant(db, m.ssbId, (tx) =>
          tx.update(schema.siteContent).set({ published: null, publishedAt: null, publishedBy: null }).where(eq(schema.siteContent.ssbId, m.ssbId)),
        );
        return c.json(await baca(m.ssbId));
      })

      .get("/trials", requirePermission("trial.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const status = trialStatusSchema.safeParse(c.req.query("status"));
        const rows = await withTenant(db, m.ssbId, (tx) =>
          trialSelect(tx)
            .where(status.success ? eq(schema.trialRegistration.status, status.data) : undefined)
            .orderBy(desc(schema.trialRegistration.createdAt))
            .limit(500),
        );
        return c.json(rows.map(toTrialRow));
      })

      .patch("/trials/:id", requirePermission("trial.manage"), zv("json", trialUpdateSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("id");
        if (!UUID.test(id)) throw notFound("Pendaftar");
        const b = c.req.valid("json");
        const row = await withTenant(db, m.ssbId, async (tx) => {
          const [u] = await tx
            .update(schema.trialRegistration)
            .set({ ...(b.status ? { status: b.status } : {}), ...(b.adminNote !== undefined ? { adminNote: b.adminNote || null } : {}), updatedAt: new Date() })
            .where(and(eq(schema.trialRegistration.id, id), eq(schema.trialRegistration.ssbId, m.ssbId)))
            .returning({ id: schema.trialRegistration.id });
          if (!u) return null;
          const [r] = await trialSelect(tx).where(eq(schema.trialRegistration.id, id));
          return r ?? null;
        });
        if (!row) throw notFound("Pendaftar");
        return c.json(toTrialRow(row));
      })

      // Menjadikan pendaftar sebagai siswa (KU dari pilihan di landing atau yang dikirim admin) lalu membuat undangan orang tua
      // yang langsung terhubung ke siswa itu. Satu pendaftar hanya bisa dikonversi sekali.
      .post("/trials/:id/convert", requirePermission("trial.convert"), zv("json", trialConvertSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("id");
        if (!UUID.test(id)) throw notFound("Pendaftar");
        const b = c.req.valid("json");
        const dibuat = await withTenant(db, m.ssbId, async (tx) => {
          const [t] = await tx.select().from(schema.trialRegistration).where(eq(schema.trialRegistration.id, id)).for("update").limit(1);
          if (!t) throw notFound("Pendaftar");
          if (t.playerId) throw new HttpError(409, "already_converted", "Pendaftar ini sudah dijadikan siswa");
          if (t.status === "ditolak") throw new HttpError(409, "rejected", "Pendaftar ini berstatus ditolak. Ubah statusnya dulu bila ingin menerimanya");
          const ageGroupId = b.ageGroupId !== undefined ? b.ageGroupId : t.ageGroupId;
          const wa = whatsappSchema.safeParse(t.phone.replace(/[^\d+]/g, ""));
          const form = playerFormSchema.safeParse({
            fullName: t.childName,
            birthDate: t.birthDate,
            ageGroupId,
            guardianName: t.parentName,
            guardianWhatsapp: wa.success ? wa.data : null,
            birthPlace: t.birthPlace,
            nisn: t.nisn,
            school: t.school,
            position: t.position,
            heightCm: t.heightCm,
            weightKg: t.weightKg,
            jerseySize: t.jerseySize,
            shoeSize: t.shoeSize,
            medicalNote: t.medicalNote,
          });
          if (!form.success) {
            throw new HttpError(
              422,
              "trial_invalid",
              `Data pendaftar belum memenuhi syarat siswa: ${form.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
            );
          }
          let playerId: string;
          try {
            playerId = await insertPlayer(tx, m.ssbId, form.data);
          } catch (e) {
            const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
            if (code === "23503") throw new HttpError(422, "age_group_invalid", "KU tidak ditemukan di SSB ini");
            if (code === "23505") throw new HttpError(409, "nisn_taken", "NISN pendaftar ini sudah dipakai siswa lain");
            throw e;
          }
          await tx
            .update(schema.trialRegistration)
            .set({ playerId, ageGroupId: ageGroupId ?? null, status: "diterima", updatedAt: new Date() })
            .where(eq(schema.trialRegistration.id, id));
          return { playerId, name: t.childName, label: `Wali ${t.parentName} (${t.code})`.slice(0, 120) };
        });
        const inv = await createInvitation(db, m, { role: "orang_tua", label: dibuat.label, playerId: dibuat.playerId });
        const [row] = await withTenant(db, m.ssbId, (tx) => trialSelect(tx).where(eq(schema.trialRegistration.id, id)));
        const out: TrialConvertResult = {
          trial: toTrialRow(row!),
          player: { id: dibuat.playerId, name: dibuat.name },
          invitation: { url: `${opts.webUrl}/undangan/${inv.token}`, expiresAt: inv.expiresAt.toISOString() },
        };
        return c.json(out, 201);
      })
  );
}

/** Origin landing yang boleh memanggil API publik dari browser (CORS). Kosong = tidak ada. */
export type PublicSiteOptions = { landingOrigins: string[]; trialLimit?: { perIp: number; perSsb: number; windowMs: number } };

/**
 * API publik untuk landing page, tanpa sesi. SSB dikenali dari kode SSB di alamat, bukan dari input lain.
 * Hanya konten yang sudah diterbitkan yang keluar; data siswa tidak pernah terlibat.
 */
export function publicSiteRoutes(db: Db, opts: PublicSiteOptions) {
  const lim = opts.trialLimit ?? { perIp: 5, perSsb: 100, windowMs: 60 * 60 * 1000 };
  const perIp = createRateLimiter({ limit: lim.perIp, windowMs: lim.windowMs });
  const perSsb = createRateLimiter({ limit: lim.perSsb, windowMs: lim.windowMs });

  const app = new Hono<AppEnv>();
  // Hanya origin landing yang terdaftar; tanpa daftar, header CORS tidak dikirim sama sekali.
  if (opts.landingOrigins.length > 0) app.use("/public/*", cors({ origin: opts.landingOrigins, allowMethods: ["GET", "POST", "OPTIONS"], maxAge: 600 }));

  return app
    .get("/public/site/:slug", async (c) => {
      const slug = c.req.param("slug").toLowerCase();
      const ssbId = await ssbIdBySlug(db, slug);
      const gone = notFound("Situs");
      if (!ssbId) throw gone;
      const view = await withTenant(db, ssbId, async (tx) => {
        const [s] = await tx.select({ name: schema.ssb.name }).from(schema.ssb).where(eq(schema.ssb.id, ssbId)).limit(1);
        const [row] = await tx.select().from(schema.siteContent).where(eq(schema.siteContent.ssbId, ssbId)).limit(1);
        if (!s || !row || row.published === null || !row.publishedAt) return null;
        const parsed = siteContentSchema.safeParse(row.published);
        if (!parsed.success) return null;
        // Program ikut KU di Data master supaya pilihan kategori usia di landing selalu sama dengan master.
        const kus = await tx
          .select({ id: schema.ageGroup.id, name: schema.ageGroup.name, minAge: schema.ageGroup.minAge, maxAge: schema.ageGroup.maxAge })
          .from(schema.ageGroup);
        const v: SitePublicView = {
          slug,
          ssbName: s.name,
          publishedAt: row.publishedAt.toISOString(),
          content: { ...parsed.data, programs: programsFromAgeGroups(kus, parsed.data.programs) },
        };
        return v;
      });
      if (!view) throw gone;
      c.header("cache-control", "public, max-age=60");
      return c.json(view);
    })

    .post("/public/site/:slug/trial", zv("json", trialInputSchema), async (c) => {
      const slug = c.req.param("slug").toLowerCase();
      const b = c.req.valid("json");
      // Kolom jebakan terisi berarti bot. Jawab seolah berhasil agar bot tidak menyesuaikan diri.
      if (b.website) return c.json({ code: buatKode() }, 201);
      const ssbId = await ssbIdBySlug(db, slug);
      if (!ssbId) throw notFound("Situs");
      const ip = c.req.header("x-real-ip") ?? "tak-dikenal";
      if (!perIp.allow(`${slug}|${ip}`) || !perSsb.allow(slug)) {
        throw new HttpError(429, "rate_limited", "Terlalu banyak pendaftaran. Coba lagi nanti atau hubungi sekretariat");
      }
      // Pendaftaran hanya diterima bila situs sudah terbit: halaman yang belum tampil tidak punya formulir.
      const code = await withTenant(db, ssbId, async (tx) => {
        const [live] = await tx
          .select({ ok: sql<boolean>`${schema.siteContent.published} is not null` })
          .from(schema.siteContent)
          .where(eq(schema.siteContent.ssbId, ssbId))
          .limit(1);
        if (!live?.ok) return null;
        // KU yang tidak dikenal (konten berubah setelah formulir dibuka, atau id asal-asalan) diabaikan: pendaftaran tetap diterima.
        const [ku] = b.ageGroupId ? await tx.select({ id: schema.ageGroup.id }).from(schema.ageGroup).where(eq(schema.ageGroup.id, b.ageGroupId)).limit(1) : [];
        const ageGroupId = ku?.id ?? null;
        for (let i = 0; i < 5; i++) {
          const kode = buatKode();
          const ins = await tx
            .insert(schema.trialRegistration)
            .values({
              ssbId,
              code: kode,
              childName: b.childName,
              birthDate: b.birthDate,
              gender: b.gender,
              programId: b.programId ?? null,
              ageGroupId,
              parentName: b.parentName,
              phone: b.phone,
              email: b.email || null,
              address: b.address || null,
              preferredSession: b.preferredSession || null,
              applyScholarship: b.applyScholarship,
              notes: b.notes || null,
              birthPlace: b.birthPlace || null,
              nisn: b.nisn || null,
              school: b.school || null,
              position: b.position ?? null,
              heightCm: b.heightCm ?? null,
              weightKg: b.weightKg ?? null,
              jerseySize: b.jerseySize || null,
              shoeSize: b.shoeSize ?? null,
              medicalNote: b.medicalNote || null,
              commitmentAcceptedAt: new Date(),
              mediaConsent: b.mediaConsent,
            })
            .onConflictDoNothing()
            .returning({ code: schema.trialRegistration.code });
          if (ins[0]) return ins[0].code;
        }
        throw new HttpError(500, "code_collision", "Gagal membuat kode pendaftaran. Coba lagi");
      });
      if (!code) throw notFound("Situs");
      return c.json({ code }, 201);
    });
}
