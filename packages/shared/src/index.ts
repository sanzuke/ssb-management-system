import { z } from "zod";

/** Respons endpoint kesehatan API. */
export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

/** Posisi bermain. */
export const positionSchema = z.enum(["GK", "DF", "MF", "FW"]);
export type Position = z.infer<typeof positionSchema>;

/** Input pembuatan siswa. Skema lengkap menyusul bersama model data. */
export const playerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  birthDate: z.iso.date(),
  position: positionSchema.optional(),
});
export type PlayerInput = z.infer<typeof playerInputSchema>;

/** Role pengguna di dalam SSB. */
export const userRoleSchema = z.enum(["admin_ssb", "pelatih", "korlas", "orang_tua"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Matriks izin: satu-satunya sumber kebenaran siapa boleh melakukan apa.
 * Endpoint API dijaga dengan `requirePermission(<izin>)`; docs/izin.md dibuat dari tabel ini dan diuji sinkron.
 * Batas data (pelatih hanya KU yang ditugaskan, orang tua hanya anaknya) ditegakkan terpisah di query/RLS.
 */
export const permissions = {
  "user.list": { roles: ["admin_ssb"], desc: "Melihat daftar anggota SSB" },
  "invitation.create": { roles: ["admin_ssb"], desc: "Membuat tautan undangan" },
  "fee.manage": { roles: ["admin_ssb"], desc: "Mengatur tarif SPP, membuat tagihan, dan mencatat atau mengoreksi pembayaran" },
  "invoice.read": { roles: ["admin_ssb", "orang_tua"], desc: "Melihat tagihan SPP dan riwayat pembayarannya (orang tua: anaknya)" },
  "member.reset_password": { roles: ["admin_ssb"], desc: "Membuat tautan reset kata sandi untuk anggota SSB (akun yang hanya anggota SSB ini)" },
  "member.manage": { roles: ["admin_ssb"], desc: "Melihat anggota beserta kontaknya, mengubah nama, kontak, dan peran, serta mengeluarkan anggota dari SSB" },
  "invitation.manage": { roles: ["admin_ssb"], desc: "Melihat daftar undangan, mencabut, dan membuat ulang tautan yang belum diterima" },
  "master.read": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Melihat KU, periode, dan lokasi" },
  "master.write": { roles: ["admin_ssb"], desc: "Mengubah KU, periode, dan lokasi" },
  "player.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat siswa (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya)",
  },
  "player.write": { roles: ["admin_ssb"], desc: "Menambah dan mengubah siswa" },
  "player.photo": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Mengunggah dan menghapus foto siswa (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya)",
  },
  "document.read": {
    roles: ["admin_ssb", "orang_tua"],
    desc: "Melihat berkas siswa: kartu keluarga, akta kelahiran, NISN, raport (orang tua: anaknya). Data pribadi keluarga, tidak untuk pelatih dan korlas",
  },
  "document.write": { roles: ["admin_ssb", "orang_tua"], desc: "Mengunggah, mengganti, dan menghapus berkas siswa (orang tua: anaknya)" },
  "attendance.record": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Mencatat absensi latihan" },
  "attendance.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat absensi (orang tua: anaknya)" },
  "assessment.write": { roles: ["admin_ssb", "pelatih"], desc: "Mengisi penilaian siswa dan rencana pengembangannya" },
  "assessment.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat penilaian dan rencana pengembangan (orang tua: anaknya, setelah terbit)",
  },
  "squad.read": {
    roles: ["admin_ssb", "pelatih", "korlas"],
    desc: "Melihat tabel skuad: rating, enam aspek, dan tren seluruh siswa yang boleh dilihat (pelatih dan korlas: KU yang ditugaskan), termasuk penilaian yang belum terbit",
  },
  "badge.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat lencana siswa (orang tua: anaknya)" },
  "badge.write": { roles: ["admin_ssb", "pelatih"], desc: "Memberi dan mencabut lencana siswa (pelatih: KU yang ditugaskan)" },
  "injury.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat catatan cedera siswa (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya). Data kesehatan anak",
  },
  "injury.write": {
    roles: ["admin_ssb", "pelatih"],
    desc: "Mencatat cedera, mengubah perkiraan pulih dan catatannya, dan menandai pulih (pelatih: KU yang ditugaskan)",
  },
  "session.manage": { roles: ["admin_ssb"], desc: "Menjadwalkan, mengubah, dan menghapus sesi latihan" },
  "guardian.sessions": {
    roles: ["admin_ssb", "orang_tua"],
    desc: "Portal orang tua: jadwal KU anak sendiri beserta status kehadiran anak, tanpa daftar siswa lain (admin tidak punya anak, jadi daftarnya kosong)",
  },
  "session.read": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Melihat jadwal sesi latihan (pelatih dan korlas: KU yang ditugaskan)" },
  "assignment.manage": { roles: ["admin_ssb"], desc: "Menugaskan pelatih dan korlas ke KU per periode" },
  "report.publish": { roles: ["admin_ssb", "korlas"], desc: "Menerbitkan rapor ke orang tua (wewenang korlas: menunggu keputusan)" },
  "site.manage": { roles: ["admin_ssb"], desc: "Menyunting draf konten landing page akademi dan menerbitkannya" },
  "post.write": {
    roles: ["admin_ssb", "pelatih", "korlas"],
    desc: "Menulis artikel untuk landing page, mengunggah gambarnya, dan menerbitkan artikel sendiri (admin SSB: semua artikel)",
  },
  "mailbox.manage": { roles: ["admin_ssb"], desc: "Membuat, mereset sandi, dan menghapus kotak surat email akademi di server" },
  "merchandise.manage": { roles: ["admin_ssb"], desc: "Mengelola produk merchandise dan pesanan penjualan" },
  "calendar.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat kalender akademi: pertandingan, acara, dan libur" },
  "calendar.manage": { roles: ["admin_ssb"], desc: "Menambah, mengubah, dan menghapus kegiatan di kalender akademi, termasuk menandainya tampil di landing page" },
  "fundraising.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat kampanye donasi yang aktif atau selesai, dana terkumpul, dan sumbangan yang sudah diterima (nama donatur anonim disembunyikan)",
  },
  "fundraising.pledge": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Menyumbang atau menjadi sponsor pada kampanye yang aktif; sumbangan menunggu konfirmasi admin" },
  "fundraising.manage": {
    roles: ["admin_ssb"],
    desc: "Membuat dan mengubah kampanye donasi, mengonfirmasi atau menolak sumbangan, dan mencatat sumbangan di luar aplikasi",
  },
  "mvi.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat indeks nilai siswa (admin, pelatih, korlas: angka dan rincian, pelatih dan korlas untuk KU yang ditugaskan; orang tua: hanya kategori anaknya, setelah penilaian periode itu terbit)",
  },
  "mvi.write": {
    roles: ["admin_ssb", "pelatih"],
    desc: "Mengisi statistik laga dan tes kebugaran siswa, dan menghitung ulang indeks nilai (pelatih: KU yang ditugaskan)",
  },
  "trial.convert": { roles: ["admin_ssb"], desc: "Menjadikan pendaftar trial menjadi siswa dan membuat tautan undangan untuk orang tua" },
  "trial.manage": { roles: ["admin_ssb"], desc: "Melihat pendaftar trial dari landing page dan mengubah statusnya" },
} as const satisfies Record<string, { roles: readonly UserRole[]; desc: string }>;
export type Permission = keyof typeof permissions;
export const can = (role: UserRole, p: Permission) => (permissions[p].roles as readonly UserRole[]).includes(role);

