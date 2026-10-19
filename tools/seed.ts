/**
 * Data contoh untuk pengembangan lokal: satu SSB lengkap (admin, korlas, pelatih, orang tua,
 * pemain, jadwal, absensi, penilaian, rencana pengembangan).
 *
 *   bun run db:seed             # membuat data; berhenti bila SSB contoh sudah ada
 *   bun run db:seed -- --reset  # hapus SSB contoh dan akunnya, lalu buat ulang
 *
 * Butuh DATABASE_URL (role ssb_app) dan migrasi yang sudah dijalankan.
 * Semua akun contoh memakai kata sandi yang sama: SEED_PASSWORD, bawaan "ContohSSB-2026" (hanya lokal).
 *
 * Di server demo atau staging: NODE_ENV=production ALLOW_SEED=1 SEED_PASSWORD=<kata sandi kuat> bun run db:seed
 * Jangan jalankan di database produksi yang berisi data sungguhan.
 */
import { and, eq, like } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createDb, schema, withTenant } from "@ssb/db";
import { fotoContoh } from "./seed-foto";
import { defaultIndicators, assessmentAspects } from "@ssb/shared/aspects";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL belum diatur (lihat .env.example)");

const produksi = process.env.NODE_ENV === "production";
if (produksi && process.env.ALLOW_SEED !== "1") {
  throw new Error("NODE_ENV=production: seed dibatalkan. Untuk server demo atau staging, setel ALLOW_SEED=1.");
}
if (produksi && !process.env.SEED_PASSWORD) {
  throw new Error("Di server, SEED_PASSWORD wajib diisi (kata sandi untuk semua akun contoh).");
}
const PASSWORD = process.env.SEED_PASSWORD ?? "ContohSSB-2026";
const SLUG = "garuda-muda";
const DOMAIN = "garudamuda.test";
const reset = process.argv.includes("--reset");

// ---- Pembantu ----

