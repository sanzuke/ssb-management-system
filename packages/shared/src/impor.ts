import { z } from "zod";
import type { PlayerForm } from "./index";

/** Kolom lembar data siswa SSB, urutan yang sama dengan lembar yang dipakai admin. */
export const IMPORT_HEADER = [
  "No",
  "ID Siswa",
  "NISN",
  "Nama Lengkap",
  "Tempat Lahir",
  "Tanggal Lahir",
  "Kelompok Usia",
  "Posisi",
  "Nama Orang Tua",
  "No. WhatsApp",
  "Status Berkas (KK/Akta)",
  "Tinggi Badan",
  "Berat Badan",
  "Catatan Medis",
  "No. Punggung",
  "Ukuran Jersey",
  "Ukuran Sepatu",
] as const;

export const IMPORT_MAX_ROWS = 500;

/**
 * Membaca CSV (pemisah koma, titik koma, atau tab, dikenali dari baris pertama; tanda kutip ganda
 * dan baris baru di dalam kutip didukung). Mengembalikan semua baris termasuk yang kosong supaya
 * nomor baris sama dengan nomor baris di lembar.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = ([",", ";", "\t"] as const).map((s) => ({ s, n: first.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

type Kolom =
  | "memberNo"
  | "nisn"
  | "fullName"
  | "birthPlace"
  | "birthDate"
  | "ageGroup"
  | "position"
  | "guardianName"
  | "guardianWhatsapp"
  | "documentStatus"
  | "heightCm"
  | "weightKg"
  | "medicalNote"
  | "jerseyNo"
  | "jerseySize"
  | "shoeSize"
  | "school";

/** Judul kolom (huruf kecil tanpa tanda baca) menjadi isian. Urutan penting: yang lebih khusus lebih dulu. */
const ATURAN_KOLOM: [RegExp, Kolom][] = [
  [/^(idsiswa|nomorinduk|noinduk|nomoranggota|noanggota|memberno)/, "memberNo"],
  [/^nisn/, "nisn"],
  [/orangtua|^wali|^ortu/, "guardianName"],
  [/^nama/, "fullName"],
  [/^tempatlahir|^tmplahir|^kotalahir/, "birthPlace"],
  [/^tanggallahir|^tgllahir|^tanggallhr/, "birthDate"],
  [/^kelompokusia|^kelompokumur|^ku$|^usia$/, "ageGroup"],
  [/^posisi/, "position"],
  [/whatsapp|^wa$|^nowa|^nohp|^telepon|^hp$/, "guardianWhatsapp"],
  [/berkas|^kkakta|^dokumen/, "documentStatus"],
  [/^tinggi/, "heightCm"],
  [/^berat/, "weightKg"],
  [/^catatan|^medis|^riwayat/, "medicalNote"],
  [/punggung/, "jerseyNo"],
  [/jersey|^baju/, "jerseySize"],
  [/sepatu/, "shoeSize"],
  [/^sekolah/, "school"],
];
const kolomDari = (judul: string): Kolom | null => {
  const k = judul.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ATURAN_KOLOM.find(([re]) => re.test(k))?.[1] ?? null;
};

const BULAN: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  aug: 8,
  ags: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

