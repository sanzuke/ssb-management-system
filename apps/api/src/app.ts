import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { schema, withTenant, type Db } from "@ssb/db";
import { eq } from "drizzle-orm";
import type { Health } from "@ssb/shared";
import { errorBody, onError } from "./errors";
import { loadAuth, requirePermission, type AppEnv } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { googleRoutes } from "./auth/google-routes";
import { createGoogleProvider, type GoogleProvider } from "./auth/google";
import { invitationRoutes } from "./invitations";
import type { Mailer } from "./mail";
import { passwordResetRoutes } from "./password-reset";
import { masterRoutes } from "./master";
import { playerRoutes } from "./players";
import { sessionRoutes } from "./sessions";
import { assessmentRoutes } from "./assessments";
import type { Env } from "./env";
import { createLogger, requestLogger, type Logger } from "./logger";

export type AppDeps = { google?: GoogleProvider | null; logger?: Logger; mailer?: Mailer | null };

export function createApp(
  db: Db,
  env: Pick<Env, "NODE_ENV" | "ALLOWED_ORIGINS"> &
    Partial<Pick<Env, "WEB_URL" | "PUBLIC_API_URL" | "SESSION_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "UPLOAD_DIR">>,
  deps: AppDeps = {},
) {
  const secureCookie = env.NODE_ENV === "production";
  const webUrl = env.WEB_URL ?? "http://localhost:3001";
  const google =
    deps.google !== undefined
      ? deps.google
      : env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? createGoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: `${env.PUBLIC_API_URL ?? "http://localhost:3000"}/auth/google/callback`,
          })
        : null;

  const app = new Hono<AppEnv>();
  const logger = deps.logger ?? createLogger({ silent: env.NODE_ENV === "test" });
  app.use(requestLogger(logger));
  app.onError(onError);
  app.notFound((c) => c.json(errorBody("not_found", "Tidak ditemukan"), 404));

  // Perlindungan CSRF untuk permintaan berbentuk form; cookie sesi juga SameSite=Lax.
  app.use(csrf({ origin: env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) }));
  app.use(loadAuth(db));

  return (
    app
      .get("/health", (c) => {
        const body: Health = { status: "ok", service: "ssb-api", time: new Date().toISOString() };
        return c.json(body);
      })
      .route("/", passwordResetRoutes(db, { webUrl, mailer: deps.mailer ?? null, logger }))
      .route("/auth/google", googleRoutes(db, { provider: google, secret: env.SESSION_SECRET, webUrl, secureCookie }))
      .route("/auth", authRoutes(db, { secureCookie }))
      .route("/invitations", invitationRoutes(db, { secureCookie, webUrl }))
      .route("/", masterRoutes(db))
      .route("/", playerRoutes(db, { uploadDir: env.UPLOAD_DIR ?? "./uploads" }))
      .route("/", sessionRoutes(db))
      .route("/", assessmentRoutes(db))
      // Daftar anggota SSB sendiri; hanya admin SSB.
      .get("/users", requirePermission("user.list"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select({ id: schema.appUser.id, name: schema.appUser.name, email: schema.account.email, role: schema.appUser.role })
            .from(schema.appUser)
            .innerJoin(schema.account, eq(schema.account.id, schema.appUser.accountId)),
        );
        return c.json(rows);
      })
  );
}

export type AppType = ReturnType<typeof createApp>;