/** Pengacak deterministik agar data contoh sama tiap kali dibuat. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = rng(2026);
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
const id = () => crypto.randomUUID();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const { db, client } = createDb(url);

// ---- Data dasar ----

type Orang = { nama: string; email: string; wa: string };
const staf = {
  admin: { nama: "Hendra Wijaya", email: `admin@${DOMAIN}`, wa: "081211110001" },
  korlas: { nama: "Agus Pratama", email: `korlas@${DOMAIN}`, wa: "081211110002" },
  budi: { nama: "Budi Santoso", email: `budi@${DOMAIN}`, wa: "081288997711" },
  sari: { nama: "Sari Lestari", email: `sari@${DOMAIN}`, wa: "081211110004" },
} satisfies Record<string, Orang>;

const KU = [
  { name: "KU-8", min: 7, max: 8, lahir: 2018 },
  { name: "KU-10", min: 9, max: 10, lahir: 2016 },
  { name: "KU-12", min: 11, max: 12, lahir: 2014 },
] as const;

/** Pemain per KU. `ortu` = indeks orang tua; satu orang tua boleh punya dua anak. */
const pemain: { nama: string; ku: (typeof KU)[number]["name"]; pos: "GK" | "DF" | "MF" | "FW"; ortu: number; sekolah: string; dasar: number }[] = [
  { nama: "Cakra Pratama", ku: "KU-10", pos: "FW", ortu: 0, sekolah: "SDN Cilandak 03", dasar: 7.4 },
  { nama: "Dimas Arya Putra", ku: "KU-10", pos: "MF", ortu: 1, sekolah: "SDN Cilandak 03", dasar: 7.8 },
  { nama: "Farhan Maulana", ku: "KU-10", pos: "GK", ortu: 2, sekolah: "SD Islam Al-Azhar", dasar: 6.9 },
  { nama: "Rizky Ramadhan", ku: "KU-10", pos: "DF", ortu: 3, sekolah: "SDN Pondok Labu 01", dasar: 6.5 },
  { nama: "Bintang Aditya", ku: "KU-10", pos: "FW", ortu: 4, sekolah: "SDN Cilandak 05", dasar: 7.1 },
  { nama: "Kevin Pratama", ku: "KU-10", pos: "MF", ortu: 5, sekolah: "SD Bina Insani", dasar: 6.2 },
  { nama: "Dafa Saputra", ku: "KU-10", pos: "DF", ortu: 6, sekolah: "SDN Lebak Bulus 02", dasar: 6.8 },
  { nama: "Arkan Zidan", ku: "KU-10", pos: "DF", ortu: 7, sekolah: "SD Islam Al-Azhar", dasar: 7.0 },
  { nama: "Fikri Haikal", ku: "KU-10", pos: "MF", ortu: 8, sekolah: "SDN Cilandak 03", dasar: 5.9 },
  { nama: "Gilang Ramadhan", ku: "KU-10", pos: "FW", ortu: 9, sekolah: "SDN Pondok Labu 01", dasar: 7.3 },
  { nama: "Hafizh Rahman", ku: "KU-10", pos: "DF", ortu: 10, sekolah: "SD Bina Insani", dasar: 6.4 },
  { nama: "Ilham Syahputra", ku: "KU-10", pos: "MF", ortu: 11, sekolah: "SDN Lebak Bulus 02", dasar: 6.6 },
  { nama: "Raka Nugraha", ku: "KU-12", pos: "MF", ortu: 0, sekolah: "SDN Cilandak 01", dasar: 7.9 },
  { nama: "Jundi Al-Fatih", ku: "KU-12", pos: "FW", ortu: 12, sekolah: "SD Islam Al-Azhar", dasar: 7.6 },
  { nama: "Kenzie Putra", ku: "KU-12", pos: "DF", ortu: 13, sekolah: "SDN Pondok Labu 02", dasar: 7.0 },
  { nama: "Lutfi Hakim", ku: "KU-12", pos: "DF", ortu: 14, sekolah: "SDN Lebak Bulus 01", dasar: 6.7 },
  { nama: "Maulana Yusuf", ku: "KU-12", pos: "GK", ortu: 15, sekolah: "SD Bina Insani", dasar: 7.2 },
  { nama: "Naufal Rayhan", ku: "KU-12", pos: "MF", ortu: 16, sekolah: "SDN Cilandak 01", dasar: 7.5 },
  { nama: "Raditya Putra", ku: "KU-12", pos: "FW", ortu: 17, sekolah: "SDN Pondok Labu 02", dasar: 6.9 },
  { nama: "Satria Bagus", ku: "KU-12", pos: "DF", ortu: 18, sekolah: "SDN Lebak Bulus 01", dasar: 6.3 },
  { nama: "Tegar Wicaksono", ku: "KU-8", pos: "MF", ortu: 19, sekolah: "SDN Cilandak 05", dasar: 6.0 },
  { nama: "Yoga Prasetya", ku: "KU-8", pos: "FW", ortu: 20, sekolah: "SDN Cilandak 05", dasar: 6.4 },
  { nama: "Zidane Alfarizi", ku: "KU-8", pos: "DF", ortu: 21, sekolah: "SD Bina Insani", dasar: 5.8 },
  { nama: "Aldo Firmansyah", ku: "KU-8", pos: "GK", ortu: 22, sekolah: "SDN Lebak Bulus 02", dasar: 6.1 },
];

const namaOrtu = [
  "Ibu Ratna Dewi",
  "Bapak Eko Prasetyo",
  "Ibu Maya Sari",
  "Bapak Joko Susilo",
  "Ibu Lina Marlina",
  "Bapak Andi Wijaya",
  "Ibu Fitri Handayani",
  "Bapak Rudi Hartono",
  "Ibu Nur Aini",
  "Bapak Taufik Hidayat",
  "Ibu Wulan Sari",
  "Bapak Dedi Kurniawan",
  "Ibu Yuni Astuti",
  "Bapak Hadi Santoso",
  "Ibu Rina Melati",
  "Bapak Surya Darma",
  "Ibu Tika Permata",
  "Bapak Bayu Aji",
  "Ibu Dian Pertiwi",
  "Ibu Ayu Lestari",
  "Bapak Fajar Nugroho",
  "Ibu Sinta Bella",
  "Bapak Imam Syafii",
];
const ortu: Orang[] = namaOrtu.map((nama, i) => ({
  nama,
  email: `ortu${String(i + 1).padStart(2, "0")}@${DOMAIN}`,
  wa: `0812${String(30000000 + i * 1111).padStart(8, "0")}`,
}));

