import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
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
export const assessmentAspect = pgEnum("assessment_aspect", ["technical", "physical", "tactical", "mental", "movement", "game_intelligence"]);
export const attendanceStatus = pgEnum("attendance_status", ["hadir", "izin", "sakit", "alpa"]);
export const paymentMethod = pgEnum("payment_method", ["tunai", "transfer", "lainnya"]);

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
    /** Penghitung nomor anggota pemain; dinaikkan atomik saat pemain dibuat. */
    memberSeq: integer("member_seq").notNull().default(0),
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
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
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
    /** Tarif SPP per bulan dalam rupiah; kosong = belum diatur (pemain di KU ini tidak ikut ditagih). */
    monthlyFee: integer("monthly_fee"),
  },
  (t) => [
    unique("age_group_ssb_name").on(t.ssbId, t.name),
    check("age_group_fee", sql`${t.monthlyFee} is null or ${t.monthlyFee} >= 0`),
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

/** Riwayat perubahan KU dan status pemain. Nilai disimpan sebagai label yang terbaca saat itu. */
export const playerHistory = pgTable(
  "player_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId(),
    playerId: uuid("player_id").notNull(),
    field: text("field").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("player_history_player_idx").on(t.ssbId, t.playerId, t.changedAt),
    check("player_history_field", sql`${t.field} in ('age_group', 'status')`),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "player_history_player_fk" }).onDelete("cascade"),
    tenantPolicy("player_history"),
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
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    ageGroupId: uuid("age_group_id").notNull(),
    periodId: uuid("period_id"),
    sessionDate: date("session_date").notNull(),
    startTime: time("start_time"),
    locationId: uuid("location_id"),
  },
  (t) => [
    unique("training_session_ssb_id").on(t.ssbId, t.id),
    index("training_session_group_date_idx").on(t.ssbId, t.ageGroupId, t.sessionDate),
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "training_session_age_group_fk" }),
    foreignKey({ columns: [t.ssbId, t.periodId], foreignColumns: [period.ssbId, period.id], name: "training_session_period_fk" }),
    foreignKey({ columns: [t.ssbId, t.locationId], foreignColumns: [location.ssbId, location.id], name: "training_session_location_fk" }),
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
    foreignKey({ columns: [t.ssbId, t.sessionId], foreignColumns: [trainingSession.ssbId, trainingSession.id], name: "attendance_session_fk" }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "attendance_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.recordedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "attendance_recorded_by_fk" }),
    index("attendance_player_idx").on(t.ssbId, t.playerId),
    tenantPolicy("attendance"),
  ],
).enableRLS();

/** Indikator penilaian per KU. Dinonaktifkan (bukan dihapus) bila sudah dipakai skor, agar riwayat tetap utuh. */
export const assessmentIndicator = pgTable(
  "assessment_indicator",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    ageGroupId: uuid("age_group_id").notNull(),
    aspect: assessmentAspect("aspect").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    unique("assessment_indicator_ssb_id").on(t.ssbId, t.id),
    unique("assessment_indicator_group_name").on(t.ssbId, t.ageGroupId, t.name),
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "assessment_indicator_age_group_fk" }),
    tenantPolicy("assessment_indicator"),
  ],
).enableRLS();

/** Satu penilaian per pemain per periode (skala 1 sampai 10). KU dicatat saat dinilai karena pemain bisa pindah KU. */
export const assessment = pgTable(
  "assessment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    periodId: uuid("period_id").notNull(),
    ageGroupId: uuid("age_group_id").notNull(),
    assessedOn: date("assessed_on").notNull(),
    note: text("note"),
    assessorId: uuid("assessor_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assessment_ssb_id").on(t.ssbId, t.id),
    unique("assessment_player_period").on(t.ssbId, t.playerId, t.periodId),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "assessment_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.periodId], foreignColumns: [period.ssbId, period.id], name: "assessment_period_fk" }),
    foreignKey({ columns: [t.ssbId, t.ageGroupId], foreignColumns: [ageGroup.ssbId, ageGroup.id], name: "assessment_age_group_fk" }),
    foreignKey({ columns: [t.ssbId, t.assessorId], foreignColumns: [appUser.ssbId, appUser.id], name: "assessment_assessor_fk" }),
    tenantPolicy("assessment"),
  ],
).enableRLS();

