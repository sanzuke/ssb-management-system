/// Model dan logika murni untuk profil siswa, penilaian, rencana pengembangan, lencana, dan cedera.
/// Bentuk JSON mengikuti `packages/shared/src` (aspects, badges, injuries, index); aturan tren dan pita skor
/// sama dengan versi web agar angka di HP dan di web tidak berbeda.
library;

import 'dart:math' as math;

import 'models.dart';

const int scoreMin = 1;
const int scoreMax = 10;

/// Selisih minimum rata-rata agar tren dianggap naik atau turun (sama dengan `AMBANG_TREN` di web).
const double trendThreshold = 0.3;

enum Aspect {
  technical('technical', 'Teknik', 'TEK'),
  physical('physical', 'Fisik', 'FIS'),
  tactical('tactical', 'Taktik', 'TAK'),
  mental('mental', 'Mental', 'MEN'),
  movement('movement', 'Gerak', 'GER'),
  gameIntelligence('game_intelligence', 'Kecerdasan bermain', 'KEC');

  const Aspect(this.wire, this.label, this.short);
  final String wire;
  final String label;
  final String short;

  static Aspect? parse(String? v) {
    for (final a in values) {
      if (a.wire == v) return a;
    }
    return null;
  }
}

const Map<String, String> positionLabel = {'GK': 'Kiper', 'DF': 'Bek', 'MF': 'Gelandang', 'FW': 'Penyerang'};

/// Angka satu desimal dengan koma, tanpa ",0" untuk bilangan bulat: 7 -> "7", 7.3 -> "7,3".
String scoreText(num n) {
  final r = (n * 10).round() / 10;
  final s = r == r.roundToDouble() ? r.round().toString() : r.toStringAsFixed(1);
  return s.replaceAll('.', ',');
}

num round1(num n) => (n * 10).round() / 10;

/// Pita skor 1-10 (`pitaSkor` di web): kode 1 sampai 5 dan katanya. Skor desimal ikut pita yang memuatnya.
class ScoreBand {
  const ScoreBand(this.code, this.label);
  final int code;
  final String label;
}

ScoreBand scoreBand(num score) {
  if (score < 3) return const ScoreBand(1, 'Baru mulai');
  if (score < 5) return const ScoreBand(2, 'Berkembang');
  if (score < 7) return const ScoreBand(3, 'Cukup');
  if (score < 9) return const ScoreBand(4, 'Baik');
  return const ScoreBand(5, 'Menonjol');
}

class Period {
  Period({required this.id, required this.name, required this.startDate, required this.endDate});

  factory Period.fromJson(Map<String, dynamic> j) => Period(
        id: j['id'] as String,
        name: j['name'] as String,
        startDate: j['startDate'] as String,
        endDate: (j['endDate'] ?? j['startDate']) as String,
      );

  final String id;
  final String name;
  final String startDate;
  final String endDate;

  bool containsDay(String iso) => startDate.compareTo(iso) <= 0 && iso.compareTo(endDate) <= 0;
}

/// Periode awal untuk form: yang memuat hari ini, selain itu yang paling akhir.
Period? defaultPeriod(List<Period> periods, String todayIso) {
  if (periods.isEmpty) return null;
  final now = periods.where((p) => p.containsDay(todayIso)).firstOrNull;
  if (now != null) return now;
  final sorted = [...periods]..sort((a, b) => a.startDate.compareTo(b.startDate));
  return sorted.last;
}

/// Detail siswa (`GET /players/:id`): ringkasan ditambah data lengkap.
class PlayerDetail {
  PlayerDetail({
    required this.summary,
    required this.status,
    required this.school,
    required this.nisn,
    required this.birthPlace,
    required this.guardianName,
    required this.guardianWhatsapp,
    required this.heightCm,
    required this.weightKg,
    required this.medicalNote,
    required this.jerseyNo,
    required this.jerseySize,
    required this.shoeSize,
  });