const roleOrder: UserRole[] = ["admin_ssb", "pelatih", "korlas", "orang_tua"];
/** Tabel markdown untuk docs/izin.md. */
export function renderPermissionTable(): string {
  const head = `| Izin | Keterangan | ${roleOrder.join(" | ")} |\n|---|---|${roleOrder.map(() => ":-:").join("|")}|`;
  const rows = (Object.keys(permissions) as Permission[]).map(
    (p) => `| \`${p}\` | ${permissions[p].desc} | ${roleOrder.map((r) => (can(r, p) ? "ya" : "-")).join(" | ")} |`,
  );
  return `${[head, ...rows].join("\n")}\n`;
}

/** Kode SSB dipakai saat login, jadi dibatasi huruf kecil, angka, dan tanda hubung. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3-40 karakter: huruf kecil, angka, tanda hubung");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));

export const passwordSchema = z.string().min(10, "minimal 10 karakter").max(200);

export const ssbInputSchema = z.object({
  ssbName: z.string().trim().min(2).max(120),
  slug: slugSchema,
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
});
export type SsbInput = z.infer<typeof ssbInputSchema>;

/** Daftar akun baru sekaligus SSB baru, dengan email + kata sandi. */
export const registerSsbSchema = ssbInputSchema.extend({
  adminName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterSsb = z.infer<typeof registerSsbSchema>;

/** Kode SSB opsional: dipakai bila akun punya beberapa SSB dan ingin langsung memilih salah satu. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  slug: slugSchema.optional(),
});
export type Login = z.infer<typeof loginSchema>;

export const selectSsbSchema = z.object({ ssbId: z.uuid() });

/** Peran yang bisa diundang. Admin SSB pertama dibuat saat pendaftaran SSB. */
/** Satu baris daftar undangan (token tidak pernah disimpan, jadi tautan lama tidak bisa ditampilkan lagi). */
export type InvitationRow = {
  id: string;
  role: UserRole;
  label: string | null;
  player: { id: string; name: string } | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  status: "menunggu" | "diterima" | "kedaluwarsa";
};

export const invitableRoleSchema = z.enum(["pelatih", "korlas", "orang_tua"]);

export const createInvitationSchema = z.object({
  role: invitableRoleSchema,
  label: z.string().trim().max(120).optional(),
  /** Untuk orang tua: siswa yang langsung dihubungkan. */
  playerId: z.uuid().optional(),
});

/**
 * Nomor WhatsApp: spasi, strip, dan tanda kurung dibuang, awalan "+" dibuang (62... tetap 62...),
 * dan harus 8 sampai 15 angka. Disimpan sebagai angka saja, mis. 081234567890 atau 6281234567890.
 */
export const whatsappSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{8,15}$/, "nomor WhatsApp tidak valid (8 sampai 15 angka)"))
  .transform((s) => s.replace(/^\+/, ""));
/** Isian kosong dianggap tidak diisi. */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/** Hanya isian kosong yang menghapus; field yang tidak dikirim tetap ditolak agar permintaan kosong tidak menghapus nomor. */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Menerima undangan dengan akun baru (email + kata sandi). Akun yang sudah login tidak perlu body. */
export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  whatsapp: z.preprocess(emptyToUndefined, whatsappSchema.optional()),
});

/** Mengubah kontak keanggotaan di SSB aktif. Kosong atau null menghapus nomor. */
export const updateProfileSchema = z.object({
  whatsapp: z.preprocess(emptyToNull, whatsappSchema.nullable()),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ newPassword: passwordSchema });

/** Admin SSB mengubah anggota: nama tampilan, nomor WhatsApp (kosong menghapus), dan/atau peran. */
export const memberUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter").optional(),
    whatsapp: z.preprocess(emptyToNull, whatsappSchema.nullable()).optional(),
    role: userRoleSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.whatsapp !== undefined || v.role !== undefined, { message: "tidak ada yang diubah" });
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  whatsapp: string | null;
  joinedAt: string;
  isSelf: boolean;
  /** Anak yang dihubungkan (orang tua) dan jumlah penugasan KU (pelatih, korlas). */
  children: number;
  assignments: number;
  /** Cara masuk akun ini, supaya admin tahu apakah reset kata sandi relevan. */
  hasPassword: boolean;
  hasGoogle: boolean;
};

/** Menghapus akun sendiri: kata sandi untuk akun berkata sandi, atau mengetik email untuk akun yang hanya login Google. */
export const deleteAccountSchema = z.object({ confirm: z.string().min(1).max(200) });

export const changePasswordSchema = z.object({
  /** Wajib bila akun sudah punya kata sandi; akun yang hanya login Google boleh mengosongkannya. */
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

/** Bentuk baku error API. */
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const membershipSchema = z.object({
  ssbId: z.string(),
  userId: z.string(),
  ssbName: z.string(),
  role: userRoleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const meSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  email: z.string(),
  /** Apakah akun punya kata sandi (akun yang hanya login Google belum punya). */
  hasPassword: z.boolean(),
  /** Nomor WhatsApp pada keanggotaan di SSB aktif; null bila belum diisi atau belum memilih SSB. */
  whatsapp: z.string().nullable(),
  /** SSB aktif pada sesi ini; kosong bila akun belum memilih SSB. */
  active: membershipSchema.nullable(),
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;

// ---- Data master ----

const nameField = z.string().trim().min(2, "minimal 2 karakter").max(80, "maksimal 80 karakter");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "format tanggal YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), "tanggal tidak valid");

export const ageGroupInputSchema = z
  .object({
    name: nameField,
    minAge: z.number().int("harus bilangan bulat").min(0, "minimal 0").max(30, "maksimal 30"),
    maxAge: z.number().int("harus bilangan bulat").min(0, "minimal 0").max(30, "maksimal 30"),
  })
  .refine((v) => v.maxAge >= v.minAge, { path: ["maxAge"], message: "tidak boleh lebih kecil dari usia minimal" });
export type AgeGroupInput = z.infer<typeof ageGroupInputSchema>;

export const periodInputSchema = z
  .object({ name: nameField, startDate: isoDate, endDate: isoDate })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "tidak boleh sebelum tanggal mulai" });
export type PeriodInput = z.infer<typeof periodInputSchema>;

export const locationInputSchema = z.object({
  name: nameField,
  address: z.string().trim().max(200, "maksimal 200 karakter").optional(),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const ageGroupSchema = z.object({ id: z.string(), name: z.string(), minAge: z.number(), maxAge: z.number() });
export const periodSchema = z.object({ id: z.string(), name: z.string(), startDate: z.string(), endDate: z.string() });
export const locationSchema = z.object({ id: z.string(), name: z.string(), address: z.string().nullable() });
export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type Period = z.infer<typeof periodSchema>;
export type Location = z.infer<typeof locationSchema>;

// ---- Siswa ----

export const playerStatusSchema = z.enum(["aktif", "cuti", "keluar"]);
export type PlayerStatus = z.infer<typeof playerStatusSchema>;

const uuidStr = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "id tidak valid");
const today = () => new Date().toISOString().slice(0, 10);

export const documentStatusSchema = z.enum(["lengkap", "sebagian", "belum"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export const documentStatusLabel: Record<DocumentStatus, string> = { lengkap: "Lengkap", sebagian: "Sebagian", belum: "Belum" };

const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max, `maksimal ${max} karakter`).nullable().optional());
const optInt = (min: number, max: number) =>
  z.number().int("harus bilangan bulat").min(min, `minimal ${min}`).max(max, `maksimal ${max}`).nullable().optional();
const optNum = (min: number, max: number) => z.number().min(min, `minimal ${min}`).max(max, `maksimal ${max}`).nullable().optional();

/**
 * Biodata siswa. Dipakai untuk membuat dan mengubah (ubah mengirim seluruh isian).
 * `memberNo` (ID siswa) kosong berarti otomatis pada siswa baru dan tetap pada perubahan.
 * WhatsApp orang tua: awalan 8 (nol hilang karena lembar sebar) dilengkapi menjadi 08.
 */
export const playerFormSchema = z.object({
  memberNo: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(30, "maksimal 30 karakter")
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "hanya huruf, angka, titik, strip, dan garis miring")
      .nullable()
      .optional(),
  ),
  nisn: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d{10}$/, "NISN terdiri dari 10 angka")
      .nullable()
      .optional(),
  ),
  fullName: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter"),
  birthPlace: optText(80),
  birthDate: isoDate.refine((d) => d <= today(), "tidak boleh di masa depan").refine((d) => d >= "1990-01-01", "terlalu lama"),
  position: positionSchema.nullable().optional(),
  school: z.string().trim().max(120, "maksimal 120 karakter").nullable().optional(),
  ageGroupId: uuidStr.nullable().optional(),
  status: playerStatusSchema.default("aktif"),
  guardianName: optText(120),
  guardianWhatsapp: z.preprocess(
    emptyToNull,
    whatsappSchema
      .transform((s) => (s.startsWith("8") ? `0${s}` : s))
      .nullable()
      .optional(),
  ),
  documentStatus: documentStatusSchema.default("belum"),
  heightCm: optInt(50, 230),
  weightKg: optNum(10, 200),
  medicalNote: optText(500),
  jerseyNo: optInt(0, 99),
  jerseySize: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(10, "maksimal 10 karakter")
      .transform((s) => s.toUpperCase())
      .nullable()
      .optional(),
  ),
  shoeSize: optNum(15, 50),
});
export type PlayerForm = z.input<typeof playerFormSchema>;
/** Isi formulir setelah validasi (nilai bawaan terisi, nomor WhatsApp dinormalkan). */
export type PlayerFormData = z.output<typeof playerFormSchema>;