export const assessmentScore = pgTable(
  "assessment_score",
  {
    ssbId: ssbId(),
    assessmentId: uuid("assessment_id").notNull(),
    indicatorId: uuid("indicator_id").notNull(),
    score: smallint("score").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.assessmentId, t.indicatorId] }),
    check("assessment_score_range", sql`${t.score} between 1 and 10`),
    foreignKey({ columns: [t.ssbId, t.assessmentId], foreignColumns: [assessment.ssbId, assessment.id], name: "assessment_score_assessment_fk" }).onDelete(
      "cascade",
    ),
    foreignKey({
      columns: [t.ssbId, t.indicatorId],
      foreignColumns: [assessmentIndicator.ssbId, assessmentIndicator.id],
      name: "assessment_score_indicator_fk",
    }),
    tenantPolicy("assessment_score"),
  ],
).enableRLS();

/** Jejak perubahan skor: siapa, kapan, nilai lama dan baru. Hanya ditambah, tidak diubah. */
export const assessmentScoreLog = pgTable(
  "assessment_score_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id").notNull(),
    indicatorId: uuid("indicator_id").notNull(),
    oldScore: smallint("old_score"),
    newScore: smallint("new_score").notNull(),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.ssbId, t.assessmentId], foreignColumns: [assessment.ssbId, assessment.id], name: "assessment_score_log_assessment_fk" }).onDelete(
      "cascade",
    ),
    foreignKey({
      columns: [t.ssbId, t.indicatorId],
      foreignColumns: [assessmentIndicator.ssbId, assessmentIndicator.id],
      name: "assessment_score_log_indicator_fk",
    }),
    foreignKey({ columns: [t.ssbId, t.changedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "assessment_score_log_changed_by_fk" }),
    index("assessment_score_log_assessment_idx").on(t.ssbId, t.assessmentId, t.changedAt),
    tenantPolicy("assessment_score_log"),
  ],
).enableRLS();

/**
 * Direktori kode SSB (slug) ke id. Sengaja TANPA RLS: login butuh mencari tenant
 * sebelum konteks tenant ada. Isinya hanya pemetaan slug ke id, bukan data SSB.
 */
export const ssbDirectory = pgTable("ssb_directory", {
  slug: text("slug").primaryKey(),
  ssbId: uuid("ssb_id")
    .notNull()
    .unique()
    .references(() => ssb.id, { onDelete: "cascade" }),
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
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
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
 * Pengaturan SPP milik satu SSB. Satu baris per SSB; dibuat otomatis saat
 * admin pertama kali menyimpan pengaturan. Menyimpan tanggal jatuh tempo
 * bawaan, templat pesan pengingat, info rekening, dan jeda antar pengingat.
 */
export const feeSetting = pgTable(
  "fee_setting",
  {
    ssbId: uuid("ssb_id")
      .primaryKey()
      .references(() => ssb.id, { onDelete: "cascade" }),
    /** Tanggal jatuh tempo bawaan untuk tagihan baru (1-28). */
    dueDay: integer("due_day").notNull().default(10),
    /** Templat pesan pengingat; kata kunci {wali} {anak} {bulan} {sisa} {status} {ssb} diisi sistem. */
    reminderTemplate: text("reminder_template").notNull(),
    /** Info rekening untuk orang tua (kirim pembayaran ke mana). */
    bankInfo: text("bank_info"),
    /** Jeda minimal antar pengingat untuk tagihan yang sama, dalam hari. 0 = boleh setiap hari. */
    reminderIntervalDays: integer("reminder_interval_days").notNull().default(7),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("fee_setting_due_day", sql`${t.dueDay} between 1 and 28`),
    check("fee_setting_interval", sql`${t.reminderIntervalDays} between 0 and 90`),
    tenantPolicy("fee_setting"),
  ],
).enableRLS();

/**
 * Tarif SPP khusus untuk satu pemain (keringanan, saudara kandung, dan sejenisnya).
 * Bila baris ini ada, tarifnya menggantikan tarif KU; 0 berarti pemain itu tidak ditagih.
 */
export const playerFeeOverride = pgTable(
  "player_fee_override",
  {
    ssbId: ssbId(),
    playerId: uuid("player_id").notNull(),
    /** Rupiah per bulan; 0 = tidak ditagih. */
    monthlyFee: integer("monthly_fee").notNull(),
    /** Alasan keringanan, mis. "saudara kandung". */
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ssbId, t.playerId] }),
    check("player_fee_override_amount", sql`${t.monthlyFee} >= 0`),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "player_fee_override_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "player_fee_override_created_by_fk" }).onDelete(
      "set null",
    ),
    tenantPolicy("player_fee_override"),
  ],
).enableRLS();

