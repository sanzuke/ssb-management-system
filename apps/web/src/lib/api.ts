import type { Me, Membership } from "@ssb/shared";

export type { Me, Membership };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Panggilan ke API lewat origin web (/api). Semua POST membawa body JSON agar lolos pemeriksaan CSRF. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(init.body ?? {}) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Terjadi kesalahan. Coba lagi.", e?.fields ?? {});
  }
  return data as T;
}

/** Akun yang sedang login, atau null bila belum login. */
export async function getMe(): Promise<Me | null> {
  try {
    return await api<Me>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export const roleLabel: Record<string, string> = {
  admin_ssb: "Admin SSB",
  pelatih: "Pelatih",
  korlas: "Koordinator kelompok usia",
  orang_tua: "Orang tua",
};

/** Pesan untuk kode ?error= dari alur Google. */
export const googleErrors: Record<string, string> = {
  akun_belum_terdaftar: "Akun Google ini belum terdaftar. Daftarkan SSB atau minta undangan dari admin SSB.",
  email_sudah_terdaftar: "Email ini sudah punya akun dengan kata sandi. Masuk dengan email dan kata sandi.",
  email_belum_terverifikasi: "Email di akun Google ini belum diverifikasi oleh Google.",
  google_dibatalkan: "Masuk dengan Google dibatalkan.",
  sesi_google_habis: "Sesi masuk habis. Coba lagi.",
  state_tidak_cocok: "Sesi masuk tidak cocok. Coba lagi.",
  verifikasi_google_gagal: "Google tidak bisa memverifikasi akun Anda. Coba lagi.",
  slug_taken: "Kode SSB sudah dipakai. Pilih kode lain.",
  invalid_invitation: "Undangan tidak ditemukan atau sudah tidak berlaku.",
  already_member: "Akun ini sudah menjadi anggota SSB tersebut.",
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