const catatan = [
  "Menunjukkan peningkatan passing yang bagus. Cepat belajar, perlu lebih tenang saat berada di depan gawang.",
  "Disiplin dan rajin berlatih. Fokus pada penempatan posisi saat bertahan.",
  "Kerja sama tim baik. Perlu melatih kaki lemah agar lebih seimbang.",
  "Semangat tinggi di setiap sesi. Tingkatkan kecepatan transisi antara bertahan dan menyerang.",
  "Penguasaan bola meningkat. Terus latih pengambilan keputusan di ruang sempit.",
];
const rencana: { aspect: (typeof assessmentAspects)[number]; area: string; target: string }[] = [
  { aspect: "technical", area: "Kaki kiri", target: "Latihan dribbling dan passing kaki kiri 2 kali seminggu" },
  { aspect: "tactical", area: "Penempatan posisi", target: "Menjaga jarak antar lini saat bertahan" },
  { aspect: "mental", area: "Ketenangan di depan gawang", target: "Tembakan terarah dalam situasi 1 lawan 1 dengan kiper" },
  { aspect: "physical", area: "Daya tahan", target: "Lari interval ringan di luar sesi latihan" },
];

// ---- Mulai ----

const sudahAda = await db.select().from(schema.ssbDirectory).where(eq(schema.ssbDirectory.slug, SLUG)).limit(1);
if (sudahAda.length > 0) {
  if (!reset) {
    console.log(`SSB contoh "${SLUG}" sudah ada. Jalankan dengan --reset untuk membuat ulang.`);
    await client.end();
    process.exit(0);
  }
  const lama = sudahAda[0]!.ssbId;
  await withTenant(db, lama, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, lama)));
  await db.delete(schema.account).where(like(schema.account.email, `%@${DOMAIN}`));
  console.log("Data contoh lama dihapus.");
}

console.log("Membuat akun…");
const hash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });
const semuaOrang: (Orang & { role: "admin_ssb" | "korlas" | "pelatih" | "orang_tua" })[] = [
  { ...staf.admin, role: "admin_ssb" },
  { ...staf.korlas, role: "korlas" },
  { ...staf.budi, role: "pelatih" },
  { ...staf.sari, role: "pelatih" },
  ...ortu.map((o) => ({ ...o, role: "orang_tua" as const })),
];
const accounts = semuaOrang.map((o) => ({ ...o, accountId: id(), userId: id() }));
await db.insert(schema.account).values(accounts.map((a) => ({ id: a.accountId, email: a.email, name: a.nama, passwordHash: hash })));

const ssbId = id();
const userOf = (email: string) => accounts.find((a) => a.email === email)!.userId;
const today = new Date();
const hariIni = iso(today);

const periode = [
  { id: id(), name: "Musim 2025/26", startDate: "2025-07-01", endDate: "2026-06-30" },
  { id: id(), name: "Musim 2026/27", startDate: "2026-07-01", endDate: "2027-06-30" },
] as const;
const lokasi = [
  { id: id(), name: "Lapangan Utama Cilandak", address: "Jl. Cilandak KKO, Jakarta Selatan" },
  { id: id(), name: "Lapangan Cadangan Pondok Labu", address: "Jl. RS Fatmawati, Jakarta Selatan" },
];
const kuRows = KU.map((k) => ({ id: id(), name: k.name, minAge: k.min, maxAge: k.max }));
const kuId = (n: string) => kuRows.find((k) => k.name === n)!.id;

const players = pemain.map((p, i) => {
  const k = KU.find((x) => x.name === p.ku)!;
  const lahir = `${k.lahir}-${String(1 + (i % 12)).padStart(2, "0")}-${String(3 + ((i * 7) % 24)).padStart(2, "0")}`;
  return { ...p, id: id(), memberNo: `P${String(i + 1).padStart(4, "0")}`, lahir };
});

// Foto contoh (siluet berwarna) untuk sebagian besar pemain; sisanya sengaja tanpa foto agar avatar inisial tetap terlihat.
const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
const fotoKey = (p: (typeof players)[number]) => {
  const i = players.indexOf(p);
  if (i % 5 === 4) return null;
  const key = `${ssbId}/${p.id}-${randomBytes(4).toString("hex")}.png`;
  mkdirSync(`${uploadDir}/${ssbId}`, { recursive: true });
  writeFileSync(`${uploadDir}/${key}`, fotoContoh(i));
  return key;
};

