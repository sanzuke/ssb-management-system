/**
 * Pembatas laju jendela tetap, di memori proses. Cukup untuk satu proses API; bila API dijalankan
 * lebih dari satu proses, hitungannya per proses (batas efektif jadi lebih longgar, bukan lebih ketat).
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }) {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  /** Mencatat satu percobaan; mengembalikan false bila batas sudah terlampaui. */
  function allow(key: string): boolean {
    const t = now();
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= t) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        // Masih penuh oleh kunci yang aktif: tolak daripada membiarkan memori tumbuh tanpa batas.
        if (hits.size >= maxKeys) return false;
      }
      hits.set(key, { count: 1, resetAt: t + opts.windowMs });
      return true;
    }
    if (cur.count >= opts.limit) return false;
    cur.count++;
    return true;
  }

  return {
    allow,
    /** Apakah kunci masih boleh mencoba, tanpa mencatat apa pun. Dipakai bersama `fail` untuk menghitung kegagalan saja. */
    open(key: string): boolean {
      const cur = hits.get(key);
      return !cur || cur.resetAt <= now() || cur.count < opts.limit;
    },
    /** Mencatat satu kegagalan. */
    fail(key: string): void {
      allow(key);
    },
    /** Menghapus hitungan kunci, mis. setelah login berhasil. */
    reset(key: string): void {
      hits.delete(key);
    },
  };
}

/**
 * Alamat klien dari header yang dipasang reverse proxy (sama dengan pendaftaran trial di site.ts).
 * Tanpa proxy (mis. test) semua permintaan berbagi satu kunci, jadi batasnya sengaja longgar.
 */
export const clientIp = (c: { req: { header: (name: string) => string | undefined } }) => c.req.header("x-real-ip") ?? "tak-dikenal";