  factory PlayerDetail.fromJson(Map<String, dynamic> j) => PlayerDetail(
        summary: PlayerSummary.fromJson(j),
        status: j['status'] as String? ?? 'aktif',
        school: j['school'] as String?,
        nisn: j['nisn'] as String?,
        birthPlace: j['birthPlace'] as String?,
        guardianName: j['guardianName'] as String?,
        guardianWhatsapp: j['guardianWhatsapp'] as String?,
        heightCm: (j['heightCm'] as num?)?.toInt(),
        weightKg: (j['weightKg'] as num?)?.toDouble(),
        medicalNote: j['medicalNote'] as String?,
        jerseyNo: (j['jerseyNo'] as num?)?.toInt(),
        jerseySize: j['jerseySize'] as String?,
        shoeSize: (j['shoeSize'] as num?)?.toInt(),
      );

  final PlayerSummary summary;
  final String status;
  final String? school, nisn, birthPlace, guardianName, guardianWhatsapp, medicalNote, jerseySize;
  final int? heightCm, jerseyNo, shoeSize;
  final double? weightKg;

  String get id => summary.id;
  String get fullName => summary.fullName;
}

const Map<String, String> playerStatusLabel = {'aktif': 'Aktif', 'cuti': 'Cuti', 'keluar': 'Keluar'};

class Indicator {
  Indicator({required this.id, required this.aspect, required this.name, required this.sortOrder, required this.active});

  factory Indicator.fromJson(Map<String, dynamic> j) => Indicator(
        id: j['id'] as String,
        aspect: Aspect.parse(j['aspect'] as String?) ?? Aspect.technical,
        name: j['name'] as String,
        sortOrder: (j['sortOrder'] as num?)?.toInt() ?? 0,
        active: j['active'] as bool? ?? true,
      );

  final String id;
  final Aspect aspect;
  final String name;
  final int sortOrder;
  final bool active;
}

class AssessmentScore {
  AssessmentScore({required this.indicatorId, required this.aspect, required this.name, required this.score});

  factory AssessmentScore.fromJson(Map<String, dynamic> j) => AssessmentScore(
        indicatorId: j['indicatorId'] as String,
        aspect: Aspect.parse(j['aspect'] as String?) ?? Aspect.technical,
        name: j['name'] as String,
        score: (j['score'] as num).toInt(),
      );

  final String indicatorId;
  final Aspect aspect;
  final String name;
  final int score;
}

class AspectAverage {
  AspectAverage(this.aspect, this.average);

  final Aspect aspect;
  final double average;
}

/// Satu penilaian siswa pada satu periode (`AssessmentView` di API).
class Assessment {
  Assessment({
    required this.id,
    required this.period,
    required this.assessedOn,
    required this.note,
    required this.assessor,
    required this.publishedAt,
    required this.scores,
    required this.aspects,
    required this.overall,
  });

  factory Assessment.fromJson(Map<String, dynamic> j) => Assessment(
        id: j['id'] as String,
        period: Period.fromJson(j['period'] as Map<String, dynamic>),
        assessedOn: j['assessedOn'] as String,
        note: j['note'] as String?,
        assessor: j['assessor'] as String?,
        publishedAt: j['publishedAt'] as String?,
        scores: [for (final s in j['scores'] as List) AssessmentScore.fromJson(s as Map<String, dynamic>)],
        aspects: [
          for (final a in j['aspects'] as List)
            if (Aspect.parse((a as Map)['aspect'] as String?) != null) AspectAverage(Aspect.parse(a['aspect'] as String?)!, (a['average'] as num).toDouble()),
        ],
        overall: (j['overall'] as num?)?.toDouble(),
      );

  final String id;
  final Period period;
  final String assessedOn;
  final String? note;
  final String? assessor;
  final String? publishedAt;
  final List<AssessmentScore> scores;
  final List<AspectAverage> aspects;
  final double? overall;

  bool get published => publishedAt != null;

  double? averageOf(Aspect a) => aspects.where((x) => x.aspect == a).firstOrNull?.average;

  List<AssessmentScore> scoresOf(Aspect a) => [for (final s in scores) if (s.aspect == a) s];
}

List<Assessment> parseAssessments(dynamic data) => [for (final e in data as List) Assessment.fromJson(e as Map<String, dynamic>)];