export const guardianInputSchema = z.object({ userId: uuidStr, relationship: z.string().trim().max(40).optional() });
export const assignmentInputSchema = z.object({ userId: uuidStr, ageGroupId: uuidStr, periodId: uuidStr });

export type PlayerSummary = {
  id: string;
  memberNo: string | null;
  fullName: string;
  birthDate: string;
  position: Position | null;
  school: string | null;
  status: PlayerStatus;
  ageGroup: { id: string; name: string } | null;
  /** Versi foto; null bila belum ada. Dipakai untuk URL `/players/:id/photo?v=<versi>`. */
  photoV: string | null;
};
/** Data lengkap siswa selain ringkasan; hanya ada di detail siswa. */
export type PlayerExtra = {
  nisn: string | null;
  birthPlace: string | null;
  guardianName: string | null;
  guardianWhatsapp: string | null;
  documentStatus: DocumentStatus;
  heightCm: number | null;
  weightKg: number | null;
  medicalNote: string | null;
  jerseyNo: number | null;
  jerseySize: string | null;
  shoeSize: number | null;
};
export type PlayerDetail = PlayerSummary &
  PlayerExtra & {
    history: { field: "age_group" | "status"; from: string | null; to: string | null; at: string }[];
    /** Hanya untuk admin SSB. */
    guardians?: { userId: string; name: string; relationship: string | null }[];
  };
/** Ringkasan per siswa untuk tabel pemain: wali utama (hanya admin SSB) dan penilaian terakhir. */
export type PlayerOverview = {
  playerId: string;
  /** Hanya diisi untuk admin SSB. `total` = jumlah wali yang terhubung; yang ditampilkan wali pertama. */
  guardian: { name: string; whatsapp: string | null; relationship: string | null; total: number } | null;
  /** Penilaian pada periode terbaru. Orang tua hanya mendapat yang sudah terbit. */
  latestAssessment: { periodName: string; overall: number | null; assessedOn: string; published: boolean } | null;
};
export type Assignment = { userId: string; userName: string; role: UserRole; ageGroupId: string; ageGroupName: string; periodId: string; periodName: string };

// ---- Sesi latihan dan absensi ----

