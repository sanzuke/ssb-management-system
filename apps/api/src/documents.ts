import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, asc, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { DOCUMENT_LABEL_MAX, DOCUMENT_MAX_BYTES, playerDocumentKindSchema, RAPORT_MAX, type PlayerDocument } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Auth, type Member } from "./auth/middleware";
import { photoStore, sniffImage } from "./photo";
import { visibleTo } from "./players";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const D = schema.playerDocument;

const MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type DocExt = keyof typeof MIME;

/** Tipe berkas ditentukan dari isinya (bukan nama atau Content-Type kiriman klien): PDF atau gambar JPG, PNG, WebP. */
export function sniffDocument(b: Uint8Array): DocExt | null {
  if (b.length > 8 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
  return sniffImage(b);
}

/** Nama berkas asli untuk ditampilkan: tanpa folder, tanpa karakter kontrol, paling panjang 120 karakter. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: justru membuang karakter kontrol
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "berkas").slice(-120);
}

const toView = (r: typeof D.$inferSelect): PlayerDocument => ({
  id: r.id,
  kind: playerDocumentKindSchema.parse(r.kind),
  label: r.label,
  originalName: r.originalName,
  mime: r.mime as PlayerDocument["mime"],
  sizeBytes: r.sizeBytes,
  uploadedAt: r.createdAt.toISOString(),
});

/**
 * Berkas siswa: kartu keluarga, akta kelahiran, NISN, dan raport. Data pribadi keluarga, jadi hanya admin SSB dan
 * orang tua anaknya (izin `document.read` dan `document.write`). Siswa di luar batas peran dijawab 404.
 */
export function documentRoutes(db: Db, opts: { uploadDir: string }) {
  const store = photoStore(opts.uploadDir);
  const member = (c: { get: (k: "auth") => Auth | undefined }): Member => c.get("auth")!.member!;
  const idOf = (raw: string, what: string) => {
    if (!UUID.test(raw)) throw new HttpError(404, "not_found", `${what} tidak ditemukan`);
    return raw;
  };
  const ensurePlayer = async (tx: Tx, m: Member, playerId: string) => {
    const [p] = await tx
      .select({ id: schema.player.id })
      .from(schema.player)
      .where(and(eq(schema.player.id, playerId), visibleTo(m)))
      .limit(1);
    if (!p) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
  };
  /** Berkas satu siswa yang boleh dilihat pemanggil; null bila siswa atau berkas tidak ada atau di luar batas. */
  const findDoc = async (tx: Tx, m: Member, playerId: string, docId: string) => {
    const [row] = await tx
      .select({ doc: D })
      .from(D)
      .innerJoin(schema.player, and(eq(schema.player.ssbId, D.ssbId), eq(schema.player.id, D.playerId)))
      .where(and(eq(D.id, docId), eq(D.playerId, playerId), visibleTo(m)))
      .limit(1);
    return row?.doc ?? null;
  };

  return new Hono<AppEnv>()
    .get("/players/:id/documents", requirePermission("document.read"), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("id"), "Siswa");
      const rows = await withTenant(db, m.ssbId, async (tx) => {
        await ensurePlayer(tx, m, playerId);
        return tx.select().from(D).where(eq(D.playerId, playerId)).orderBy(asc(D.kind), asc(D.createdAt));
      });
      return c.json(rows.map(toView));
    })

    // Kolom form: kind, label (wajib untuk raport), file. Selain raport, berkas baru menggantikan yang lama.
    .post(
      "/players/:id/documents",
      requirePermission("document.write"),
      bodyLimit({
        maxSize: DOCUMENT_MAX_BYTES + 64 * 1024,
        onError: () => {
          throw new HttpError(413, "document_too_large", "Berkas terlalu besar (maksimal 5 MB)");
        },
      }),
      async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("id"), "Siswa");
        const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
        const kind = playerDocumentKindSchema.safeParse(body.kind);
        if (!kind.success) throw new HttpError(400, "bad_request", "Jenis berkas tidak dikenal", { kind: "tidak dikenal" });
        const label = typeof body.label === "string" ? body.label.trim() : "";
        if (label.length > DOCUMENT_LABEL_MAX) throw new HttpError(400, "bad_request", `Keterangan maksimal ${DOCUMENT_LABEL_MAX} karakter`, { label: `maksimal ${DOCUMENT_LABEL_MAX} karakter` });
        if (kind.data === "raport" && !label) throw new HttpError(400, "bad_request", "Keterangan raport wajib diisi, mis. Semester 1 2025/2026", { label: "wajib diisi" });
        const file = body.file;
        if (!(file instanceof File)) throw new HttpError(400, "bad_request", 'Kirim berkas pada kolom "file"');
        if (file.size === 0) throw new HttpError(400, "bad_request", "Berkas kosong");
        if (file.size > DOCUMENT_MAX_BYTES) throw new HttpError(413, "document_too_large", "Berkas terlalu besar (maksimal 5 MB)");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = sniffDocument(bytes);
        if (!ext) throw new HttpError(415, "document_type", "Berkas harus berformat PDF, JPG, PNG, atau WebP");

        const key = `${m.ssbId}/dokumen/${playerId}-${kind.data}-${randomBytes(4).toString("hex")}.${ext}`;
        let saved = false;
        try {
          const { row, oldKey } = await withTenant(db, m.ssbId, async (tx) => {
            await ensurePlayer(tx, m, playerId);
            let oldKey: string | null = null;
            if (kind.data === "raport") {
              const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.playerId, playerId), eq(D.kind, "raport")));
              if ((n?.n ?? 0) >= RAPORT_MAX) throw new HttpError(409, "raport_limit", `Raport maksimal ${RAPORT_MAX} berkas per siswa. Hapus yang lama dulu`);
            } else {
              const [old] = await tx.select({ id: D.id, key: D.fileKey }).from(D).where(and(eq(D.playerId, playerId), eq(D.kind, kind.data))).limit(1);
              if (old) {
                await tx.delete(D).where(eq(D.id, old.id));
                oldKey = old.key;
              }
            }
            await store.put(key, bytes);
            saved = true;
            const [row] = await tx
              .insert(D)
              .values({
                ssbId: m.ssbId,
                playerId,
                kind: kind.data,
                label: label || null,
                fileKey: key,
                mime: MIME[ext],
                originalName: cleanFileName(file.name),
                sizeBytes: file.size,
                uploadedBy: m.userId,
              })
              .returning();
            return { row: row!, oldKey };
          });
          if (oldKey) await store.remove(oldKey);
          return c.json(toView(row), 201);
        } catch (e) {
          if (saved) await store.remove(key);
          throw e;
        }
      },
    )

    .get("/players/:id/documents/:docId/file", requirePermission("document.read"), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("id"), "Siswa");
      const docId = idOf(c.req.param("docId"), "Berkas");
      const doc = await withTenant(db, m.ssbId, (tx) => findDoc(tx, m, playerId, docId));
      const bytes = doc ? await store.get(doc.fileKey) : null;
      if (!doc || !bytes) throw new HttpError(404, "not_found", "Berkas tidak ditemukan");
      return c.body(bytes, 200, {
        "content-type": doc.mime,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      });
    })

    .delete("/players/:id/documents/:docId", requirePermission("document.write"), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("id"), "Siswa");
      const docId = idOf(c.req.param("docId"), "Berkas");
      const key = await withTenant(db, m.ssbId, async (tx) => {
        const doc = await findDoc(tx, m, playerId, docId);
        if (!doc) throw new HttpError(404, "not_found", "Berkas tidak ditemukan");
        await tx.delete(D).where(eq(D.id, docId));
        return doc.fileKey;
      });
      await store.remove(key);
      return c.body(null, 204);
    });
}
