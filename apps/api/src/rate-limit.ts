/**
 * Pembatas laju jendela tetap, di memori proses. Cukup untuk satu proses API; bila API dijalankan
 * lebih dari satu proses, hitungannya per proses (batas efektif jadi lebih longgar, bukan lebih ketat).
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }) {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Mencatat satu percobaan; mengembalikan false bila batas sudah terlampaui. */
    allow(key: string): boolean {
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
    },
  };
}