/**
 * Pengaturan pengiriman WhatsApp milik satu SSB. Satu baris per SSB; dibuat
 * otomatis saat admin menyimpan. Token API Fonnte disimpan terenkripsi, jadi
 * hanya bisa dibaca server dan tidak pernah dikembalikan ke peramban.
 */
export const whatsappSetting = pgTable(
  "whatsapp_setting",
  {
    ssbId: uuid("ssb_id")
      .primaryKey()
      .references(() => ssb.id, { onDelete: "cascade" }),
    /** Token API Fonnte dalam bentuk terenkripsi (base64). Null = pengiriman otomatis belum aktif. */
    tokenEncrypted: text("token_encrypted"),
    /** Kode negara untuk normalisasi nomor tujuan; default Indonesia (62). */
    countryCode: text("country_code").notNull().default("62"),
    /** Aktifkan pengiriman pengingat tagihan otomatis lewat Fonnte. */
    autoReminder: boolean("auto_reminder").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("whatsapp_setting_country_code", sql`${t.countryCode} ~ '^[0-9]{1,4}$'`), tenantPolicy("whatsapp_setting")],
).enableRLS();

/** Tagihan SPP satu pemain untuk satu bulan. Jumlah terbayar dihitung dari tabel payment; tagihan dibatalkan lewat voided_at. */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    /** Selalu tanggal 1 bulan yang ditagih. */
    month: date("month").notNull(),
    /** Rupiah, tarif KU atau tarif khusus pemain saat tagihan dibuat (perubahan tarif tidak mengubah tagihan lama). */
    amount: integer("amount").notNull(),
    dueOn: date("due_on").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    /** Terakhir kali admin mengirim pengingat tagihan ini (dicatat saat tombol kirim ditekan) dan jumlahnya. */
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    reminderCount: integer("reminder_count").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("invoice_ssb_id").on(t.ssbId, t.id),
    // Tagihan batal tidak menghalangi tagihan baru untuk pemain dan bulan yang sama.
    uniqueIndex("invoice_player_month").on(t.ssbId, t.playerId, t.month).where(sql`voided_at is null`),
    check("invoice_amount", sql`${t.amount} > 0`),
    check("invoice_month_first_day", sql`extract(day from ${t.month}) = 1`),
    index("invoice_month_idx").on(t.ssbId, t.month),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "invoice_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "invoice_created_by_fk" }).onDelete("set null"),
    tenantPolicy("invoice"),
  ],
).enableRLS();