export const attendanceStatusSchema = z.enum(["hadir", "izin", "sakit", "alpa"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

const timeHm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "format jam HH:MM");

export const sessionInputSchema = z.object({
  ageGroupId: uuidStr,
  sessionDate: isoDate,
  startTime: timeHm.nullable().optional(),
  locationId: uuidStr.nullable().optional(),
});
/** Membuat sesi; `repeatUntil` mengulang tiap minggu di hari yang sama sampai tanggal itu (termasuk). */
export const sessionCreateSchema = sessionInputSchema
  .extend({ repeatUntil: isoDate.nullable().optional() })
  .refine((v) => !v.repeatUntil || v.repeatUntil >= v.sessionDate, { path: ["repeatUntil"], message: "tidak boleh sebelum tanggal sesi" });

export const attendanceInputSchema = z.object({
  entries: z
    .array(z.object({ playerId: uuidStr, status: attendanceStatusSchema, note: z.string().trim().max(200).nullable().optional() }))
    .min(1, "minimal satu siswa")
    .max(200, "maksimal 200 siswa per permintaan"),
});

export type TrainingSession = {
  id: string;
  sessionDate: string;
  startTime: string | null;
  ageGroup: { id: string; name: string };
  location: { id: string; name: string } | null;
  period: { id: string; name: string } | null;
  /** Ringkasan absensi: jumlah per status dan siswa aktif yang belum diisi. */
  attendance: { hadir: number; izin: number; sakit: number; alpa: number; belum: number };
};
export type AttendanceRoster = {
  session: TrainingSession;
  players: {
    playerId: string;
    fullName: string;
    memberNo: string | null;
    status: AttendanceStatus | null;
    note: string | null;
    /** Cedera yang sedang berjalan (tanpa catatan); null bila tidak ada. */
    injury: InjuryMark | null;
  }[];
};

export type AttendanceSummaryRow = {
  playerId: string;
  fullName: string;
  memberNo: string | null;
  status: PlayerStatus;
  ageGroup: { id: string; name: string };
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  /** hadir + izin + sakit + alpa: sesi yang absensinya tercatat untuk siswa ini. */
  recorded: number;
  /** hadir / recorded * 100, satu desimal; null bila belum ada catatan. */
  percent: number | null;
};
export type AttendanceSummary = {
  period: { id: string; name: string } | null;
  ageGroup: { id: string; name: string } | null;
  /** Jumlah sesi pada rentang ini yang sudah punya catatan absensi. */
  sessionsHeld: number;
  players: AttendanceSummaryRow[];
};

export type GuardianSession = {
  sessionId: string;
  sessionDate: string;
  startTime: string | null;
  ageGroup: { id: string; name: string };
  location: { id: string; name: string } | null;
  playerId: string;
  playerName: string;
  /** Status kehadiran anak pada sesi ini; null bila belum dicatat. */
  status: AttendanceStatus | null;
};

// ---- Landing page akademi ----
export * from "./site";
export * from "./post";
export * from "./mailbox";
export * from "./markdown";

// ---- Assessment (skala 1 sampai 10) ----
export * from "./aspects";

import { assessmentAspects as _aspects, SCORE_MIN, SCORE_MAX, type AssessmentAspect, type Tren } from "./aspects";
export const aspectSchema = z.enum(_aspects);
export const indicatorInputSchema = z.object({ ageGroupId: uuidStr, aspect: aspectSchema, name: nameField });
export const indicatorPatchSchema = z.object({ name: nameField, active: z.boolean(), sortOrder: z.number().int().min(0).max(999).optional() });
export const indicatorDefaultsSchema = z.object({ ageGroupId: uuidStr });
export const assessmentInputSchema = z.object({
  assessedOn: isoDate.optional(),
  note: z.string().trim().max(1000, "maksimal 1000 karakter").nullable().optional(),
  scores: z
    .array(
      z.object({
        indicatorId: uuidStr,
        score: z
          .number({ message: "harus berupa angka" })
          .int("harus bilangan bulat")
          .min(SCORE_MIN, `minimal ${SCORE_MIN}`)
          .max(SCORE_MAX, `maksimal ${SCORE_MAX}`),
      }),
    )
    .min(1, "minimal satu skor")
    .max(60, "maksimal 60 skor"),
});
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export type AssessmentIndicator = { id: string; ageGroupId: string; aspect: AssessmentAspect; name: string; sortOrder: number; active: boolean };
export type AssessmentView = {
  id: string;
  period: { id: string; name: string; startDate: string; endDate: string };
  ageGroup: { id: string; name: string };
  assessedOn: string;
  note: string | null;
  assessor: string | null;
  publishedAt: string | null;
  scores: { indicatorId: string; aspect: AssessmentAspect; name: string; score: number }[];
  /** Rata-rata per aspek (satu desimal). */
  aspects: { aspect: AssessmentAspect; average: number }[];
  /** Rata-rata semua skor (satu desimal); null bila belum ada skor. */
  overall: number | null;
};
// ---- Lencana ----
export * from "./badges";
import { badgeCodes, type BadgeCode } from "./badges";
export const badgeInputSchema = z.object({ badge: z.enum(badgeCodes) });
export type PlayerBadge = { id: string; badge: BadgeCode; awardedAt: string; awardedBy: string | null };

// ---- Cedera ----
export * from "./injuries";
import { bodyPartCodes, INJURY_NOTE_MAX, type BodyPartCode } from "./injuries";
/** Batas tanggal "hari ini" yang longgar sehari: server memakai UTC sedangkan SSB di WIB (pagi hari WIB masih tanggal kemarin di UTC). */
const sampaiHariIni = (d: string) => d <= new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const injuryNote = z.preprocess(emptyToNull, z.string().trim().max(INJURY_NOTE_MAX, `maksimal ${INJURY_NOTE_MAX} karakter`).nullable().optional());
export const injuryInputSchema = z
  .object({
    bodyPart: z.enum(bodyPartCodes),
    startedOn: isoDate.refine(sampaiHariIni, "tidak boleh di masa depan").refine((d) => d >= "2000-01-01", "terlalu lama"),
    expectedReturnOn: z.preprocess(emptyToNull, isoDate.nullable().optional()),
    note: injuryNote,
  })
  .refine((b) => !b.expectedReturnOn || b.expectedReturnOn >= b.startedOn, { path: ["expectedReturnOn"], message: "tidak boleh sebelum tanggal mulai" });
/** Mengubah perkiraan pulih dan catatan; keduanya boleh dikosongkan. Bagian tubuh dan tanggal mulai tetap. */
export const injuryUpdateSchema = z
  .object({
    expectedReturnOn: z.preprocess(emptyToNull, isoDate.nullable().optional()),
    note: injuryNote,
  })
  .refine((b) => b.expectedReturnOn !== undefined || b.note !== undefined, { message: "Tidak ada yang diubah" });
export const injuryRecoverSchema = z.object({ recoveredOn: isoDate.refine(sampaiHariIni, "tidak boleh di masa depan").optional() });
export type InjuryMark = { bodyPart: BodyPartCode; expectedReturnOn: string | null };
export type PlayerInjury = {
  id: string;
  bodyPart: BodyPartCode;
  startedOn: string;
  expectedReturnOn: string | null;
  recoveredOn: string | null;
  note: string | null;
  recordedBy: string | null;
};

// ---- Kecocokan posisi ----
export * from "./posisi";
import { WEIGHT_MAX } from "./posisi";
/** Mengganti seluruh bobot buatan SSB. Posisi atau indikator yang tidak dikirim kembali ke bobot awal. */
export const positionWeightsInputSchema = z.object({
  weights: z.partialRecord(
    positionSchema,
    z.record(nameField, z.number().int("harus bilangan bulat").min(0, "minimal 0").max(WEIGHT_MAX, `maksimal ${WEIGHT_MAX}`)),
  ),
});
export type PositionWeightsInput = z.infer<typeof positionWeightsInputSchema>;

/** Satu baris tabel skuad: penilaian terbaru yang punya skor (termasuk draf) dan tren dari seluruh periode bernilai. Identitas siswa diambil dari `/players`. */
export type SquadRow = {
  playerId: string;
  /** Periode penilaian yang dipakai; null bila siswa belum punya penilaian bernilai. */
  periodName: string | null;
  overall: number | null;
  aspects: { aspect: AssessmentAspect; average: number }[];
  published: boolean;
  tren: Tren;
  /** Cedera yang sedang berjalan (tanpa catatan); null bila tidak ada. */
  injury: InjuryMark | null;
};
/** Rata-rata skor per aspek untuk satu periode, dari seluruh penilaian yang boleh dilihat peran pemanggil. */
export type AspectSummary = {
  period: { id: string; name: string; startDate: string };
  /** Jumlah penilaian (siswa) yang dihitung pada periode ini. */
  assessments: number;
  aspects: { aspect: AssessmentAspect; average: number }[];
};
export type AssessmentHistoryRow = { indicator: string; aspect: AssessmentAspect; from: number | null; to: number; by: string | null; at: string };

export const developmentPlanItemInputSchema = z.object({
  aspect: aspectSchema.nullable().optional(),
  area: z.string().trim().min(1, "wajib diisi").max(120, "maksimal 120 karakter"),
  target: z.string().trim().max(200, "maksimal 200 karakter").nullable().optional(),
  note: z.string().trim().max(500, "maksimal 500 karakter").nullable().optional(),
});
/** Mengganti seluruh rencana satu siswa pada satu periode; daftar kosong menghapusnya. */
export const developmentPlanInputSchema = z.object({ items: z.array(developmentPlanItemInputSchema).max(8, "maksimal 8 butir") });
export type DevelopmentPlanInput = z.infer<typeof developmentPlanInputSchema>;
export type DevelopmentPlanItem = { id: string; aspect: AssessmentAspect | null; area: string; target: string | null; note: string | null };

// ---- SPP: tarif, tagihan, dan pembayaran ----

/** Tarif SPP per bulan (rupiah) tiap KU; null = belum diatur, siswa KU itu tidak ikut ditagih. */
export const feeRatesInputSchema = z.object({
  rates: z
    .array(
      z.object({
        ageGroupId: z.uuid(),
        monthlyFee: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(100_000_000, "terlalu besar").nullable(),
      }),
    )
    .max(50),
});
export type FeeRatesInput = z.infer<typeof feeRatesInputSchema>;
export type FeeRate = { ageGroupId: string; name: string; monthlyFee: number | null; activePlayers: number };

/** Membuat tagihan satu bulan (YYYY-MM) untuk semua siswa aktif di KU yang punya tarif; yang sudah ditagih dilewati. */
export const generateInvoicesSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "format bulan YYYY-MM"),
  /** Tanggal jatuh tempo di bulan itu. Bila diisi, menimpa pengaturan bawaan SSB. */
  dueDay: z.number().int().min(1).max(28).optional(),
});
export type GenerateInvoices = z.infer<typeof generateInvoicesSchema>;
export type GenerateInvoicesResult = { created: number; existing: number; withoutRate: number };

