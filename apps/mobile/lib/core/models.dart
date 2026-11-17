/// Model data sesuai bentuk JSON API (lihat `packages/shared/src/index.ts`).
/// Hanya field yang dipakai aplikasi yang dibaca.
library;

enum Role {
  adminSsb('admin_ssb', 'Admin SSB'),
  pelatih('pelatih', 'Pelatih'),
  korlas('korlas', 'Koordinator kelompok usia'),
  orangTua('orang_tua', 'Orang tua');

  const Role(this.wire, this.label);
  final String wire;
  final String label;

  static Role parse(String v) => Role.values.firstWhere((r) => r.wire == v, orElse: () => Role.orangTua);

  bool get isCoach => this == pelatih || this == korlas;
}

enum AttendanceStatus {
  hadir('hadir', 'Hadir'),
  izin('izin', 'Izin'),
  sakit('sakit', 'Sakit'),
  alpa('alpa', 'Alpa');

  const AttendanceStatus(this.wire, this.label);
  final String wire;
  final String label;

  static AttendanceStatus? parse(String? v) {
    for (final s in values) {
      if (s.wire == v) return s;
    }
    return null;
  }
}

class Membership {
  Membership({required this.ssbId, required this.userId, required this.ssbName, required this.role});

  factory Membership.fromJson(Map<String, dynamic> j) => Membership(
        ssbId: j['ssbId'] as String,
        userId: j['userId'] as String,
        ssbName: j['ssbName'] as String,
        role: Role.parse(j['role'] as String),
      );

  final String ssbId;
  final String userId;
  final String ssbName;
  final Role role;
}

class Me {
  Me({required this.name, required this.email, required this.whatsapp, required this.active, required this.memberships});

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        name: j['name'] as String,
        email: j['email'] as String,
        whatsapp: j['whatsapp'] as String?,
        active: j['active'] == null ? null : Membership.fromJson(j['active'] as Map<String, dynamic>),
        memberships: [for (final m in j['memberships'] as List) Membership.fromJson(m as Map<String, dynamic>)],
      );

  final String name;
  final String email;
  final String? whatsapp;
  final Membership? active;
  final List<Membership> memberships;
}

class NamedRef {
  NamedRef(this.id, this.name);

  static NamedRef? from(dynamic j) => j is Map ? NamedRef(j['id'] as String, j['name'] as String) : null;

  final String id;
  final String name;
}

class AttendanceCounts {
  AttendanceCounts({this.hadir = 0, this.izin = 0, this.sakit = 0, this.alpa = 0, this.belum = 0});

  factory AttendanceCounts.fromJson(Map<String, dynamic> j) => AttendanceCounts(
        hadir: j['hadir'] as int,
        izin: j['izin'] as int,
        sakit: j['sakit'] as int,
        alpa: j['alpa'] as int,
        belum: j['belum'] as int,
      );

  final int hadir, izin, sakit, alpa, belum;
}

class TrainingSession {
  TrainingSession({required this.id, required this.date, required this.startTime, required this.ageGroup, required this.location, required this.counts});

  factory TrainingSession.fromJson(Map<String, dynamic> j) => TrainingSession(
        id: j['id'] as String,
        date: j['sessionDate'] as String,
        startTime: _hm(j['startTime'] as String?),
        ageGroup: NamedRef.from(j['ageGroup'])!,
        location: NamedRef.from(j['location']),
        counts: AttendanceCounts.fromJson(j['attendance'] as Map<String, dynamic>),
      );

  final String id;
  final String date;
  final String? startTime;
  final NamedRef ageGroup;
  final NamedRef? location;
  final AttendanceCounts counts;
}

class RosterPlayer {
  RosterPlayer({required this.playerId, required this.fullName, required this.memberNo, required this.status, required this.note, required this.injured});

  factory RosterPlayer.fromJson(Map<String, dynamic> j) => RosterPlayer(
        playerId: j['playerId'] as String,
        fullName: j['fullName'] as String,
        memberNo: j['memberNo'] as String?,
        status: AttendanceStatus.parse(j['status'] as String?),
        note: j['note'] as String?,
        injured: j['injury'] != null,
      );