/** Tanggal lahir dari lembar: 2014-01-21, 21-Jan-14, 21/01/2014, 21 Januari 2014. Tahun dua angka: sampai tahun ini dianggap 20xx, selebihnya 19xx. Tidak dikenali: apa adanya (ditolak validasi). */
export function tanggalDariLembar(raw: string, tahunIni = new Date().getFullYear()): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]+|\d{1,2})[\s\-/.]+(\d{2}|\d{4})$/);
  if (!m) return s;
  const bulan = /^\d+$/.test(m[2]!) ? Number(m[2]) : BULAN[m[2]!.toLowerCase().slice(0, 3)];
  if (!bulan) return s;
  let tahun = Number(m[3]);
  if (m[3]!.length === 2) tahun += tahun <= tahunIni % 100 ? 2000 : 1900;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tahun}-${p(bulan)}-${p(Number(m[1]))}`;
}

const POSISI: [RegExp, "GK" | "DF" | "MF" | "FW"][] = [
  [/^(gk|kiper|penjaga)/, "GK"],
  [/^(df|bek|belakang|defender)/, "DF"],
  [/^(mf|gelandang|tengah|midfield)/, "MF"],
  [/^(fw|penyerang|striker|depan|forward)/, "FW"],
];
const BERKAS: [RegExp, "lengkap" | "sebagian" | "belum"][] = [
  [/^(lengkap|ya|ok|complete|ada)/, "lengkap"],
  [/^(sebagian|kurang|parsial|belumlengkap)/, "sebagian"],
  [/^(belum|tidak|kosong|tdk)/, "belum"],
];
/** Nama KU tanpa awalan KU atau U di depan angka, supaya "U-12", "KU 12", dan "KU-12" sama. */
const kunciKu = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^(ku|u)(?=\d)/, "");

export type ImportRow = { nomor: number; data: PlayerForm; galat: string[] };

/**
 * Mengubah hasil `parseCsv` menjadi isian siswa. `nomor` adalah nomor baris di lembar (judul di baris 1).
 * Isian yang tidak bisa dipahami (posisi, KU, berkas, angka) dicatat di `galat`; validasi lain (rentang, format)
 * dikerjakan API dengan skema yang sama dengan formulir. Baris kosong dilewati.
 */
export function petakanBaris(
  rows: string[][],
  kuList: { id: string; name: string }[],
): { baris: ImportRow[]; kolomDikenali: string[]; kolomTakDikenal: string[] } {
  const [judul = [], ...isi] = rows;
  const peta = judul.map(kolomDari);
  const kolomTakDikenal = judul.filter((j, i) => j.trim() !== "" && !peta[i] && !/^(no|nomor|no\.)$/i.test(j.trim()));
  const kolomDikenali = [...new Set(peta.filter((k): k is Kolom => k !== null))];
  const kuPerKunci = new Map(kuList.map((k) => [kunciKu(k.name), k.id]));
  const baris: ImportRow[] = [];

  isi.forEach((r, idx) => {
    if (r.every((c) => c.trim() === "")) return;
    const v: Partial<Record<Kolom, string>> = {};
    peta.forEach((k, i) => {
      if (k && v[k] === undefined) v[k] = (r[i] ?? "").trim();
    });
    const galat: string[] = [];
    const angka = (k: Kolom, label: string, bulat = false): number | null => {
      const t = (v[k] ?? "")
        .replace(/(cm|kg)$/i, "")
        .trim()
        .replace(",", ".");
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isFinite(n) || (bulat && !Number.isInteger(n))) {
        galat.push(`${label}: "${v[k]}" bukan angka${bulat ? " bulat" : ""}`);
        return null;
      }
      return n;
    };
    const pilih = <T>(k: Kolom, label: string, aturan: [RegExp, T][], kosong: T | null): T | null => {
      const t = (v[k] ?? "").toLowerCase().replace(/[^a-z]/g, "");
      if (t === "") return kosong;
      const hit = aturan.find(([re]) => re.test(t));
      if (!hit) galat.push(`${label}: "${v[k]}" tidak dikenali`);
      return hit?.[1] ?? null;
    };

    let ageGroupId: string | null = null;
    if (v.ageGroup) {
      ageGroupId = kuPerKunci.get(kunciKu(v.ageGroup)) ?? null;
      if (!ageGroupId) galat.push(`Kelompok usia: KU "${v.ageGroup}" belum ada, buat dulu di Data master`);
    }
    const nisn = v.nisn && /^\d{9}$/.test(v.nisn) ? `0${v.nisn}` : v.nisn; // nol di depan hilang di lembar sebar

    baris.push({
      nomor: idx + 2,
      galat,
      data: {
        memberNo: v.memberNo,
        nisn,
        fullName: v.fullName ?? "",
        birthPlace: v.birthPlace,
        birthDate: tanggalDariLembar(v.birthDate ?? ""),
        position: pilih("position", "Posisi", POSISI, null),
        school: v.school,
        ageGroupId,
        guardianName: v.guardianName,
        guardianWhatsapp: v.guardianWhatsapp,
        documentStatus: pilih("documentStatus", "Status berkas", BERKAS, "belum") ?? "belum",
        heightCm: angka("heightCm", "Tinggi badan", true),
        weightKg: angka("weightKg", "Berat badan"),
        medicalNote: v.medicalNote,
        jerseyNo: angka("jerseyNo", "No. punggung", true),
        jerseySize: v.jerseySize,
        shoeSize: angka("shoeSize", "Ukuran sepatu"),
      },
    });
  });
  return { baris, kolomDikenali, kolomTakDikenal };
}

/** Isi permintaan impor. `data` divalidasi API dengan `playerFormSchema`, sama seperti formulir tambah siswa. */
export const importRequestSchema = z.object({
  rows: z
    .array(z.object({ nomor: z.number().int().min(1), data: z.record(z.string(), z.unknown()) }))
    .min(1, "Tidak ada baris")
    .max(IMPORT_MAX_ROWS, `Maksimal ${IMPORT_MAX_ROWS} baris sekali impor`),
  /** Periksa saja: semua aturan dijalankan, tidak ada yang disimpan. */
  dryRun: z.boolean().default(false),
});
export type ImportRequest = z.input<typeof importRequestSchema>;
export type ImportFailure = { nomor: number; nama: string; galat: string[] };
export type ImportReport = { dryRun: boolean; created: number; gagal: ImportFailure[] };

const LABEL_KOLOM: Record<string, string> = {
  memberNo: "ID siswa",
  nisn: "NISN",
  fullName: "Nama lengkap",
  birthPlace: "Tempat lahir",
  birthDate: "Tanggal lahir",
  position: "Posisi",
  school: "Sekolah",
  ageGroupId: "Kelompok usia",
  status: "Status",
  guardianName: "Nama orang tua",
  guardianWhatsapp: "No. WhatsApp",
  documentStatus: "Status berkas",
  heightCm: "Tinggi badan",
  weightKg: "Berat badan",
  medicalNote: "Catatan medis",
  jerseyNo: "No. punggung",
  jerseySize: "Ukuran jersey",
  shoeSize: "Ukuran sepatu",
};
/** Nama isian siswa untuk laporan galat impor. */
export const labelKolom = (k: string) => LABEL_KOLOM[k] ?? k;