/// Urut dari periode terbaru ke tertua.
List<Assessment> newestFirst(List<Assessment> list) => [...list]..sort((a, b) => b.period.startDate.compareTo(a.period.startDate));

/// Penilaian yang tampil: pilihan pengguna, atau yang terbaru yang punya skor (lalu yang terbaru apa pun).
Assessment? pickAssessment(List<Assessment> list, String? periodId) {
  final sorted = newestFirst(list);
  return sorted.where((a) => a.period.id == periodId).firstOrNull ?? sorted.where((a) => a.overall != null).firstOrNull ?? sorted.firstOrNull;
}

/// Penilaian sebelum [cur] yang punya skor, sebagai pembanding radar dan selisih rata-rata.
Assessment? previousScored(List<Assessment> list, Assessment cur) {
  final sorted = newestFirst(list);
  final i = sorted.indexWhere((a) => a.period.id == cur.period.id);
  if (i < 0) return null;
  return sorted.skip(i + 1).where((a) => a.overall != null).firstOrNull;
}

/// Selisih rata-rata [cur] terhadap [prev], satu desimal; null bila salah satunya belum punya skor.
double? overallDelta(Assessment cur, Assessment? prev) {
  if (cur.overall == null || prev?.overall == null) return null;
  return round1(cur.overall! - prev!.overall!).toDouble();
}

enum TrendDirection { baru, naik, tetap, turun }

class Trend {
  const Trend(this.direction, this.delta);
  final TrendDirection direction;
  final double? delta;
}

/// Tren dari rating tiap periode (tertua ke terbaru): terbaru dibanding rata-rata maksimal dua periode sebelumnya.
Trend computeTrend(List<double> ratings) {
  if (ratings.length < 2) return const Trend(TrendDirection.baru, null);
  final latest = ratings.last;
  final before = ratings.sublist(math.max(0, ratings.length - 3), ratings.length - 1);
  final diff = round1(latest - before.reduce((a, b) => a + b) / before.length).toDouble();
  final dir = diff >= trendThreshold
      ? TrendDirection.naik
      : diff <= -trendThreshold
          ? TrendDirection.turun
          : TrendDirection.tetap;
  return Trend(dir, diff);
}

/// Tren sampai periode [selected]: rating periode bernilai yang dimulai pada atau sebelum periode itu.
Trend trendUpTo(List<Assessment> list, Assessment? selected) {
  final limit = selected?.period.startDate;
  final ratings = [
    for (final a in newestFirst(list).reversed)
      if (a.overall != null && (limit == null || a.period.startDate.compareTo(limit) <= 0)) a.overall!,
  ];
  return computeTrend(ratings);
}

/// Titik radar untuk aspek ke-[index] dari [count] aspek, skor [value] dari [scoreMax], jari-jari penuh [radius].
/// Aspek pertama di atas, searah jarum jam (sama dengan RadarAspek di web).
({double dx, double dy}) radarPoint(int index, int count, double value, double radius) {
  final angle = -math.pi / 2 + index * 2 * math.pi / count;
  final r = radius * value / scoreMax;
  return (dx: math.cos(angle) * r, dy: math.sin(angle) * r);
}

class PlanItem {
  PlanItem({required this.id, required this.aspect, required this.area, required this.target, required this.note});

  factory PlanItem.fromJson(Map<String, dynamic> j) => PlanItem(
        id: j['id'] as String? ?? '',
        aspect: Aspect.parse(j['aspect'] as String?),
        area: j['area'] as String,
        target: j['target'] as String?,
        note: j['note'] as String?,
      );

  final String id;
  final Aspect? aspect;
  final String area;
  final String? target;
  final String? note;
}

/// Jawaban `GET/PUT /players/:id/development-plan/:periodId` berbentuk `{items: [...]}`.
List<PlanItem> parsePlan(dynamic data) => [for (final e in (data as Map<String, dynamic>)['items'] as List) PlanItem.fromJson(e as Map<String, dynamic>)];

const int planMaxItems = 8;

/// Butir rencana yang sedang disunting (semua teks, bisa kosong).
class PlanDraft {
  const PlanDraft({this.aspect, this.area = '', this.target = '', this.note = ''});