  final String playerId;
  final String fullName;
  final String? memberNo;
  final AttendanceStatus? status;
  final String? note;
  final bool injured;
}

class AttendanceRoster {
  AttendanceRoster({required this.session, required this.players});

  factory AttendanceRoster.fromJson(Map<String, dynamic> j) => AttendanceRoster(
        session: TrainingSession.fromJson(j['session'] as Map<String, dynamic>),
        players: [for (final p in j['players'] as List) RosterPlayer.fromJson(p as Map<String, dynamic>)],
      );

  final TrainingSession session;
  final List<RosterPlayer> players;
}

class PlayerSummary {
  PlayerSummary({required this.id, required this.fullName, required this.memberNo, required this.birthDate, required this.position, required this.ageGroup, required this.photoV});

  factory PlayerSummary.fromJson(Map<String, dynamic> j) => PlayerSummary(
        id: j['id'] as String,
        fullName: j['fullName'] as String,
        memberNo: j['memberNo'] as String?,
        birthDate: j['birthDate'] as String,
        position: j['position'] as String?,
        ageGroup: NamedRef.from(j['ageGroup']),
        photoV: j['photoV'] as String?,
      );

  final String id;
  final String fullName;
  final String? memberNo;
  final String birthDate;
  final String? position;
  final NamedRef? ageGroup;
  final String? photoV;
}

class GuardianSession {
  GuardianSession({required this.sessionId, required this.date, required this.startTime, required this.ageGroup, required this.location, required this.playerId, required this.playerName, required this.status});

  factory GuardianSession.fromJson(Map<String, dynamic> j) => GuardianSession(
        sessionId: j['sessionId'] as String,
        date: j['sessionDate'] as String,
        startTime: _hm(j['startTime'] as String?),
        ageGroup: NamedRef.from(j['ageGroup'])!,
        location: NamedRef.from(j['location']),
        playerId: j['playerId'] as String,
        playerName: j['playerName'] as String,
        status: AttendanceStatus.parse(j['status'] as String?),
      );

  final String sessionId;
  final String date;
  final String? startTime;
  final NamedRef ageGroup;
  final NamedRef? location;
  final String playerId;
  final String playerName;
  final AttendanceStatus? status;
}

class AttendanceRow {
  AttendanceRow({required this.playerId, required this.hadir, required this.recorded, required this.percent});

  factory AttendanceRow.fromJson(Map<String, dynamic> j) => AttendanceRow(
        playerId: j['playerId'] as String,
        hadir: j['hadir'] as int,
        recorded: j['recorded'] as int,
        percent: (j['percent'] as num?)?.toDouble(),
      );

  final String playerId;
  final int hadir;
  final int recorded;
  final double? percent;
}

class Invoice {
  Invoice({required this.id, required this.playerName, this.playerId = '', required this.month, required this.amount, required this.paid, required this.remaining, required this.dueOn, required this.status, required this.overdue});

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: j['id'] as String,
        playerName: (j['player'] as Map)['name'] as String,
        playerId: ((j['player'] as Map)['id'] as String?) ?? '',
        month: j['month'] as String,
        amount: (j['amount'] as num).toInt(),
        paid: (j['paid'] as num).toInt(),
        remaining: (j['remaining'] as num).toInt(),
        dueOn: j['dueOn'] as String,
        status: j['status'] as String,
        overdue: j['overdue'] as bool,
      );

  final String id;
  final String playerName;

  /// Id siswa penerima tagihan (untuk menyaring per anak); kosong bila data tidak membawanya.
  final String playerId;
  final String month;
  final int amount, paid, remaining;
  final String dueOn;

  /// belum | sebagian | lunas | dibatalkan
  final String status;
  final bool overdue;

  bool get open => status == 'belum' || status == 'sebagian';
}

/// "16:00:00" menjadi "16:00".
String? _hm(String? t) => t == null || t.length < 5 ? t : t.substring(0, 5);
