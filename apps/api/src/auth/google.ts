import { createRemoteJWKSet, jwtVerify } from "jose";

export type GoogleClaims = { sub: string; email: string; emailVerified: boolean; name: string; nonce: string | undefined };

/** Pembungkus OIDC Google, dipisah agar bisa diganti tiruan di test. */
export interface GoogleProvider {
  authUrl(p: { state: string; nonce: string; challenge: string }): string;
  /** Menukar kode dengan ID token dan memverifikasinya (tanda tangan, penerbit, audience, kedaluwarsa). */
  exchange(code: string, verifier: string): Promise<GoogleClaims>;
}

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function createGoogleProvider(cfg: { clientId: string; clientSecret: string; redirectUri: string }): GoogleProvider {
  return {
    authUrl({ state, nonce, challenge }) {
      const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    },
    async exchange(code, verifier) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
      });
      if (!res.ok) throw new Error(`Google token endpoint: ${res.status}`);
      const { id_token } = (await res.json()) as { id_token?: string };
      if (!id_token) throw new Error("Google tidak mengembalikan id_token");
      const { payload } = await jwtVerify(id_token, JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: cfg.clientId,
      });
      return {
        sub: String(payload.sub),
        email: String(payload.email ?? "").toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: String(payload.name ?? payload.email ?? ""),
        nonce: typeof payload.nonce === "string" ? payload.nonce : undefined,
      };
    },
  };
}