export const paymentMethodSchema = z.enum(["tunai", "transfer", "lainnya"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const paymentInputSchema = z.object({
  amount: z.number().int("harus bilangan bulat").min(1, "minimal 1 rupiah").max(100_000_000, "terlalu besar"),
  paidOn: isoDate,
  method: paymentMethodSchema.default("tunai"),
  note: z.string().trim().max(200, "maksimal 200 karakter").optional(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export type InvoiceStatus = "belum" | "sebagian" | "lunas" | "dibatalkan";
export type PaymentRow = { id: string; amount: number; paidOn: string; method: PaymentMethod; note: string | null; recordedBy: string | null };
export type InvoiceRow = {
  id: string;
  player: { id: string; name: string; memberNo: string | null; ageGroup: string | null };
  /** Tanggal 1 bulan yang ditagih. */
  month: string;
  amount: number;
  paid: number;
  remaining: number;
  dueOn: string;
  status: InvoiceStatus;
  /** Lewat jatuh tempo dan belum lunas. */
  overdue: boolean;
  payments: PaymentRow[];
  /** Pengingat yang sudah dikirim admin (dicatat saat tombol kirim ditekan). */
  lastRemindedAt: string | null;
  reminderCount: number;
};
/** Tagihan yang perlu diingatkan (menunggak atau segera jatuh tempo) beserta wali yang bisa dihubungi. */
export type ReminderRow = Omit<InvoiceRow, "payments"> & {
  /** Hari menuju jatuh tempo; negatif = sudah terlambat sekian hari. */
  daysToDue: number;
  /** Sudah diingatkan dalam masa jeda pengaturan, jadi pengingat berikutnya sebaiknya ditunda. */
  dalamJeda: boolean;
  /** Sisa hari jeda sebelum tagihan ini boleh diingatkan lagi; 0 bila sudah boleh. */
  sisaJedaHari: number;
  guardians: { name: string; whatsapp: string | null; relationship: string | null }[];
};
export type FeeSummary = {
  month: string;
  invoices: number;
  billed: number;
  paid: number;
  outstanding: number;
  overdueInvoices: number;
  settledInvoices: number;
};

/** Templat pesan pengingat bawaan. Kata kunci di dalam kurung diisi sistem. */
export const TEMPLAT_PENGINGAT_AWAL =
  "Yth. {wali}, kami dari {ssb} mengingatkan bahwa SPP {anak} bulan {bulan} sebesar {sisa} ({status}). Mohon pembayarannya diselesaikan. Bila sudah membayar, abaikan pesan ini. Terima kasih.";

/** Keterangan jatuh tempo: terlambat sekian hari, hari ini, atau sekian hari lagi. */
export const statusTempo = (hari: number) =>
  hari < 0 ? `terlambat ${-hari} hari` : hari === 0 ? "jatuh tempo hari ini" : hari === 1 ? "jatuh tempo besok" : `jatuh tempo ${hari} hari lagi`;

/** Rupiah dengan pemisah ribuan titik: 150000 menjadi "Rp 150.000". */
export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** "2026-10" atau "2026-10-01" menjadi "Oktober 2026". */
export const namaBulan = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

/**
 * Isi templat pesan pengingat. Kata kunci yang didukung: {wali}, {anak},
 * {bulan}, {sisa}, {status}, dan {ssb}. Dipakai di server (pengiriman
 * otomatis) dan di peramban (pratinjau pesan), jadi hasilnya sama.
 */
export const isiTemplat = (templat: string, data: { wali: string; anak: string; bulan: string; sisa: number; hari: number; ssb: string }) =>
  templat
    .replaceAll("{wali}", data.wali)
    .replaceAll("{anak}", data.anak)
    .replaceAll("{bulan}", namaBulan(data.bulan))
    .replaceAll("{sisa}", rupiah(data.sisa))
    .replaceAll("{status}", statusTempo(data.hari))
    .replaceAll("{ssb}", data.ssb);

/** Pengaturan SPP milik SSB: satu baris, dibuat saat admin pertama kali menyimpan. */
export const feeSettingsSchema = z.object({
  /** Tanggal jatuh tempo bawaan untuk tagihan baru (1-28). */
  dueDay: z.number().int("harus bilangan bulat").min(1, "minimal 1").max(28, "maksimal 28"),
  /** Templat pesan pengingat; kata kunci {wali} {anak} {bulan} {sisa} {status} {ssb} diisi sistem. */
  reminderTemplate: z.string().trim().min(1, "wajib diisi").max(600, "maksimal 600 karakter"),
  /** Info rekening tujuan pembayaran; boleh kosong. */
  bankInfo: z.string().trim().max(300, "maksimal 300 karakter").nullable(),
  /** Jeda minimal antar pengingat untuk tagihan yang sama, dalam hari. 0 = boleh setiap hari. */
  reminderIntervalDays: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(90, "maksimal 90 hari"),
});
export type FeeSettingsInput = z.infer<typeof feeSettingsSchema>;
export type FeeSettings = FeeSettingsInput;

/** Pengaturan yang boleh dilihat orang tua: hanya info rekening. */
export type FeePublicInfo = { bankInfo: string | null };

/**
 * Pengaturan pengiriman WhatsApp (Fonnte) milik SSB.
 * Token API tidak pernah dikembalikan ke peramban; hanya status keberadaannya.
 */
export const whatsappSettingsSchema = z.object({
  /** Token API Fonnte. Kosong berarti token dihapus dan pengiriman otomatis nonaktif. */
  token: z.string().trim().max(200, "terlalu panjang").optional(),
  /** Kode negara untuk normalisasi nomor tujuan; default 62 (Indonesia). */
  countryCode: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, "kode negara berupa angka, mis. 62")
    .default("62"),
  /** Aktifkan pengiriman pengingat tagihan otomatis. */
  autoReminder: z.boolean().default(false),
});
export type WhatsappSettingsInput = z.infer<typeof whatsappSettingsSchema>;
export type WhatsappSettings = {
  /** True bila token tersimpan di server. Nilainya sendiri tidak pernah dikirim ke peramban. */
  hasToken: boolean;
  countryCode: string;
  autoReminder: boolean;
};

/** Kata yang boleh dipakai di pesan untuk pendaftar trial; diisi dari data pendaftar saat pesan dibuat. */
export const TRIAL_WA_PLACEHOLDERS = [
  { key: "wali", desc: "Nama orang tua" },
  { key: "anak", desc: "Nama anak" },
  { key: "kode", desc: "Kode pendaftaran (TRL-...)" },
  { key: "ssb", desc: "Nama akademi" },
] as const;
export const TRIAL_REPLY_TEMPLATE_MAX = 1000;
export const DEFAULT_TRIAL_REPLY_TEMPLATE =
  "Halo {wali}, terima kasih sudah mendaftarkan {anak} untuk trial di {ssb} (kode {kode}). Kami akan menghubungi Anda untuk mengatur jadwal trialnya.";
/** Isi templat dengan data pendaftar. Kata yang tidak dikenal dibiarkan apa adanya supaya salah ketik terlihat. */
export function renderTrialMessage(template: string, v: Record<(typeof TRIAL_WA_PLACEHOLDERS)[number]["key"], string>): string {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (k in v ? v[k as keyof typeof v] : all));
}
/** Kata di templat yang bukan salah satu kata yang dikenal, untuk peringatan di layar pengaturan. */
export const unknownTrialPlaceholders = (template: string): string[] => {
  const known = new Set<string>(TRIAL_WA_PLACEHOLDERS.map((p) => p.key));
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].filter((k) => !known.has(k));
};

/**
 * Pengaturan WhatsApp untuk pendaftar trial (token Fonnte dipakai bersama pengaturan SPP).
 * Templat kosong berarti memakai templat bawaan.
 */
export const trialWaSettingsSchema = z
  .object({
    replyEnabled: z.boolean(),
    replyTemplate: z.preprocess(emptyToNull, z.string().trim().max(TRIAL_REPLY_TEMPLATE_MAX, `maksimal ${TRIAL_REPLY_TEMPLATE_MAX} karakter`).nullable().optional()),
    notifyEnabled: z.boolean(),
    notifyNumber: z.preprocess(emptyToNull, whatsappSchema.nullable().optional()),
  })
  .refine((b) => !b.notifyEnabled || !!b.notifyNumber, { path: ["notifyNumber"], message: "isi nomor admin dulu" });
export type TrialWaSettingsInput = z.infer<typeof trialWaSettingsSchema>;
export type TrialWaSettings = {
  /** Token Fonnte sudah tersimpan (diisi di SPP > Pengaturan). Pesan tidak bisa dikirim tanpa ini. */
  hasToken: boolean;
  replyEnabled: boolean;
  /** Templat yang berlaku (bawaan bila belum diubah). */
  replyTemplate: string;
  /** True bila templat masih bawaan. */
  replyTemplateDefault: boolean;
  notifyEnabled: boolean;
  notifyNumber: string | null;
};

/** Hasil pengiriman pesan lewat Fonnte. */
export type WaSendResult = {
  ok: boolean;
  /** Id pesan dari Fonnte bila berhasil. */
  ids: string[];
  /** Alasan kegagalan dari Fonnte (mis. "token invalid") bila gagal. */
  reason: string | null;
};

/** Pesan uji: nomor tujuan dan teksnya. */
export const whatsappTestSchema = z.object({
  /** Nomor tujuan; boleh format lokal (08...) atau internasional (62...). */
  number: whatsappSchema,
  /** Isi pesan uji. */
  message: z.string().trim().min(1, "wajib diisi").max(1000, "maksimal 1000 karakter"),
});
export type WhatsappTestInput = z.infer<typeof whatsappTestSchema>;

/** Tarif SPP khusus satu siswa; menggantikan tarif KU. 0 = tidak ditagih. */
export const playerFeeOverrideSchema = z.object({
  playerId: z.uuid(),
  monthlyFee: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(100_000_000, "terlalu besar"),
  note: z.string().trim().max(120, "maksimal 120 karakter").nullable(),
});
export type PlayerFeeOverrideInput = z.infer<typeof playerFeeOverrideSchema>;
export type PlayerFeeOverrideRow = {
  playerId: string;
  playerName: string;
  ageGroup: string | null;
  monthlyFee: number;
  note: string | null;
};

/** Ubah nominal tagihan yang sudah dibuat. */
export const invoiceAmountSchema = z.object({
  amount: z.number().int("harus bilangan bulat").min(1, "minimal 1 rupiah").max(100_000_000, "terlalu besar"),
});
export type InvoiceAmountInput = z.infer<typeof invoiceAmountSchema>;

// ---- Merchandise: produk dan pesanan penjualan ----

export const merchandiseStatusSchema = z.enum(["pending", "processing", "shipped", "completed", "cancelled"]);
export type MerchandiseStatus = z.infer<typeof merchandiseStatusSchema>;

/** Kategori produk merchandise. Kode disimpan di database tanpa CHECK, jadi daftar ini bisa ditambah tanpa migrasi. */
export const merchandiseCategories = [
  { code: "jersey", label: "Jersey" },
  { code: "aksesori", label: "Aksesori" },
  { code: "lainnya", label: "Lainnya" },
] as const;
export type MerchandiseCategory = (typeof merchandiseCategories)[number]["code"];
export const merchandiseCategorySchema = z.enum(merchandiseCategories.map((c) => c.code) as [MerchandiseCategory, ...MerchandiseCategory[]]);
export const merchandiseCategoryLabel = Object.fromEntries(merchandiseCategories.map((c) => [c.code, c.label])) as Record<MerchandiseCategory, string>;

/** Membuat atau mengubah produk merchandise. `id` dikosongkan untuk produk baru. */
export const merchandiseProductInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "minimal 2 karakter").max(100, "maksimal 100 karakter"),
  description: z.string().trim().max(500, "maksimal 500 karakter").optional(),
  price: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(1_000_000_000, "terlalu besar"),
  hpp: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(1_000_000_000, "terlalu besar"),
  stock: z.number().int("harus bilangan bulat").min(0, "tidak boleh negatif").max(1_000_000, "terlalu besar"),
  category: merchandiseCategorySchema.default("lainnya"),
  imageFileKey: z.string().trim().nullable().optional(),
  active: z.boolean().default(true),
});
export type MerchandiseProductInput = z.infer<typeof merchandiseProductInputSchema>;

