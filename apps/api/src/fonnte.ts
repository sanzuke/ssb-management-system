/**
 * Klien Fonnte untuk pengiriman WhatsApp.
 * Dokumentasi: https://docs.fonnte.com/api-send-message/
 *
 * Token API dikirim lewat header `Authorization` (tanpa "Bearer"). Respons
 * sukses punya `status: true` dan `id` berisi daftar id pesan; kegagalan punya
 * `status: false` dan `reason` singkat, mis. "token invalid".
 */

const BASE_URL = "https://api.fonnte.com";

/**
 * Endpoint Fonnte yang dipakai. Dapat diubah lewat `setFonnteBaseUrl` supaya
 * tes mengarahkan ke server tiruan tanpa memanggil Fonnte sungguhan.
 */
let baseUrl = BASE_URL;
export const setFonnteBaseUrl = (url: string) => {
  baseUrl = url;
};

export type FonnteTarget = { /** Nomor tujuan, format internasional tanpa "+" (mis. 6281234567890). */ number: string; name?: string };

export type FonnteSendResult = { ok: true; ids: string[]; detail: string; process: string } | { ok: false; reason: string };

/** Bentuk respons Fonnte yang dipakai; field lain diabaikan. */
type FonnteResponse = {
  status?: boolean;
  reason?: string;
  detail?: string;
  process?: string;
  id?: string[] | string;
};

const bacaId = (id: FonnteResponse["id"]): string[] => {
  if (Array.isArray(id)) return id.filter((x): x is string => typeof x === "string");
  if (typeof id === "string") return [id];
  return [];
};

/** Nomor tujuan ke format internasional; awalan 0 diganti kode negara. */
export const keFonnte = (nomor: string, countryCode: string) => {
  const digit = nomor.replace(/\D/g, "");
  if (digit.startsWith("0")) return `${countryCode}${digit.slice(1)}`;
  if (digit.startsWith(countryCode)) return digit;
  return `${countryCode}${digit}`;
};

/**
 * Kirim satu pesan ke satu nomor. `fetch` dipakai langsung supaya tidak perlu
 * pustaka tambahan; token tidak pernah masuk log.
 */
export async function kirimFonnte(opts: {
  token: string;
  target: string;
  message: string;
  countryCode: string;
  /** Tunda beberapa detik sebelum mengirim, supaya tidak tampak seperti bot. */
  delaySeconds?: number;
}): Promise<FonnteSendResult> {
  const body = new URLSearchParams({
    target: opts.target,
    message: opts.message,
    countryCode: opts.countryCode,
  });
  if (opts.delaySeconds && opts.delaySeconds > 0) body.set("delay", String(opts.delaySeconds));

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        Authorization: opts.token,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Gagal menghubungi server Fonnte" };
  }

  const teks = await res.text();
  let data: FonnteResponse;
  try {
    data = JSON.parse(teks) as FonnteResponse;
  } catch {
    return { ok: false, reason: `Respons Fonnte tidak terbaca (HTTP ${res.status})` };
  }
  if (!data.status) return { ok: false, reason: data.reason ?? `Fonnte menolak permintaan (HTTP ${res.status})` };
  return { ok: true, ids: bacaId(data.id), detail: data.detail ?? "success", process: data.process ?? "pending" };
}

/** Ambil profil perangkat Fonnte untuk memeriksa token dan sisa kuota. */
export async function profilFonnte(
  token: string,
): Promise<{ ok: true; device: string; deviceStatus: string; name: string; quota: string; expired: string; package: string } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/device`, {
      method: "POST",
      headers: { Authorization: token },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Gagal menghubungi server Fonnte" };
  }
  const data = (await res.json().catch(() => null)) as {
    status?: boolean;
    reason?: string;
    device?: string;
    device_status?: string;
    name?: string;
    quota?: string;
    expired?: string;
    package?: string;
  } | null;
  if (!data?.status) return { ok: false, reason: data?.reason ?? `Fonnte menolak permintaan (HTTP ${res.status})` };
  return {
    ok: true,
    device: data.device ?? "",
    deviceStatus: data.device_status ?? "",
    name: data.name ?? "",
    quota: data.quota ?? "",
    expired: data.expired ?? "",
    package: data.package ?? "",
  };
}
