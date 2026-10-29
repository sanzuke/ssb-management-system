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

/** Input pembuatan pemain. Skema lengkap menyusul bersama model data. */
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
    desc: "Melihat pemain (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya)",
  },
  "player.write": { roles: ["admin_ssb"], desc: "Menambah dan mengubah pemain" },
  "player.photo": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Mengunggah dan menghapus foto pemain (pelatih dan korlas: KU yang ditugaskan)" },
  "attendance.record": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Mencatat absensi latihan" },
  "attendance.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat absensi (orang tua: anaknya)" },
  "assessment.write": { roles: ["admin_ssb", "pelatih"], desc: "Mengisi penilaian pemain dan rencana pengembangannya" },
  "assessment.read": {
    roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"],
    desc: "Melihat penilaian dan rencana pengembangan (orang tua: anaknya, setelah terbit)",
  },
  "squad.read": {
    roles: ["admin_ssb", "pelatih", "korlas"],
    desc: "Melihat tabel skuad: rating, enam aspek, dan tren seluruh pemain yang boleh dilihat (pelatih dan korlas: KU yang ditugaskan), termasuk penilaian yang belum terbit",
  },
  "badge.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat lencana pemain (orang tua: anaknya)" },
  "badge.write": { roles: ["admin_ssb", "pelatih"], desc: "Memberi dan mencabut lencana pemain (pelatih: KU yang ditugaskan)" },
  "session.manage": { roles: ["admin_ssb"], desc: "Menjadwalkan, mengubah, dan menghapus sesi latihan" },
  "guardian.sessions": {
    roles: ["admin_ssb", "orang_tua"],
    desc: "Portal orang tua: jadwal KU anak sendiri beserta status kehadiran anak, tanpa daftar pemain lain (admin tidak punya anak, jadi daftarnya kosong)",
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
  /** Untuk orang tua: pemain yang langsung dihubungkan. */
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

// ---- Pemain ----

export const playerStatusSchema = z.enum(["aktif", "cuti", "keluar"]);
export type PlayerStatus = z.infer<typeof playerStatusSchema>;

const uuidStr = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "id tidak valid");
const today = () => new Date().toISOString().slice(0, 10);

/** Biodata pemain. Dipakai untuk membuat dan mengubah (ubah mengirim seluruh isian). */
export const playerFormSchema = z.object({
  fullName: z.string().trim().min(2, "minimal 2 karakter").max(120, "maksimal 120 karakter"),
  birthDate: isoDate.refine((d) => d <= today(), "tidak boleh di masa depan").refine((d) => d >= "1990-01-01", "terlalu lama"),
  position: positionSchema.nullable().optional(),
  school: z.string().trim().max(120, "maksimal 120 karakter").nullable().optional(),
  ageGroupId: uuidStr.nullable().optional(),
  status: playerStatusSchema.default("aktif"),
});
export type PlayerForm = z.input<typeof playerFormSchema>;

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
export type PlayerDetail = PlayerSummary & {
  history: { field: "age_group" | "status"; from: string | null; to: string | null; at: string }[];
  /** Hanya untuk admin SSB. */
  guardians?: { userId: string; name: string; relationship: string | null }[];
};
/** Ringkasan per pemain untuk tabel pemain: wali utama (hanya admin SSB) dan penilaian terakhir. */
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
    .min(1, "minimal satu pemain")
    .max(200, "maksimal 200 pemain per permintaan"),
});

export type TrainingSession = {
  id: string;
  sessionDate: string;
  startTime: string | null;
  ageGroup: { id: string; name: string };
  location: { id: string; name: string } | null;
  period: { id: string; name: string } | null;
  /** Ringkasan absensi: jumlah per status dan pemain aktif yang belum diisi. */
  attendance: { hadir: number; izin: number; sakit: number; alpa: number; belum: number };
};
export type AttendanceRoster = {
  session: TrainingSession;
  players: { playerId: string; fullName: string; memberNo: string | null; status: AttendanceStatus | null; note: string | null }[];
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
  /** hadir + izin + sakit + alpa: sesi yang absensinya tercatat untuk pemain ini. */
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

/** Satu baris tabel skuad: penilaian terbaru yang punya skor (termasuk draf) dan tren dari seluruh periode bernilai. Identitas pemain diambil dari `/players`. */
export type SquadRow = {
  playerId: string;
  /** Periode penilaian yang dipakai; null bila pemain belum punya penilaian bernilai. */
  periodName: string | null;
  overall: number | null;
  aspects: { aspect: AssessmentAspect; average: number }[];
  published: boolean;
  tren: Tren;
};
/** Rata-rata skor per aspek untuk satu periode, dari seluruh penilaian yang boleh dilihat peran pemanggil. */
export type AspectSummary = {
  period: { id: string; name: string; startDate: string };
  /** Jumlah penilaian (pemain) yang dihitung pada periode ini. */
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
/** Mengganti seluruh rencana satu pemain pada satu periode; daftar kosong menghapusnya. */
export const developmentPlanInputSchema = z.object({ items: z.array(developmentPlanItemInputSchema).max(8, "maksimal 8 butir") });
export type DevelopmentPlanInput = z.infer<typeof developmentPlanInputSchema>;
export type DevelopmentPlanItem = { id: string; aspect: AssessmentAspect | null; area: string; target: string | null; note: string | null };

// ---- SPP: tarif, tagihan, dan pembayaran ----

/** Tarif SPP per bulan (rupiah) tiap KU; null = belum diatur, pemain KU itu tidak ikut ditagih. */
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

/** Membuat tagihan satu bulan (YYYY-MM) untuk semua pemain aktif di KU yang punya tarif; yang sudah ditagih dilewati. */
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

/** Tarif SPP khusus satu pemain; menggantikan tarif KU. 0 = tidak ditagih. */
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
