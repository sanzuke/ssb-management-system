import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import {
  merchandiseOrderInputSchema,
  merchandiseOrderStatusSchema,
  merchandiseProductInputSchema,
  type MerchandiseOrderRow,
  type MerchandiseOrderStatusInput,
  type MerchandiseProductInput,
  type MerchandiseProductRow,
  type MerchandiseStatus,
} from "@ssb/shared";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { HttpError } from "./errors";
import { zv } from "./validator";
import { photoStore, sniffImage } from "./photo";
import { ssbIdBySlug } from "./auth/service";
import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};

function toProductRow(r: typeof schema.merchandiseProduct.$inferSelect): MerchandiseProductRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    hpp: r.hpp,
    stock: r.stock,
    imageFileKey: r.imageFileKey,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toOrderRow(
  r: typeof schema.merchandiseOrder.$inferSelect,
  items: Array<{ id: string; productId: string | null; productName: string; unitPrice: number; quantity: number }>,
): MerchandiseOrderRow {
  return {
    id: r.id,
    buyerName: r.buyerName,
    buyerWhatsapp: r.buyerWhatsapp,
    shippingAddress: r.shippingAddress,
    total: r.total,
    status: r.status as MerchandiseStatus,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    items: items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
    })),
  };
}

/** Merchandise untuk admin SSB: CRUD produk dan kelola pesanan. */
export function merchandiseRoutes(db: Db) {
  const store = photoStore(process.env.UPLOAD_DIR ?? "./uploads");
  return (
    new Hono<AppEnv>()
      /** Daftar produk merchandise (admin). */
      .get("/merchandise", requirePermission("merchandise.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          return tx.select().from(schema.merchandiseProduct).orderBy(desc(schema.merchandiseProduct.createdAt));
        });
        return c.json(rows.map(toProductRow));
      })

      /** Daftar produk aktif untuk landing (publik, tanpa sesi). */
      .get("/public/merchandise/products", async (c) => {
        const slug = c.req.query("ssb");
        if (!slug) throw new HttpError(400, "bad_request", "Parameter ssb wajib diisi");
        const ssbId = await ssbIdBySlug(db, slug.toLowerCase());
        if (!ssbId) throw notFound("Situs");
        const rows = await withTenant(db, ssbId, async (tx) => {
          return tx
            .select()
            .from(schema.merchandiseProduct)
            .where(eq(schema.merchandiseProduct.active, true))
            .orderBy(desc(schema.merchandiseProduct.createdAt));
        });
        return c.json(rows.map(toProductRow));
      })

      /** Buat pesanan publik (tanpa sesi). */
      .post("/public/merchandise/orders", zv("json", merchandiseOrderInputSchema), async (c) => {
        const b = c.req.valid("json");
        const ssbSlug = c.req.query("ssb");
        if (!ssbSlug) throw new HttpError(400, "bad_request", "Parameter ssb wajib diisi");
        const ssbId = await ssbIdBySlug(db, ssbSlug.toLowerCase());
        if (!ssbId) throw notFound("Situs");

        const out = await withTenant(db, ssbId, async (tx) => {
          // Validasi stok dan hitung total
          const productMap = new Map<string, { price: number; stock: number; name: string }>();
          let total = 0;
          for (const item of b.items) {
            const [p] = await tx
              .select()
              .from(schema.merchandiseProduct)
              .where(eq(schema.merchandiseProduct.id, item.productId))
              .limit(1);
            if (!p) throw new HttpError(404, "not_found", `Produk ${item.productId} tidak ditemukan`);
            if (!p.active) throw new HttpError(400, "bad_request", `Produk ${p.name} tidak aktif`);
            if (p.stock < item.quantity) throw new HttpError(400, "bad_request", `Stok ${p.name} tidak cukup`);
            productMap.set(item.productId, { price: p.price, stock: p.stock, name: p.name });
            total += p.price * item.quantity;
          }

          // Kurangi stok dan buat pesanan
          for (const item of b.items) {
            const p = productMap.get(item.productId)!;
            await tx
              .update(schema.merchandiseProduct)
              .set({ stock: p.stock - item.quantity })
              .where(eq(schema.merchandiseProduct.id, item.productId));
          }

          const [order] = await tx
            .insert(schema.merchandiseOrder)
            .values({
              ssbId,
              buyerName: b.buyerName,
              buyerWhatsapp: b.buyerWhatsapp,
              shippingAddress: b.shippingAddress,
              total,
              status: "pending",
            })
            .returning();

          if (!order) throw new HttpError(500, "insert_failed", "Gagal membuat pesanan");

          for (const item of b.items) {
            const p = productMap.get(item.productId)!;
            await tx.insert(schema.merchandiseOrderItem).values({
              id: randomUUID(),
              ssbId,
              orderId: order.id,
              productId: item.productId,
              productName: p.name,
              unitPrice: p.price,
              quantity: item.quantity,
            });
          }

          const fullItems = await tx.select().from(schema.merchandiseOrderItem).where(eq(schema.merchandiseOrderItem.orderId, order.id));
          return toOrderRow(order, fullItems);
        });
        return c.json(out, 201);
      })

      /** Buat produk baru (admin). */
      .post(
        "/merchandise",
        requirePermission("merchandise.manage"),
        zv("json", merchandiseProductInputSchema),
        async (c) => {
          const m = c.get("auth")!.member!;
          const b = c.req.valid("json");
          const out = await withTenant(db, m.ssbId, async (tx) => {
            const [row] = await tx
              .insert(schema.merchandiseProduct)
              .values({
                ssbId: m.ssbId,
                name: b.name,
                description: b.description ?? "",
                price: b.price,
                hpp: b.hpp,
                stock: b.stock,
                imageFileKey: b.imageFileKey ?? null,
                active: b.active,
              })
              .returning();
            if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan produk");
            return toProductRow(row);
          });
          return c.json(out, 201);
        },
      )

      /** Ubah produk (admin). */
      .put(
        "/merchandise/:id",
        requirePermission("merchandise.manage"),
        zv("json", merchandiseProductInputSchema),
        async (c) => {
          const m = c.get("auth")!.member!;
          const id = idOr404(c.req.param("id"), "Produk");
          const b = c.req.valid("json");
          const out = await withTenant(db, m.ssbId, async (tx) => {
            const [cur] = await tx
              .select()
              .from(schema.merchandiseProduct)
              .where(eq(schema.merchandiseProduct.id, id))
              .limit(1);
            if (!cur) throw notFound("Produk");
            const [row] = await tx
              .update(schema.merchandiseProduct)
              .set({
                name: b.name,
                description: b.description ?? "",
                price: b.price,
                hpp: b.hpp,
                stock: b.stock,
                imageFileKey: b.imageFileKey ?? null,
                active: b.active,
                updatedAt: new Date(),
              })
              .where(eq(schema.merchandiseProduct.id, id))
              .returning();
            if (!row) throw notFound("Produk");
            return toProductRow(row);
          });
          return c.json(out);
        },
      )

      /** Hapus produk (admin). */
      .delete("/merchandise/:id", requirePermission("merchandise.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Produk");
        await withTenant(db, m.ssbId, async (tx) => {
          const [cur] = await tx.select().from(schema.merchandiseProduct).where(eq(schema.merchandiseProduct.id, id)).limit(1);
          if (!cur) throw notFound("Produk");
          await tx.delete(schema.merchandiseProduct).where(eq(schema.merchandiseProduct.id, id));
        });
        return c.json({ ok: true });
      })

      /** Unggah foto produk (admin). */
      .post(
        "/merchandise/:id/foto",
        requirePermission("merchandise.manage"),
        async (c) => {
          const m = c.get("auth")!.member!;
          const id = idOr404(c.req.param("id"), "Produk");
          const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
          const file = body.file;
          if (!(file instanceof File)) throw new HttpError(400, "bad_request", 'Kirim gambar pada kolom "file"');
          const bytes = new Uint8Array(await file.arrayBuffer());
          const ext = sniffImage(bytes);
          if (!ext) throw new HttpError(415, "media_type", "Gambar harus berformat JPG, PNG, atau WebP");
          if (bytes.length > 2 * 1024 * 1024) throw new HttpError(413, "media_too_large", "Gambar terlalu besar (maksimal 2 MB)");
          await withTenant(db, m.ssbId, async (tx) => {
            const [row] = await tx.select().from(schema.merchandiseProduct).where(eq(schema.merchandiseProduct.id, id)).limit(1);
            if (!row) throw notFound("Produk");
            return row;
          });
          const key = `${m.ssbId}/merchandise/${id}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          await store.put(key, bytes);
          const row = await withTenant(db, m.ssbId, async (tx) => {
            const [updated] = await tx
              .update(schema.merchandiseProduct)
              .set({ imageFileKey: key, updatedAt: new Date() })
              .where(eq(schema.merchandiseProduct.id, id))
              .returning();
            if (!updated) throw notFound("Produk");
            return updated;
          });
          return c.json(toProductRow(row));
        },
      )

      /** Daftar pesanan merchandise (admin). */
      .get("/merchandise/orders", requirePermission("merchandise.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          const orders = await tx.select().from(schema.merchandiseOrder).orderBy(desc(schema.merchandiseOrder.createdAt));
          const out: MerchandiseOrderRow[] = [];
          for (const o of orders) {
            const items = await tx.select().from(schema.merchandiseOrderItem).where(eq(schema.merchandiseOrderItem.orderId, o.id));
            out.push(toOrderRow(o, items));
          }
          return out;
        });
        return c.json(rows);
      })

      /** Ubah status pesanan (admin). */
      .patch(
        "/merchandise/orders/:id",
        requirePermission("merchandise.manage"),
        zv("json", merchandiseOrderStatusSchema),
        async (c) => {
          const m = c.get("auth")!.member!;
          const id = idOr404(c.req.param("id"), "Pesanan");
          const b = c.req.valid("json");
          const out = await withTenant(db, m.ssbId, async (tx) => {
            const [cur] = await tx.select().from(schema.merchandiseOrder).where(eq(schema.merchandiseOrder.id, id)).limit(1);
            if (!cur) throw notFound("Pesanan");
            const [row] = await tx
              .update(schema.merchandiseOrder)
              .set({ status: b.status, adminNote: b.adminNote ?? null, updatedAt: new Date() })
              .where(eq(schema.merchandiseOrder.id, id))
              .returning();
            if (!row) throw notFound("Pesanan");
            const items = await tx.select().from(schema.merchandiseOrderItem).where(eq(schema.merchandiseOrderItem.orderId, id));
            return toOrderRow(row, items);
          });
          return c.json(out);
        },
      )
  );
}