  factory PlanDraft.fromItem(PlanItem i) => PlanDraft(aspect: i.aspect, area: i.area, target: i.target ?? '', note: i.note ?? '');

  /// Dari isi PUT yang tersimpan di antrean offline.
  factory PlanDraft.fromJson(Map<String, dynamic> j) => PlanDraft(
        aspect: Aspect.parse(j['aspect'] as String?),
        area: j['area'] as String? ?? '',
        target: j['target'] as String? ?? '',
        note: j['note'] as String? ?? '',
      );

  final Aspect? aspect;
  final String area;
  final String target;
  final String note;
}

/// Isi `PUT development-plan`: butir tanpa area dibuang, teks dipangkas, kosong menjadi null (sama dengan web).
Map<String, dynamic> planBody(List<PlanDraft> drafts) => {
      'items': [
        for (final d in drafts)
          if (d.area.trim().isNotEmpty)
            {
              'aspect': d.aspect?.wire,
              'area': d.area.trim(),
              'target': d.target.trim().isEmpty ? null : d.target.trim(),
              'note': d.note.trim().isEmpty ? null : d.note.trim(),
            },
      ],
    };

/// Membaca kembali draf rencana dari isi antrean offline; null bila bentuknya tidak dikenal.
List<PlanDraft>? planDraftsFromBody(Object? body) {
  if (body is! Map || body['items'] is! List) return null;
  return [for (final e in body['items'] as List) PlanDraft.fromJson(e as Map<String, dynamic>)];
}

/// Isi `PUT assessments/:periodId`: hanya indikator yang sudah diberi skor, urut sesuai [indicators]; catatan kosong menjadi null.
Map<String, dynamic> assessmentBody({required List<Indicator> indicators, required Map<String, int> scores, String? note}) => {
      'note': (note ?? '').trim().isEmpty ? null : note!.trim(),
      'scores': [
        for (final i in indicators)
          if (scores[i.id] != null) {'indicatorId': i.id, 'score': scores[i.id]},
      ],
    };

/// Skor dari isi antrean offline, `indicatorId -> skor`; null bila bentuknya tidak dikenal.
Map<String, int>? scoresFromBody(Object? body) {
  if (body is! Map || body['scores'] is! List) return null;
  return {
    for (final s in body['scores'] as List) (s as Map)['indicatorId'] as String: (s['score'] as num).toInt(),
  };
}

String? noteFromBody(Object? body) => body is Map ? body['note'] as String? : null;

/// Rata-rata skor yang sudah terisi untuk indikator di [indicators]; null bila belum ada.
double? runningAverage(List<Indicator> indicators, Map<String, int> scores) {
  final v = [for (final i in indicators) if (scores[i.id] != null) scores[i.id]!];
  if (v.isEmpty) return null;
  return round1(v.reduce((a, b) => a + b) / v.length).toDouble();
}

class HistoryRow {
  HistoryRow({required this.indicator, required this.from, required this.to, required this.by, required this.at});

  factory HistoryRow.fromJson(Map<String, dynamic> j) => HistoryRow(
        indicator: j['indicator'] as String,
        from: (j['from'] as num?)?.toInt(),
        to: (j['to'] as num).toInt(),
        by: j['by'] as String?,
        at: j['at'] as String,
      );

  final String indicator;
  final int? from;
  final int to;
  final String? by;
  final String at;
}

// ---- Lencana ----

enum BadgeGroup {
  teknik('Teknik'),
  fisik('Fisik'),
  mental('Mental'),
  sikap('Sikap');

  const BadgeGroup(this.label);
  final String label;
}

class BadgeDef {
  const BadgeDef(this.code, this.label, this.group);
  final String code;
  final String label;
  final BadgeGroup group;
}