/** Produk merchandise untuk publik (landing): tanpa harga modal (HPP). */
export type MerchandisePublicProduct = { id: string; name: string; description: string; price: number; stock: number; category: MerchandiseCategory; imageFileKey: string | null };

/** Baris produk merchandise dalam daftar admin. */
export type MerchandiseProductRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  hpp: number;
  stock: number;
  category: MerchandiseCategory;
  imageFileKey: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Margin keuntungan per unit: harga jual dikurangi harga beli (HPP). */
export const marginKeuntungan = (price: number, hpp: number) => price - hpp;

/** Pesanan merchandise dari pembeli. */
export const merchandiseOrderInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1, "minimal 1"),
      }),
    )
    .min(1, "minimal satu produk"),
  buyerName: z.string().trim().min(2, "minimal 2 karakter").max(100, "maksimal 100 karakter"),
  buyerWhatsapp: z.string().trim().min(8, "minimal 8 angka").max(15, "maksimal 15 angka"),
  shippingAddress: z.string().trim().min(5, "minimal 5 karakter").max(300, "maksimal 300 karakter"),
});
export type MerchandiseOrderInput = z.infer<typeof merchandiseOrderInputSchema>;

/** Baris pesanan merchandise dalam daftar admin. */
export type MerchandiseOrderRow = {
  id: string;
  buyerName: string;
  buyerWhatsapp: string;
  shippingAddress: string;
  total: number;
  status: MerchandiseStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  items: MerchandiseOrderItemRow[];
};

/** Satu item produk dalam pesanan merchandise. */
export type MerchandiseOrderItemRow = {
  id: string;
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
};

/** Ubah status pesanan merchandise (admin). */
export const merchandiseOrderStatusSchema = z.object({
  status: merchandiseStatusSchema,
  adminNote: z.string().trim().max(300, "maksimal 300 karakter").nullable().optional(),
});
export type MerchandiseOrderStatusInput = z.infer<typeof merchandiseOrderStatusSchema>;

