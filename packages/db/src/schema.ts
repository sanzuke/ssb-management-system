import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Role database yang dipakai aplikasi. Dibuat di luar migrasi (lihat docs),
 * jadi di sini hanya dirujuk. Role ini tidak boleh memiliki tabel dan
 * tidak boleh BYPASSRLS, sehingga RLS selalu berlaku.
 */
export const appRole = pgRole("ssb_app").existing();

export const userRole = pgEnum("user_role", ["admin_ssb", "pelatih", "korlas", "orang_tua"]);
export const playerStatus = pgEnum("player_status", ["aktif", "cuti", "keluar"]);
export const playerPosition = pgEnum("player_position", ["GK", "DF", "MF", "FW"]);
export const attendanceStatus = pgEnum("attendance_status", ["hadir", "izin", "sakit", "alpa"]);

/** Syarat tenant: baris hanya terlihat bila ssb_id sama dengan konteks transaksi. */
const tenantMatch = sql`ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid`;

/** Kebijakan RLS standar untuk tabel yang punya kolom ssb_id. */
const tenantPolicy = (table: string) =>
  pgPolicy(`${table}_tenant`, {
    as: "permissive",
    for: "all",
    to: appRole,
    using: tenantMatch,
    withCheck: tenantMatch,
  });

const ssbId = () => uuid("ssb_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** SSB (tenant). Tidak punya ssb_id; barisnya dibatasi lewat id. */
export const ssb = pgTable(
  "ssb",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    city: text("city"),
    province: text("province"),
    plan: text("plan").notNull().default("dasar"),
    createdAt: createdAt(),
  },
  () => [
    pgPolicy("ssb_tenant", {
      as: "permissive",
      for: "all",
      to: appRole,
      using: sql`id = nullif(current_setting('app.ssb_id', true), '')::uuid`,
      withCheck: sql`id = nullif(current_setting('app.ssb_id', true), '')::uuid`,
    }),
    // Anggota boleh membaca SSB tempat mereka menjadi anggota (untuk memilih SSB setelah login).
    pgPolicy("ssb_member_read", {
      as: "permissive",
      for: "select",
      to: appRole,
      using: sql`id in (select ssb_id from app_user where account_id = nullif(current_setting('app.account_id', true), '')::uuid)`,
    }),
  ],
).enableRLS();

/**
 * Akun global: satu orang satu akun, bisa menjadi anggota beberapa SSB.
 * Sengaja TANPA RLS karena dicari sebelum konteks tenant ada (login). Kode hanya
 * boleh mengaksesnya lewat id, email, atau google_sub, dan menampilkan data akun
 * lain hanya lewat join dengan app_user di dalam konteks tenant.
 */
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub").unique(),
    createdAt: createdAt(),
  },
  (t) => [check("account_has_credential", sql`${t.passwordHash} is not null or ${t.googleSub} is not null`)],
);

/** Keanggotaan akun di satu SSB: nama tampilan, kontak, dan role di SSB itu. */
export const appUser = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsapp: text("whatsapp"),
    role: userRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("app_user_ssb_account").on(t.ssbId, t.accountId),
    unique("app_user_ssb_id").on(t.ssbId, t.id),
    tenantPolicy("app_user"),
    // Akun boleh membaca daftar keanggotaannya sendiri lintas SSB.
    pgPolicy("app_user_own_memberships", {
      as: "permissive",
      for: "select",
      to: appRole,
      using: sql`account_id = nullif(current_setting('app.account_id', true), '')::uuid`,
    }),
  ],
).enableRLS();

/** KU: kelompok usia, misalnya KU-10. */
export const ageGroup = pgTable(
  "age_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minAge: integer("min_age").notNull(),
    maxAge: integer("max_age").notNull(),
  },
  (t) => [
    unique("age_group_ssb_name").on(t.ssbId, t.name),
    unique("age_group_ssb_id").on(t.ssbId, t.id),
    check("age_group_range", sql`${t.minAge} >= 0 AND ${t.maxAge} >= ${t.minAge}`),
    tenantPolicy("age_group"),
  ],
).enableRLS();

/** Periode: musim atau semester. */
export const period = pgTable(
  "period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
  },
  (t) => [
    unique("period_ssb_id").on(t.ssbId, t.id),
    unique("period_ssb_name").on(t.ssbId, t.name),
    check("period_dates", sql`${t.endDate} >= ${t.startDate}`),
    tenantPolicy("period"),
  ],
).enableRLS();

/** Lokasi latihan (lapangan). */
export const location = pgTable(
  "location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
  },
  (t) => [unique("location_ssb_name").on(t.ssbId, t.name), unique("location_ssb_id").on(t.ssbId, t.id), tenantPolicy("location")],
).enableRLS();