/// Katalog lencana (`packages/shared/src/badges.ts`); server menolak kode di luar daftar ini.
const List<BadgeDef> badgeCatalog = [
  BadgeDef('kaki_kiri_kuat', 'Kaki kiri kuat', BadgeGroup.teknik),
  BadgeDef('kaki_kanan_kuat', 'Kaki kanan kuat', BadgeGroup.teknik),
  BadgeDef('dribel_lincah', 'Dribel lincah', BadgeGroup.teknik),
  BadgeDef('umpan_terobosan', 'Umpan terobosan', BadgeGroup.teknik),
  BadgeDef('penyelesaian_tenang', 'Penyelesaian tenang', BadgeGroup.teknik),
  BadgeDef('penjaga_gawang_tangguh', 'Penjaga gawang tangguh', BadgeGroup.teknik),
  BadgeDef('pelari_cepat', 'Pelari cepat', BadgeGroup.fisik),
  BadgeDef('stamina_tinggi', 'Stamina tinggi', BadgeGroup.fisik),
  BadgeDef('gesit', 'Gesit', BadgeGroup.fisik),
  BadgeDef('kuat_berduel', 'Kuat berduel', BadgeGroup.fisik),
  BadgeDef('pantang_menyerah', 'Pantang menyerah', BadgeGroup.mental),
  BadgeDef('pemimpin', 'Pemimpin', BadgeGroup.mental),
  BadgeDef('suka_membantu', 'Suka membantu teman', BadgeGroup.mental),
  BadgeDef('tenang_tertekan', 'Tenang saat tertekan', BadgeGroup.mental),
  BadgeDef('disiplin_latihan', 'Disiplin latihan', BadgeGroup.sikap),
  BadgeDef('cepat_belajar', 'Cepat belajar', BadgeGroup.sikap),
  BadgeDef('sportif', 'Sportif', BadgeGroup.sikap),
];

/// Paling banyak lencana aktif per siswa.
const int badgeMax = 5;

BadgeDef? badgeDef(String code) => badgeCatalog.where((b) => b.code == code).firstOrNull;

class PlayerBadge {
  PlayerBadge({required this.id, required this.code, required this.awardedAt, required this.awardedBy});

  factory PlayerBadge.fromJson(Map<String, dynamic> j) => PlayerBadge(
        id: j['id'] as String,
        code: j['badge'] as String,
        awardedAt: j['awardedAt'] as String,
        awardedBy: j['awardedBy'] as String?,
      );

  final String id;
  final String code;
  final String awardedAt;
  final String? awardedBy;

  String get label => badgeDef(code)?.label ?? code;
  BadgeGroup? get group => badgeDef(code)?.group;
}

// ---- Cedera ----

/// Bagian tubuh untuk catatan cedera (`packages/shared/src/injuries.ts`).
const List<({String code, String label})> bodyParts = [
  (code: 'kepala', label: 'Kepala'),
  (code: 'leher', label: 'Leher'),
  (code: 'bahu', label: 'Bahu'),
  (code: 'lengan', label: 'Lengan atau siku'),
  (code: 'tangan', label: 'Pergelangan atau tangan'),
  (code: 'punggung', label: 'Punggung'),
  (code: 'perut', label: 'Dada atau perut'),
  (code: 'pinggul', label: 'Pinggul atau selangkangan'),
  (code: 'paha', label: 'Paha'),
  (code: 'lutut', label: 'Lutut'),
  (code: 'betis', label: 'Betis atau tulang kering'),
  (code: 'pergelangan_kaki', label: 'Pergelangan kaki'),
  (code: 'kaki', label: 'Telapak kaki atau jari'),
  (code: 'lainnya', label: 'Lainnya'),
];

String bodyPartLabel(String code) => bodyParts.where((b) => b.code == code).firstOrNull?.label ?? code;

const int injuryNoteMax = 500;

class PlayerInjury {
  PlayerInjury({required this.id, required this.bodyPart, required this.startedOn, required this.expectedReturnOn, required this.recoveredOn, required this.note, required this.recordedBy});

  factory PlayerInjury.fromJson(Map<String, dynamic> j) => PlayerInjury(
        id: j['id'] as String,
        bodyPart: j['bodyPart'] as String,
        startedOn: j['startedOn'] as String,
        expectedReturnOn: j['expectedReturnOn'] as String?,
        recoveredOn: j['recoveredOn'] as String?,
        note: j['note'] as String?,
        recordedBy: j['recordedBy'] as String?,
      );