// ---- Kalender akademi: pertandingan, acara, libur ----

export const calendarEventTypeSchema = z.enum(["pertandingan", "latihan", "acara", "libur", "lainnya"]);
export type CalendarEventType = z.infer<typeof calendarEventTypeSchema>;

/** Membuat atau mengubah kegiatan kalender. Satu hari bila `endDate` kosong; jam boleh kosong (sepanjang hari). */
export const calendarEventInputSchema = z
  .object({
    title: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter"),
    description: z.string().trim().max(1000, "maksimal 1000 karakter").default(""),
    eventType: calendarEventTypeSchema.default("acara"),
    startDate: isoDate,
    endDate: z.preprocess(emptyToNull, isoDate.nullable().optional()),
    startTime: z.preprocess(emptyToNull, timeHm.nullable().optional()),
    endTime: z.preprocess(emptyToNull, timeHm.nullable().optional()),
    location: z.string().trim().max(160, "maksimal 160 karakter").default(""),
    isPublic: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "tidak boleh sebelum tanggal mulai" })
  .refine((v) => !v.endTime || !!v.startTime, { path: ["endTime"], message: "isi jam mulai lebih dulu" })
  .refine((v) => !v.endTime || !v.startTime || (v.endDate && v.endDate > v.startDate) || v.endTime >= v.startTime, {
    path: ["endTime"],
    message: "tidak boleh sebelum jam mulai",
  });
export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

/** Rentang tanggal untuk daftar kegiatan: kegiatan yang beririsan dengan rentang ini. Tanpa batas, daftar dimulai hari ini. */
export const calendarRangeSchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { path: ["to"], message: "tidak boleh sebelum tanggal awal" });
export type CalendarRange = z.infer<typeof calendarRangeSchema>;

/** Kegiatan kalender seperti dibaca landing page (hanya yang bertanda publik). */
export type PublicCalendarEvent = {
  id: string;
  title: string;
  description: string;
  eventType: CalendarEventType;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string;
};

/** Baris kegiatan kalender di aplikasi (anggota SSB). */
export type CalendarEventRow = PublicCalendarEvent & { isPublic: boolean };

// ---- Donasi: penggalangan dana (crowdfunding) per kegiatan ----

export const fundraisingStatusSchema = z.enum(["draft", "aktif", "selesai"]);
export type FundraisingStatus = z.infer<typeof fundraisingStatusSchema>;
export const pledgeKindSchema = z.enum(["donasi", "sponsor"]);
export type PledgeKind = z.infer<typeof pledgeKindSchema>;
export const pledgeStatusSchema = z.enum(["menunggu", "diterima", "ditolak"]);
export type PledgeStatus = z.infer<typeof pledgeStatusSchema>;

/** Batas nominal sumbangan satu kali, dalam rupiah (sama dengan batas kolom di database). */
export const PLEDGE_MAX = 1_000_000_000;
const pledgeAmount = z.number().int("harus bilangan bulat").min(1, "minimal 1 rupiah").max(PLEDGE_MAX, "terlalu besar");

/** Nominal terendah untuk donasi dengan nominal bebas dari landing (paket boleh lebih kecil bila admin menetapkannya). */
export const PUBLIC_PLEDGE_MIN = 10_000;

/** Satu paket donasi pada kampanye, mis. "Paket Jersey" Rp 150.000. */
export const donationPackageSchema = z.object({
  name: z.string().trim().min(2, "minimal 2 karakter").max(60, "maksimal 60 karakter"),
  amount: pledgeAmount,
  description: z.string().trim().max(200, "maksimal 200 karakter").default(""),
});
export type DonationPackage = z.infer<typeof donationPackageSchema>;

/** Membuat atau mengubah kampanye. Hanya kampanye `aktif` yang menerima sumbangan baru; draf tidak tampil di landing. */
export const fundraisingCampaignInputSchema = z.object({
  title: z.string().trim().min(3, "minimal 3 karakter").max(120, "maksimal 120 karakter"),
  description: z.string().trim().max(2000, "maksimal 2000 karakter").default(""),
  calendarEventId: z.preprocess(emptyToNull, uuidStr.nullable().optional()),
  targetAmount: z.number().int("harus bilangan bulat").min(1, "minimal 1 rupiah").max(2_000_000_000, "terlalu besar").nullable().optional(),
  deadline: z.preprocess(emptyToNull, isoDate.nullable().optional()),
  status: fundraisingStatusSchema.default("draft"),
  isPublic: z.boolean().default(true),
  paymentInfo: z.string().trim().max(1000, "maksimal 1000 karakter").default(""),
  packages: z
    .array(donationPackageSchema)
    .max(8, "maksimal 8 paket")
    .refine((l) => new Set(l.map((p) => p.name.toLowerCase())).size === l.length, "nama paket tidak boleh kembar")
    .default([]),
});
export type FundraisingCampaignInput = z.infer<typeof fundraisingCampaignInputSchema>;

/** Anggota menyumbang atau menjadi sponsor. Nama diambil dari akunnya; admin mengonfirmasi setelah transfer diterima. */
export const pledgeInputSchema = z.object({
  kind: pledgeKindSchema.default("donasi"),
  amount: pledgeAmount,
  message: z.string().trim().max(300, "maksimal 300 karakter").default(""),
  isAnonymous: z.boolean().default(false),
});
export type PledgeInput = z.infer<typeof pledgeInputSchema>;

/**
 * Donasi dari landing tanpa akun: memilih paket (`packageName`, nominal diambil dari paket) atau mengisi nominal bebas (`amount`).
 * WhatsApp wajib agar admin bisa menghubungi dan mencocokkan transfer. `website` adalah kolom jebakan bot.
 */
export const publicPledgeInputSchema = z
  .object({
    kind: pledgeKindSchema.default("donasi"),
    packageName: z.string().trim().max(60).optional(),
    amount: z.number().int("harus bilangan bulat").min(PUBLIC_PLEDGE_MIN, `minimal ${PUBLIC_PLEDGE_MIN.toLocaleString("id-ID")} rupiah`).max(PLEDGE_MAX, "terlalu besar").optional(),
    donorName: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter"),
    donorWhatsapp: whatsappSchema,
    message: z.string().trim().max(300, "maksimal 300 karakter").default(""),
    isAnonymous: z.boolean().default(false),
    website: z.string().max(200).optional(),
  })
  .refine((v) => v.packageName || v.amount !== undefined, { message: "Pilih paket atau isi nominal", path: ["amount"] });
export type PublicPledgeInput = z.input<typeof publicPledgeInputSchema>;

/** Jawaban setelah donasi dari landing diterima: petunjuk transfer baru dibuka di sini, tidak di daftar kampanye publik. */
export type PublicPledgeResult = {
  campaignTitle: string;
  kind: PledgeKind;
  amount: number;
  packageName: string | null;
  paymentInfo: string;
};

/** Admin mencatat sumbangan atau sponsor di luar aplikasi (tunai, transfer langsung, perusahaan); langsung berstatus diterima. */
export const donationRecordSchema = pledgeInputSchema.extend({
  donorName: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter"),
  donorWhatsapp: z.preprocess(emptyToNull, whatsappSchema.nullable().optional()),
  receivedOn: isoDate,
  adminNote: optText(300),
});
export type DonationRecordInput = z.infer<typeof donationRecordSchema>;