/** Pembayaran yang dicatat admin terhadap satu tagihan; boleh dicicil. */
export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    method: paymentMethod("method").notNull().default("tunai"),
    note: text("note"),
    recordedBy: uuid("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    check("payment_amount", sql`${t.amount} > 0`),
    index("payment_invoice_idx").on(t.ssbId, t.invoiceId),
    foreignKey({ columns: [t.ssbId, t.invoiceId], foreignColumns: [invoice.ssbId, invoice.id], name: "payment_invoice_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.recordedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "payment_recorded_by_fk" }).onDelete("set null"),
    tenantPolicy("payment"),
  ],
).enableRLS();

/**
 * Tautan reset kata sandi, sekali pakai dan berumur pendek. Hanya hash token yang disimpan.
 * Dibuat oleh akun itu sendiri (lupa kata sandi, dikirim lewat email) atau oleh admin SSB (diberikan manual).
 */
export const passwordReset = pgTable(
  "password_reset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Akun admin yang membuat tautan; kosong bila diminta sendiri lewat email. */
    issuedBy: uuid("issued_by").references(() => account.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_account_idx").on(t.accountId)],
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
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "invitation_created_by_fk" }).onDelete("set null"),
    tenantPolicy("invitation"),
  ],
).enableRLS();

/** Rencana pengembangan: area yang dilatih lebih lanjut untuk satu pemain pada satu periode (dibaca orang tua setelah penilaian periode itu terbit). */
export const developmentPlanItem = pgTable(
  "development_plan_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    periodId: uuid("period_id").notNull(),
    aspect: assessmentAspect("aspect"),
    area: text("area").notNull(),
    target: text("target"),
    note: text("note"),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("development_plan_item_ssb_id").on(t.ssbId, t.id),
    index("development_plan_item_player_period_idx").on(t.ssbId, t.playerId, t.periodId, t.sortOrder),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "development_plan_item_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.periodId], foreignColumns: [period.ssbId, period.id], name: "development_plan_item_period_fk" }),
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "development_plan_item_created_by_fk" }),
    tenantPolicy("development_plan_item"),
  ],
).enableRLS();

/**
 * Lencana pemain: label perilaku positif dari katalog di packages/shared (`badgeCatalog`), diberikan pelatih dan bisa dicabut.
 * Pencabutan hanya menandai `revoked_at` supaya riwayat tetap ada; satu lencana aktif per pemain dijaga indeks unik parsial.
 * Batas lencana aktif per pemain (BADGE_MAX) ditegakkan di API. `awarded_by` dan `revoked_by` memakai
 * `ON DELETE SET NULL (kolom)` yang ditulis manual di migrasi (lihat 0013).
 */