  final String id;
  final String bodyPart;
  final String startedOn;
  final String? expectedReturnOn;
  final String? recoveredOn;
  final String? note;
  final String? recordedBy;

  bool get ongoing => recoveredOn == null;
}

List<PlayerInjury> parseInjuries(dynamic data) => [for (final e in data as List) PlayerInjury.fromJson(e as Map<String, dynamic>)];

/// Isi `POST injuries`: kolom kosong menjadi null.
Map<String, dynamic> injuryCreateBody({required String bodyPart, required String startedOn, String? expectedReturnOn, String? note}) => {
      'bodyPart': bodyPart,
      'startedOn': startedOn,
      'expectedReturnOn': (expectedReturnOn ?? '').isEmpty ? null : expectedReturnOn,
      'note': (note ?? '').trim().isEmpty ? null : note!.trim(),
    };

/// Isi `PATCH injuries/:id`: hanya perkiraan pulih dan catatan yang boleh berubah; kosong menghapusnya.
Map<String, dynamic> injuryUpdateBody({String? expectedReturnOn, String? note}) => {
      'expectedReturnOn': (expectedReturnOn ?? '').isEmpty ? null : expectedReturnOn,
      'note': (note ?? '').trim().isEmpty ? null : note!.trim(),
    };

// ---- Indeks nilai (market-value) ----

class MviComponentRow {
  MviComponentRow({required this.label, required this.weight, required this.score, required this.detail});

  factory MviComponentRow.fromJson(Map<String, dynamic> j) => MviComponentRow(
        label: j['label'] as String,
        weight: (j['weight'] as num).toInt(),
        score: (j['score'] as num?)?.toDouble(),
        detail: j['detail'] as String? ?? '',
      );

  final String label;
  final int weight;
  final double? score;
  final String detail;
}

/// Indeks satu periode. Staf mendapat angka dan rincian; orang tua hanya [category].
class MviItem {
  MviItem({required this.periodName, required this.ageGroupName, required this.mvi, required this.category, required this.coverage, required this.components});

  factory MviItem.fromJson(Map<String, dynamic> j) => MviItem(
        periodName: (j['period'] as Map)['name'] as String,
        ageGroupName: j['ageGroup'] is Map ? (j['ageGroup'] as Map)['name'] as String : null,
        mvi: (j['mvi'] as num?)?.toDouble(),
        category: j['category'] as String?,
        coverage: (j['coverage'] as num?)?.toInt(),
        components: [for (final c in (j['components'] as List? ?? const [])) MviComponentRow.fromJson(c as Map<String, dynamic>)],
      );

  final String periodName;
  final String? ageGroupName;
  final double? mvi;
  final String? category;
  final int? coverage;
  final List<MviComponentRow> components;
}

class MviView {
  MviView({required this.staff, required this.items});

  /// Jawaban `GET /players/:id/market-value`: `{role: "staff"|"guardian", items}`.
  factory MviView.fromJson(Map<String, dynamic> j) => MviView(
        staff: j['role'] == 'staff',
        items: [for (final e in j['items'] as List) MviItem.fromJson(e as Map<String, dynamic>)],
      );

  final bool staff;
  final List<MviItem> items;
}

/// Ringkasan penilaian terakhir tiap siswa (`GET /players-overview`), untuk chip rating di daftar.
class PlayerOverview {
  PlayerOverview({required this.playerId, required this.overall, required this.periodName, required this.published});

  static PlayerOverview? fromJson(Map<String, dynamic> j) {
    final a = j['latestAssessment'];
    if (a is! Map) return null;
    return PlayerOverview(
      playerId: j['playerId'] as String,
      overall: (a['overall'] as num?)?.toDouble(),
      periodName: a['periodName'] as String,
      published: a['published'] as bool? ?? false,
    );
  }

  final String playerId;
  final double? overall;
  final String periodName;
  final bool published;
}

/// Nama berkas rapor PDF: huruf dan angka saja, dipisah "-" (sama dengan nama yang dibuat server).
String reportFileName(String playerName, String periodName) {
  final slug = '$playerName-$periodName'.replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '-').replaceAll(RegExp(r'^-+|-+$'), '');
  return 'rapor-$slug.pdf';
}