/** Admin menerima atau menolak sumbangan yang menunggu. Tanggal terima bawaannya hari ini (WIB). */
export const pledgeDecisionSchema = z.object({
  status: z.enum(["diterima", "ditolak"]),
  receivedOn: z.preprocess(emptyToNull, isoDate.nullable().optional()),
  adminNote: optText(300),
});
export type PledgeDecisionInput = z.infer<typeof pledgeDecisionSchema>;

/** Kegiatan kalender yang dikaitkan ke kampanye. */
export type FundraisingEventRef = { id: string; title: string; startDate: string };

/** Kampanye dengan ringkasan dana. `raised` dan `supporters` dihitung dari sumbangan yang sudah diterima. */
export type FundraisingCampaignRow = {
  id: string;
  title: string;
  description: string;
  event: FundraisingEventRef | null;
  targetAmount: number | null;
  raised: number;
  supporters: number;
  deadline: string | null;
  status: FundraisingStatus;
  /** Aktif dan belum lewat batas akhir: boleh menerima sumbangan baru. */
  open: boolean;
  isPublic: boolean;
  paymentInfo: string;
  packages: DonationPackage[];
};

/**
 * Satu sumbangan. `donorName` kosong bila donatur anonim dan pembacanya bukan admin atau pemiliknya.
 * `donorWhatsapp` dan `adminNote` hanya dikirim ke admin.
 */
export type FundraisingPledgeRow = {
  id: string;
  campaignId: string;
  kind: PledgeKind;
  amount: number;
  message: string;
  isAnonymous: boolean;
  donorName: string | null;
  status: PledgeStatus;
  receivedOn: string | null;
  createdAt: string;
  mine: boolean;
  packageName: string | null;
  /** Dikirim donatur umum lewat landing (tanpa akun). */
  fromLanding: boolean;
  donorWhatsapp?: string | null;
  adminNote?: string | null;
};

/** Detail kampanye: admin melihat semua sumbangan; anggota lain melihat yang sudah diterima dan miliknya sendiri. */
export type FundraisingDetail = { campaign: FundraisingCampaignRow; pledges: FundraisingPledgeRow[] };

/** Kampanye di landing page: tanpa info rekening, nominal tiap donatur, atau donatur anonim. */
export type PublicFundraising = {
  id: string;
  title: string;
  description: string;
  event: Omit<FundraisingEventRef, "id"> | null;
  targetAmount: number | null;
  raised: number;
  supporters: number;
  deadline: string | null;
  open: boolean;
  /** Paket pilihan donatur; kosong = hanya nominal bebas. */
  packages: DonationPackage[];
  sponsors: { name: string; kind: PledgeKind }[];
};

// ---- Indeks nilai pemain (MVI): rumus di ./market-value; tanpa nilai uang ----
export * from "./market-value";
import type { MviCategory, MviComponent } from "./market-value";

const hitungan = (max: number) => z.number().int("harus bilangan bulat").min(0, "minimal 0").max(max, `maksimal ${max}`);

/** Statistik laga satu siswa pada satu periode (diganti seluruhnya tiap disimpan). Starter, kartu kuning, dan kartu merah tidak melebihi jumlah laga. */
export const matchStatInputSchema = z
  .object({
    matchesPlayed: hitungan(200),
    goals: hitungan(500),
    assists: hitungan(500),
    starts: hitungan(200),
    yellowCards: hitungan(200),
    redCards: hitungan(200),
  })
  .superRefine((v, ctx) => {
    for (const k of ["starts", "yellowCards", "redCards"] as const) {
      if (v[k] > v.matchesPlayed) ctx.addIssue({ code: "custom", path: [k], message: "tidak boleh melebihi jumlah laga" });
    }
  });
export type MatchStatInput = z.infer<typeof matchStatInputSchema>;

const metrik = (min: number, max: number) => z.preprocess(emptyToNull, z.number().min(min, `minimal ${min}`).max(max, `maksimal ${max}`).nullable().optional());

/** Hasil tes kebugaran pada satu tanggal; metrik boleh sebagian, minimal satu terisi. */
export const physicalTestInputSchema = z
  .object({
    testedOn: isoDate.refine(sampaiHariIni, "tidak boleh di masa depan").refine((d) => d >= "2000-01-01", "terlalu lama"),
    speed30m: metrik(3, 15),
    zigZag: metrik(5, 40),
    verticalJump: metrik(5, 100),
    bleepLevel: metrik(1, 21),
    note: optText(200),
  })
  .refine((v) => [v.speed30m, v.zigZag, v.verticalJump, v.bleepLevel].some((x) => x !== null && x !== undefined), { path: ["speed30m"], message: "isi minimal satu hasil tes" });
export type PhysicalTestInput = z.infer<typeof physicalTestInputSchema>;

/** Menghitung ulang indeks seluruh siswa aktif satu KU pada satu periode. */
export const mviComputeSchema = z.object({ ageGroupId: uuidStr, periodId: uuidStr });
export type MviComputeInput = z.infer<typeof mviComputeSchema>;

export type MatchStatRow = MatchStatInput & { periodId: string; updatedAt: string };
export type PhysicalTestRow = { id: string; testedOn: string; speed30m: number | null; zigZag: number | null; verticalJump: number | null; bleepLevel: number | null; note: string | null };

/** Satu komponen indeks: skor 0 sampai 100 (null bila datanya belum ada), bobot, dan keterangan sumber datanya. */
export type MviComponentRow = { key: MviComponent; label: string; weight: number; score: number | null; detail: string };

/** Indeks satu siswa pada satu periode, untuk staf. */
export type MviResult = {
  period: { id: string; name: string };
  ageGroup: { id: string; name: string };
  mvi: number | null;
  category: MviCategory | null;
  coverage: number;
  components: MviComponentRow[];
  computedAt: string;
};

/** Yang dilihat orang tua: kategori anaknya saja, hanya untuk periode yang penilaiannya sudah terbit. */
export type MviGuardianResult = { period: { id: string; name: string }; category: MviCategory };

export type MviRankingRow = {
  playerId: string;
  fullName: string;
  position: Position | null;
  mvi: number | null;
  category: MviCategory | null;
  coverage: number;
  kurang: MviComponent[];
  computedAt: string | null;
};
/** Peringkat satu KU pada satu periode; siswa yang belum pernah dihitung muncul dengan `computedAt` kosong. */
export type MviRanking = { ageGroup: { id: string; name: string }; period: { id: string; name: string }; rows: MviRankingRow[] };

/** Jawaban `GET /players/:id/market-value`: staf menerima angka dan rincian, orang tua hanya kategori. */
export type MviPlayerView = { role: "staff"; items: MviResult[] } | { role: "guardian"; items: MviGuardianResult[] };

// ---- Berkas siswa ----
export const playerDocumentKindSchema = z.enum(["kartu_keluarga", "akta_kelahiran", "nisn", "raport"]);
export type PlayerDocumentKind = z.infer<typeof playerDocumentKindSchema>;
export const playerDocumentKindLabel: Record<PlayerDocumentKind, string> = {
  kartu_keluarga: "Kartu Keluarga",
  akta_kelahiran: "Akta Kelahiran",
  nisn: "NISN",
  raport: "Raport",
};
/** Batas ukuran satu berkas (PDF atau gambar) dan jumlah raport per siswa. */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const RAPORT_MAX = 12;
export const DOCUMENT_LABEL_MAX = 60;
export type PlayerDocument = {
  id: string;
  kind: PlayerDocumentKind;
  /** Keterangan; wajib untuk raport (mis. "Semester 1 2025/2026"). */
  label: string | null;
  originalName: string;
  mime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  uploadedAt: string;
};
