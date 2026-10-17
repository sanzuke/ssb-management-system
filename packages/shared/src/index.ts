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
  "master.read": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Melihat KU, periode, dan lokasi" },
  "master.write": { roles: ["admin_ssb"], desc: "Mengubah KU, periode, dan lokasi" },
  "player.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat pemain (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya)" },
  "player.write": { roles: ["admin_ssb"], desc: "Menambah dan mengubah pemain" },
  "attendance.record": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Mencatat absensi latihan" },
  "attendance.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat absensi (orang tua: anaknya)" },
  "assessment.write": { roles: ["admin_ssb", "pelatih"], desc: "Mengisi penilaian pemain" },
  "assessment.read": { roles: ["admin_ssb", "pelatih", "korlas", "orang_tua"], desc: "Melihat penilaian (orang tua: anaknya, setelah terbit)" },
  "session.manage": { roles: ["admin_ssb"], desc: "Menjadwalkan, mengubah, dan menghapus sesi latihan" },
  "guardian.sessions": { roles: ["admin_ssb", "orang_tua"], desc: "Portal orang tua: jadwal KU anak sendiri beserta status kehadiran anak, tanpa daftar pemain lain (admin tidak punya anak, jadi daftarnya kosong)" },
  "session.read": { roles: ["admin_ssb", "pelatih", "korlas"], desc: "Melihat jadwal sesi latihan (pelatih dan korlas: KU yang ditugaskan)" },
  "assignment.manage": { roles: ["admin_ssb"], desc: "Menugaskan pelatih dan korlas ke KU per periode" },
  "report.publish": { roles: ["admin_ssb", "korlas"], desc: "Menerbitkan rapor ke orang tua (wewenang korlas: menunggu keputusan)" },
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
  return [head, ...rows].join("\n") + "\n";
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
export const invitableRoleSchema = z.enum(["pelatih", "korlas", "orang_tua"]);

export const createInvitationSchema = z.object({
  role: invitableRoleSchema,
  label: z.string().trim().max(120).optional(),
  /** Untuk orang tua: pemain yang langsung dihubungkan. */
  playerId: z.uuid().optional(),
});

/** Menerima undangan dengan akun baru (email + kata sandi). Akun yang sudah login tidak perlu body. */
export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});

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
  /** SSB aktif pada sesi ini; kosong bila akun belum memilih SSB. */
  active: membershipSchema.nullable(),
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;

// ---- Data master ----

const nameField = z.string().trim().min(2, "minimal 2 karakter").max(80, "maksimal 80 karakter");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format tanggal YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), "tanggal tidak valid");

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
};
export type PlayerDetail = PlayerSummary & {
  history: { field: "age_group" | "status"; from: string | null; to: string | null; at: string }[];
  /** Hanya untuk admin SSB. */
  guardians?: { userId: string; name: string; relationship: string | null }[];
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