export const player = pgTable(
  "player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    memberNo: text("member_no"),
    fullName: text("full_name").notNull(),
    birthDate: date("birth_date").notNull(),
    position: playerPosition("position"),
    school: text("school"),
    photoKey: text("photo_key"),
    status: playerStatus("status").notNull().default("aktif"),
    ageGroupId: uuid("age_group_id"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("player_ssb_id").on(t.ssbId, t.id),
    unique("player_ssb_member_no").on(t.ssbId, t.memberNo),
    index("player_age_group_idx").on(t.ssbId, t.ageGroupId),
    // FK komposit: KU harus berasal dari SSB yang sama.
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "player_age_group_fk" }),
    tenantPolicy("player"),
  ],
).enableRLS();

/** Hubungan orang tua (pengguna ber-role orang_tua) dengan pemain. */
export const playerGuardian = pgTable(
  "player_guardian",
  {
    ssbId: ssbId(),
    playerId: uuid("player_id").notNull(),
    userId: uuid("user_id").notNull(),
    relationship: text("relationship"),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.userId] }),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "player_guardian_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.userId], foreignColumns: [appUser.ssbId, appUser.id], name: "player_guardian_user_fk" }).onDelete("cascade"),
    tenantPolicy("player_guardian"),
  ],
).enableRLS();

/** Penugasan pelatih atau korlas ke KU pada suatu periode. */
export const coachAssignment = pgTable(
  "coach_assignment",
  {
    ssbId: ssbId(),
    userId: uuid("user_id").notNull(),
    ageGroupId: uuid("age_group_id").notNull(),
    periodId: uuid("period_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.ageGroupId, t.periodId] }),
    foreignKey({ columns: [t.ssbId, t.userId], foreignColumns: [appUser.ssbId, appUser.id], name: "coach_assignment_user_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "coach_assignment_age_group_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.periodId], foreignColumns: [period.ssbId, period.id], name: "coach_assignment_period_fk" }).onDelete("cascade"),
    tenantPolicy("coach_assignment"),
  ],
).enableRLS();

export const trainingSession = pgTable(
  "training_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId(),
    ageGroupId: uuid("age_group_id").notNull(),
    periodId: uuid("period_id"),
    sessionDate: date("session_date").notNull(),
    startTime: time("start_time"),
    location: text("location"),
  },
  (t) => [
    unique("training_session_ssb_id").on(t.ssbId, t.id),
    index("training_session_group_date_idx").on(t.ssbId, t.ageGroupId, t.sessionDate),
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "training_session_age_group_fk" }),
    foreignKey({ columns: [t.ssbId, t.periodId], foreignColumns: [period.ssbId, period.id], name: "training_session_period_fk" }),
    tenantPolicy("training_session"),
  ],
).enableRLS();

export const attendance = pgTable(
  "attendance",
  {
    ssbId: ssbId(),
    sessionId: uuid("session_id").notNull(),
    playerId: uuid("player_id").notNull(),
    status: attendanceStatus("status").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.playerId] }),
    foreignKey({ columns: [t.ssbId, t.sessionId], foreignColumns: [trainingSession.ssbId, trainingSession.id], name: "attendance_session_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "attendance_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.recordedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "attendance_recorded_by_fk" }),
    index("attendance_player_idx").on(t.ssbId, t.playerId),
    tenantPolicy("attendance"),
  ],
).enableRLS();

/**
 * Direktori kode SSB (slug) ke id. Sengaja TANPA RLS: login butuh mencari tenant
 * sebelum konteks tenant ada. Isinya hanya pemetaan slug ke id, bukan data SSB.
 */
export const ssbDirectory = pgTable("ssb_directory", {
  slug: text("slug").primaryKey(),
  ssbId: uuid("ssb_id").notNull().unique().references(() => ssb.id, { onDelete: "cascade" }),
});

/**
 * Sesi login. Sengaja TANPA RLS: sesi dicari lewat hash token (acak, 256 bit) sebelum
 * konteks tenant diketahui. Hanya hash yang disimpan, token asli hanya ada di cookie.
 */
export const userSession = pgTable(
  "user_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    accountId: uuid("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
    // SSB aktif; kosong sampai akun yang punya beberapa SSB memilih salah satu.
    ssbId: uuid("ssb_id"),
    userId: uuid("user_id"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.ssbId, t.userId], foreignColumns: [appUser.ssbId, appUser.id], name: "user_session_user_fk" }).onDelete("cascade"),
    index("user_session_account_idx").on(t.accountId),
    check("user_session_membership_pair", sql`(${t.ssbId} is null) = (${t.userId} is null)`),
  ],
);

/**
 * Undangan bergabung ke SSB. Token = "<ssb_id>.<rahasia>"; hanya hash rahasia yang
 * disimpan. Awalan ssb_id memungkinkan konteks tenant diatur sebelum mencari undangan.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull().unique(),
    role: userRole("role").notNull(),
    /** Catatan admin, misalnya nama orang yang diundang. */
    label: text("label"),
    /** Untuk undangan orang tua: pemain yang langsung dihubungkan saat undangan diterima. */
    playerId: uuid("player_id"),
    createdBy: uuid("created_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "invitation_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "invitation_created_by_fk" }),
    tenantPolicy("invitation"),
  ],
).enableRLS();
