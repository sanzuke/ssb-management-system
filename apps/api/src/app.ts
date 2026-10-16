import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { schema, withTenant, type Db } from "@ssb/db";
import { errorBody, onError } from "./errors";
import { loadAuth, requireRole, type AppEnv } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import type { Health } from "@ssb/shared";
import type { Env } from "./env";

export function createApp(db: Db, env: Pick<Env, "NODE_ENV" | "ALLOWED_ORIGINS">) {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.notFound((c) => c.json(errorBody("not_found", "Tidak ditemukan"), 404));

  // Perlindungan CSRF untuk permintaan berbentuk form; cookie sesi juga SameSite=Lax.
  app.use(csrf({ origin: env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) }));
  app.use(loadAuth(db));

  return app
    .get("/health", (c) => {
      const body: Health = { status: "ok", service: "ssb-api", time: new Date().toISOString() };
      return c.json(body);
    })
    .route("/auth", authRoutes(db, { secureCookie: env.NODE_ENV === "production" }))
    // Daftar pengguna SSB sendiri; hanya admin SSB.
    .get("/users", requireRole("admin_ssb"), async (c) => {
      const a = c.get("auth")!;
      const rows = await withTenant(db, a.ssbId, (tx) =>
        tx
          .select({ id: schema.appUser.id, name: schema.appUser.name, email: schema.appUser.email, role: schema.appUser.role })
          .from(schema.appUser),
      );
      return c.json(rows);
    });
}

export type AppType = ReturnType<typeof createApp>;