export const playerBadge = pgTable(
  "player_badge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    badge: text("badge").notNull(),
    awardedBy: uuid("awarded_by"),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid("revoked_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    unique("player_badge_ssb_id").on(t.ssbId, t.id),
    uniqueIndex("player_badge_active").on(t.ssbId, t.playerId, t.badge).where(sql`revoked_at is null`),
    foreignKey({ columns: [t.ssbId, t.playerId], foreignColumns: [player.ssbId, player.id], name: "player_badge_player_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.ssbId, t.awardedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "player_badge_awarded_by_fk" }),
    foreignKey({ columns: [t.ssbId, t.revokedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "player_badge_revoked_by_fk" }),
    tenantPolicy("player_badge"),
  ],
).enableRLS();

/**
 * Konten landing page akademi: satu baris per SSB. `draft` disunting admin di SSB MS;
 * `published` adalah salinan yang dibaca landing lewat API publik (kosong = belum terbit).
 * Bentuknya didefinisikan oleh `siteContentSchema` di packages/shared.
 */
export const siteContent = pgTable(
  "site_content",
  {
    ssbId: ssbId()
      .primaryKey()
      .references(() => ssb.id, { onDelete: "cascade" }),
    draft: jsonb("draft").notNull(),
    published: jsonb("published"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.ssbId, t.publishedBy], foreignColumns: [appUser.ssbId, appUser.id], name: "site_content_published_by_fk" }).onDelete("set null"),
    check("site_content_published_pair", sql`(${t.published} is null) = (${t.publishedAt} is null)`),
    tenantPolicy("site_content"),
  ],
).enableRLS();

/** Pendaftaran trial dari landing page, ditulis tanpa sesi (tenant dari kode SSB) dan dibaca admin di kotak masuk Pendaftar. */
export const trialRegistration = pgTable(
  "trial_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    /** Kode yang ditunjukkan ke pendaftar, mis. TRL-7K2M9Q; unik per SSB. */
    code: text("code").notNull(),
    childName: text("child_name").notNull(),
    birthDate: date("birth_date").notNull(),
    gender: text("gender").notNull(),
    programId: text("program_id"),
    parentName: text("parent_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    preferredSession: text("preferred_session"),
    applyScholarship: boolean("apply_scholarship").notNull().default(false),
    notes: text("notes"),
    status: text("status").notNull().default("baru"),
    adminNote: text("admin_note"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("trial_registration_ssb_code").on(t.ssbId, t.code),
    index("trial_registration_status_idx").on(t.ssbId, t.status, t.createdAt),
    check("trial_registration_status", sql`${t.status} in ('baru', 'dihubungi', 'diterima', 'ditolak')`),
    check("trial_registration_gender", sql`${t.gender} in ('Putra', 'Putri')`),
    tenantPolicy("trial_registration"),
  ],
).enableRLS();

/** Gambar artikel (sampul dan gambar di dalam isi). Berkas ada di penyimpanan upload; dibaca publik lewat kode SSB. */
export const siteMedia = pgTable(
  "site_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    /** Kunci berkas di penyimpanan upload: <ssb>/artikel/<id>.<ekstensi>. */
    fileKey: text("file_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("site_media_ssb_id").on(t.ssbId, t.id),
    foreignKey({ columns: [t.ssbId, t.createdBy], foreignColumns: [appUser.ssbId, appUser.id], name: "site_media_created_by_fk" }).onDelete("set null"),
    tenantPolicy("site_media"),
  ],
).enableRLS();

/** Artikel atau berita di landing page. Teks dua bahasa (Indonesia wajib, English opsional); isi berupa Markdown sederhana. */
export const sitePost = pgTable(
  "site_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ssbId: ssbId().references(() => ssb.id, { onDelete: "cascade" }),
    /** Alamat artikel (/berita/<slug>), unik per SSB. */
    slug: text("slug").notNull(),
    titleId: text("title_id").notNull(),
    titleEn: text("title_en"),
    excerptId: text("excerpt_id").notNull().default(""),
    excerptEn: text("excerpt_en"),
    bodyId: text("body_id").notNull(),
    bodyEn: text("body_en"),
    category: text("category").notNull().default(""),
    coverMediaId: uuid("cover_media_id"),
    coverAlt: text("cover_alt").notNull().default(""),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: uuid("author_id"),
    /** Nama penulis saat artikel dibuat, supaya tetap tampil walau anggotanya kemudian dikeluarkan. */
    authorName: text("author_name").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("site_post_ssb_slug").on(t.ssbId, t.slug),
    index("site_post_list_idx").on(t.ssbId, t.status, t.publishedAt),
    foreignKey({ columns: [t.ssbId, t.coverMediaId], foreignColumns: [siteMedia.ssbId, siteMedia.id], name: "site_post_cover_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.ssbId, t.authorId], foreignColumns: [appUser.ssbId, appUser.id], name: "site_post_author_fk" }).onDelete("set null"),
    check("site_post_status", sql`${t.status} in ('draft', 'published')`),
    check("site_post_published_pair", sql`(${t.status} = 'published') = (${t.publishedAt} is not null)`),
    tenantPolicy("site_post"),
  ],
).enableRLS();
