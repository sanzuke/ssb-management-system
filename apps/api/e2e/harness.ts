// API untuk uji e2e: sama dengan API asli, tetapi Google diganti tiruan yang langsung
// "menyetujui" dan mengembalikan pengguna ke callback. Jangan dipakai di produksi.
import { createDb } from "@ssb/db";
import { createApp } from "../src/app";
import type { GoogleProvider } from "../src/auth/google";

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
let nonce = "";
const claims = { sub: "", email: "", name: "" };

const google: GoogleProvider = {
  authUrl: (p) => {
    nonce = p.nonce;
    return `${WEB}/api/auth/google/callback?code=ok&state=${p.state}`;
  },
  exchange: async () => ({ sub: claims.sub, email: claims.email, emailVerified: true, name: claims.name, nonce }),
};

const { db } = createDb(process.env.DATABASE_URL!);
const api = createApp(
  db,
  { NODE_ENV: "test", ALLOWED_ORIGINS: WEB, WEB_URL: WEB, SESSION_SECRET: "x".repeat(40) } as never,
  { google },
);

Bun.serve({
  port: 3000,
  fetch(req) {
    const u = new URL(req.url);
    // Atur "akun Google" untuk uji berikutnya: /__google?sub=..&email=..&name=..
    if (u.pathname === "/__google") {
      claims.sub = u.searchParams.get("sub") ?? "";
      claims.email = u.searchParams.get("email") ?? "";
      claims.name = u.searchParams.get("name") ?? "";
      return new Response("ok");
    }
    return api.fetch(req);
  },
});
console.log("harness e2e di :3000");