await withTenant(db, ssbId, async (tx) => {
  await tx.insert(schema.ssb).values({ id: ssbId, name: "SSB Garuda Muda", city: "Jakarta Selatan", province: "DKI Jakarta", memberSeq: players.length });
  await tx.insert(schema.ssbDirectory).values({ slug: SLUG, ssbId });
  await tx.insert(schema.appUser).values(accounts.map((a) => ({ id: a.userId, ssbId, accountId: a.accountId, name: a.nama, whatsapp: a.wa, role: a.role })));
  await tx.insert(schema.ageGroup).values(kuRows.map((k) => ({ ...k, ssbId })));
  await tx.insert(schema.period).values(periode.map((p) => ({ ...p, ssbId })));
  await tx.insert(schema.location).values(lokasi.map((l) => ({ ...l, ssbId })));

  await tx.insert(schema.player).values(
    players.map((p) => ({
      id: p.id,
      ssbId,
      memberNo: p.memberNo,
      fullName: p.nama,
      birthDate: p.lahir,
      position: p.pos,
      school: p.sekolah,
      status: "aktif" as const,
      ageGroupId: kuId(p.ku),
      photoKey: fotoKey(p),
    })),
  );
  await tx
    .insert(schema.playerGuardian)
    .values(players.map((p) => ({ ssbId, playerId: p.id, userId: userOf(ortu[p.ortu]!.email), relationship: p.ortu % 2 === 0 ? "Ibu" : "Bapak" })));

  // Penugasan: Budi di KU-10, Sari di KU-12 dan KU-8, korlas di semua KU, pada kedua periode.
  const tugas: { userId: string; ageGroupId: string; periodId: string }[] = [];
  for (const per of periode) {
    tugas.push({ userId: userOf(staf.budi.email), ageGroupId: kuId("KU-10"), periodId: per.id });
    tugas.push({ userId: userOf(staf.sari.email), ageGroupId: kuId("KU-12"), periodId: per.id });
    tugas.push({ userId: userOf(staf.sari.email), ageGroupId: kuId("KU-8"), periodId: per.id });
    for (const k of kuRows) tugas.push({ userId: userOf(staf.korlas.email), ageGroupId: k.id, periodId: per.id });
  }
  await tx.insert(schema.coachAssignment).values(tugas.map((t) => ({ ...t, ssbId })));

  // Indikator per KU dari usulan bawaan.
  const indikator = kuRows.flatMap((k) =>
    assessmentAspects.flatMap((aspect) =>
      defaultIndicators[aspect].map((name, i) => ({ id: id(), ssbId, ageGroupId: k.id, aspect, name, sortOrder: i, active: true })),
    ),
  );
  await tx.insert(schema.assessmentIndicator).values(indikator);

  // Sesi latihan: Rabu dan Sabtu, dari 1 Agustus 2026 sampai tiga minggu ke depan.
  const periodeKini = periode[1];
  const pelatihKu = (ku: string) => userOf(ku === "KU-10" ? staf.budi.email : staf.sari.email);
  const sesi: { id: string; ku: string; tanggal: string }[] = [];
  for (let d = new Date("2026-08-01T00:00:00"); iso(d) <= iso(addDays(today, 21)); d = addDays(d, 1)) {
    if (d.getDay() !== 3 && d.getDay() !== 6) continue;
    for (const k of KU) sesi.push({ id: id(), ku: k.name, tanggal: iso(d) });
  }
  await tx.insert(schema.trainingSession).values(
    sesi.map((s) => ({
      id: s.id,
      ssbId,
      ageGroupId: kuId(s.ku),
      periodId: periodeKini.id,
      sessionDate: s.tanggal,
      startTime: new Date(`${s.tanggal}T00:00:00`).getDay() === 6 ? "07:30" : "15:30",
      locationId: s.ku === "KU-8" ? lokasi[1]!.id : lokasi[0]!.id,
    })),
  );

  // Absensi untuk sesi yang sudah lewat, dengan pola kehadiran per pemain.
  const rows: (typeof schema.attendance.$inferInsert)[] = [];
  for (const s of sesi.filter((x) => x.tanggal < hariIni)) {
    for (const p of players.filter((x) => x.ku === s.ku)) {
      const r = rand();
      const rajin = p.dasar >= 7 ? 0.9 : p.dasar >= 6.4 ? 0.8 : 0.68;
      const status = r < rajin ? "hadir" : r < rajin + (1 - rajin) * 0.45 ? "izin" : r < rajin + (1 - rajin) * 0.8 ? "sakit" : "alpa";
      rows.push({
        ssbId,
        sessionId: s.id,
        playerId: p.id,
        status,
        note: status === "izin" ? pick(["Acara sekolah", "Acara keluarga", "Ujian sekolah"]) : null,
        recordedBy: pelatihKu(s.ku),
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.attendance).values(rows.slice(i, i + 500));

  // Penilaian: musim lalu (terbit) untuk KU-10 dan KU-12, musim ini untuk KU-10 dan KU-12 (sebagian terbit).
  const skor: (typeof schema.assessmentScore.$inferInsert)[] = [];
  const buatNilai = async (p: (typeof players)[number], per: (typeof periode)[number], tanggal: string, naik: number, terbit: boolean, idx: number) => {
    const aId = id();
    await tx.insert(schema.assessment).values({
      id: aId,
      ssbId,
      playerId: p.id,
      periodId: per.id,
      ageGroupId: kuId(p.ku),
      assessedOn: tanggal,
      note: catatan[idx % catatan.length]!,
      assessorId: pelatihKu(p.ku),
      publishedAt: terbit ? new Date(`${tanggal}T10:00:00+07:00`) : null,
    });
    for (const ind of indikator.filter((x) => x.ageGroupId === kuId(p.ku))) {
      const bias = ind.aspect === "technical" && (p.pos === "FW" || p.pos === "MF") ? 0.5 : ind.aspect === "tactical" && p.pos === "DF" ? 0.5 : 0;
      skor.push({ ssbId, assessmentId: aId, indicatorId: ind.id, score: Math.round(clamp(p.dasar + naik + bias + (rand() - 0.5) * 2.4, 3, 10)) });
    }
  };
  let n = 0;
  for (const p of players.filter((x) => x.ku !== "KU-8")) await buatNilai(p, periode[0], "2026-06-20", -0.4, true, n++);
  let m = 0;
  for (const p of players.filter((x) => x.ku !== "KU-8")) await buatNilai(p, periode[1], "2026-10-10", 0, m++ % 3 !== 2, n++);
  for (let i = 0; i < skor.length; i += 500) await tx.insert(schema.assessmentScore).values(skor.slice(i, i + 500));

  // Rencana pengembangan untuk empat pemain KU-10 pertama pada musim ini.
  const rp: (typeof schema.developmentPlanItem.$inferInsert)[] = [];
  players
    .filter((x) => x.ku === "KU-10")
    .slice(0, 4)
    .forEach((p, i) => {
      for (const [j, r] of [rencana[i % rencana.length]!, rencana[(i + 2) % rencana.length]!].entries())
        rp.push({
          ssbId,
          playerId: p.id,
          periodId: periode[1].id,
          aspect: r.aspect,
          area: r.area,
          target: r.target,
          sortOrder: j,
          createdBy: pelatihKu("KU-10"),
        });
    });
  await tx.insert(schema.developmentPlanItem).values(rp);
});

console.log("\nSelesai. SSB: SSB Garuda Muda (kode: " + SLUG + ")");
console.log(`  ${players.length} pemain, ${ortu.length} orang tua, 2 pelatih, 1 korlas, 1 admin`);
console.log("\nAkun untuk masuk (kata sandi sama untuk semua, lihat SEED_PASSWORD di tools/seed.ts):");
console.log(`  Admin     ${staf.admin.email}`);
console.log(`  Korlas    ${staf.korlas.email}`);
console.log(`  Pelatih   ${staf.budi.email}  (KU-10)`);
console.log(`  Pelatih   ${staf.sari.email}  (KU-12 dan KU-8)`);
console.log(`  Orang tua ${ortu[0]!.email}  (Cakra KU-10 dan Raka KU-12)`);
console.log(`  Orang tua ${ortu[1]!.email} sampai ${ortu[22]!.email}`);
await client.end();
