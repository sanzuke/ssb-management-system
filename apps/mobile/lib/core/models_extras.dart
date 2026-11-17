/// Model untuk fitur tambahan (kalender, donasi, berkas, izin, kartu QR, tagihan).
/// Bentuk JSON mengikuti `packages/shared/src/index.ts`; hanya field yang dipakai aplikasi yang dibaca.
library;

import 'models.dart';

String? _hm(String? t) => t == null || t.length < 5 ? t : t.substring(0, 5);

// ---- Kalender ----

enum CalendarEventType {
  pertandingan('pertandingan', 'Pertandingan'),
  latihan('latihan', 'Latihan khusus'),
  acara('acara', 'Acara'),
  libur('libur', 'Libur'),
  lainnya('lainnya', 'Lainnya');

  const CalendarEventType(this.wire, this.label);
  final String wire;
  final String label;

  static CalendarEventType parse(String? v) => values.firstWhere((t) => t.wire == v, orElse: () => lainnya);
}

class CalendarEvent {
  CalendarEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.type,
    required this.startDate,
    required this.endDate,
    required this.startTime,
    required this.endTime,
    required this.location,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> j) => CalendarEvent(
        id: j['id'] as String,
        title: j['title'] as String,
        description: (j['description'] as String?) ?? '',
        type: CalendarEventType.parse(j['eventType'] as String?),
        startDate: j['startDate'] as String,
        endDate: j['endDate'] as String?,
        startTime: _hm(j['startTime'] as String?),
        endTime: _hm(j['endTime'] as String?),
        location: (j['location'] as String?) ?? '',
      );

  final String id;
  final String title;
  final String description;
  final CalendarEventType type;
  final String startDate;
  final String? endDate;
  final String? startTime;
  final String? endTime;
  final String location;

  bool get multiDay => endDate != null && endDate != startDate;
}

/// Kegiatan yang mulai sebelum awal bulan ditaruh di hari pertama bulan itu (seperti web),
/// lalu dikelompokkan per tanggal. [monthStart] berbentuk `YYYY-MM-01`.
List<MapEntry<String, List<CalendarEvent>>> groupCalendarByDay(List<CalendarEvent> events, String monthStart) {
  final out = <MapEntry<String, List<CalendarEvent>>>[];
  for (final e in events) {
    final date = e.startDate.compareTo(monthStart) < 0 ? monthStart : e.startDate;
    if (out.isNotEmpty && out.last.key == date) {
      out.last.value.add(e);
    } else {
      out.add(MapEntry(date, [e]));
    }
  }
  return out;
}

// ---- Donasi ----

enum PledgeKind {
  donasi('donasi', 'Donasi'),
  sponsor('sponsor', 'Sponsor');

  const PledgeKind(this.wire, this.label);
  final String wire;
  final String label;

  static PledgeKind parse(String? v) => values.firstWhere((k) => k.wire == v, orElse: () => donasi);
}

class Campaign {
  Campaign({
    required this.id,
    required this.title,
    required this.description,
    required this.eventTitle,
    required this.eventDate,
    required this.target,
    required this.raised,
    required this.supporters,
    required this.deadline,
    required this.status,
    required this.open,
    required this.paymentInfo,
  });

  factory Campaign.fromJson(Map<String, dynamic> j) {
    final ev = j['event'];
    return Campaign(
      id: j['id'] as String,
      title: j['title'] as String,
      description: (j['description'] as String?) ?? '',
      eventTitle: ev is Map ? ev['title'] as String? : null,
      eventDate: ev is Map ? ev['startDate'] as String? : null,
      target: (j['targetAmount'] as num?)?.toInt(),
      raised: (j['raised'] as num).toInt(),
      supporters: (j['supporters'] as num).toInt(),
      deadline: j['deadline'] as String?,
      status: j['status'] as String,
      open: j['open'] as bool,
      paymentInfo: (j['paymentInfo'] as String?) ?? '',
    );
  }

  final String id;
  final String title;
  final String description;
  final String? eventTitle;
  final String? eventDate;
  final int? target;
  final int raised;
  final int supporters;
  final String? deadline;

  /// draft | aktif | selesai
  final String status;

  /// Aktif dan belum lewat batas akhir: boleh menerima sumbangan baru.
  final bool open;
  final String paymentInfo;

  /// Persentase terkumpul dibatasi 100; null bila kampanye tanpa target.
  int? get percent => fundPercent(raised, target);

  String get statusLabel => switch (status) {
        'aktif' => open ? 'Aktif' : 'Lewat batas akhir',
        'selesai' => 'Selesai',
        _ => 'Draf',
      };
}

int? fundPercent(int raised, int? target) => target == null || target <= 0 ? null : (raised * 100 ~/ target).clamp(0, 100);

class Pledge {
  Pledge({
    required this.id,
    required this.kind,
    required this.amount,
    required this.message,
    required this.isAnonymous,
    required this.donorName,
    required this.status,
    required this.receivedOn,
    required this.createdAt,
    required this.mine,
    required this.packageName,
  });

  factory Pledge.fromJson(Map<String, dynamic> j) => Pledge(
        id: j['id'] as String,
        kind: PledgeKind.parse(j['kind'] as String?),
        amount: (j['amount'] as num).toInt(),
        message: (j['message'] as String?) ?? '',
        isAnonymous: j['isAnonymous'] as bool? ?? false,
        donorName: j['donorName'] as String?,
        status: j['status'] as String,
        receivedOn: j['receivedOn'] as String?,
        createdAt: j['createdAt'] as String,
        mine: j['mine'] as bool? ?? false,
        packageName: j['packageName'] as String?,
      );

  final String id;
  final PledgeKind kind;
  final int amount;
  final String message;
  final bool isAnonymous;

  /// Kosong bila donatur anonim dan pembaca bukan pemiliknya (disembunyikan server).
  final String? donorName;

  /// menunggu | diterima | ditolak
  final String status;
  final String? receivedOn;

  /// ISO UTC; tampilkan menurut jam perangkat.
  final String createdAt;
  final bool mine;
  final String? packageName;

  String get statusLabel => switch (status) {
        'diterima' => 'Diterima',
        'ditolak' => 'Ditolak',
        _ => 'Menunggu konfirmasi',
      };
}

class CampaignDetail {
  CampaignDetail({required this.campaign, required this.pledges});

  factory CampaignDetail.fromJson(Map<String, dynamic> j) => CampaignDetail(
        campaign: Campaign.fromJson(j['campaign'] as Map<String, dynamic>),
        pledges: [for (final p in j['pledges'] as List) Pledge.fromJson(p as Map<String, dynamic>)],
      );

  final Campaign campaign;
  final List<Pledge> pledges;
}

/// Nominal dari kolom teks: boleh memakai titik pemisah ribuan. Kosong, nol, atau bukan angka menjadi null.
int? parseAmount(String v) {
  final digits = v.replaceAll(RegExp(r'[.\s]'), '');
  if (digits.isEmpty || !RegExp(r'^\d+$').hasMatch(digits)) return null;
  final n = int.tryParse(digits);
  return n == null || n < 1 ? null : n;
}

// ---- Berkas siswa ----

enum DocKind {
  kartuKeluarga('kartu_keluarga', 'Kartu Keluarga'),
  aktaKelahiran('akta_kelahiran', 'Akta Kelahiran'),
  nisn('nisn', 'NISN'),
  raport('raport', 'Raport');

  const DocKind(this.wire, this.label);
  final String wire;
  final String label;

  static DocKind? parse(String? v) {
    for (final k in values) {
      if (k.wire == v) return k;
    }
    return null;
  }
}

/// Batas dari `packages/shared`: ukuran satu berkas, jumlah raport, dan panjang keterangan.
const documentMaxBytes = 5 * 1024 * 1024;
const raportMax = 12;
const documentLabelMax = 60;

/// Ekstensi yang diterima server (isi berkas tetap diperiksa server).
const documentExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

bool isAllowedDocumentName(String name) {
  final dot = name.lastIndexOf('.');
  return dot >= 0 && documentExtensions.contains(name.substring(dot + 1).toLowerCase());
}

class PlayerDocument {
  PlayerDocument({required this.id, required this.kind, required this.label, required this.originalName, required this.mime, required this.sizeBytes, required this.uploadedAt});

  static PlayerDocument? tryParse(Map<String, dynamic> j) {
    final kind = DocKind.parse(j['kind'] as String?);
    if (kind == null) return null;
    return PlayerDocument(
      id: j['id'] as String,
      kind: kind,
      label: j['label'] as String?,
      originalName: j['originalName'] as String,
      mime: j['mime'] as String,
      sizeBytes: (j['sizeBytes'] as num).toInt(),
      uploadedAt: j['uploadedAt'] as String,
    );
  }

  final String id;
  final DocKind kind;
  final String? label;
  final String originalName;
  final String mime;
  final int sizeBytes;
  final String uploadedAt;

  bool get isImage => mime.startsWith('image/');
}

String formatBytes(int b) => b >= 1024 * 1024 ? '${(b / 1024 / 1024).toStringAsFixed(1).replaceAll('.', ',')} MB' : '${(b / 1024).round().clamp(1, 1 << 30)} KB';

// ---- Izin orang tua ----

enum AbsenceKind {
  izin('izin', 'Izin', AttendanceStatus.izin),
  sakit('sakit', 'Sakit', AttendanceStatus.sakit);

  const AbsenceKind(this.wire, this.label, this.status);
  final String wire;
  final String label;

  /// Status absensi yang dipakai pelatih saat menerapkan pengajuan.
  final AttendanceStatus status;

  static AbsenceKind parse(String? v) => values.firstWhere((k) => k.wire == v, orElse: () => izin);
}

/// Pengajuan izin milik orang tua (`GET /guardian/absence-requests`).
class AbsenceRequest {
  AbsenceRequest({
    required this.id,
    required this.sessionId,
    required this.sessionDate,
    required this.startTime,
    required this.ageGroup,
    required this.playerId,
    required this.playerName,
    required this.kind,
    required this.note,
    required this.createdAt,
  });

  factory AbsenceRequest.fromJson(Map<String, dynamic> j) => AbsenceRequest(
        id: j['id'] as String,
        sessionId: j['sessionId'] as String,
        sessionDate: j['sessionDate'] as String,
        startTime: _hm(j['startTime'] as String?),
        ageGroup: NamedRef.from(j['ageGroup'])?.name ?? '',
        playerId: j['playerId'] as String,
        playerName: j['playerName'] as String,
        kind: AbsenceKind.parse(j['kind'] as String?),
        note: j['note'] as String?,
        createdAt: j['createdAt'] as String?,
      );

  final String id;
  final String sessionId;
  final String sessionDate;
  final String? startTime;
  final String ageGroup;
  final String playerId;
  final String playerName;
  final AbsenceKind kind;
  final String? note;
  final String? createdAt;
}

/// Pengajuan yang dilihat pelatih untuk satu sesi (`GET /sessions/:id/absence-requests`).
class SessionAbsenceRequest {
  SessionAbsenceRequest({required this.id, required this.playerId, required this.playerName, required this.kind, required this.note});

  factory SessionAbsenceRequest.fromJson(Map<String, dynamic> j) => SessionAbsenceRequest(
        id: j['id'] as String,
        playerId: j['playerId'] as String,
        playerName: (j['playerName'] as String?) ?? '',
        kind: AbsenceKind.parse(j['kind'] as String?),
        note: j['note'] as String?,
      );

  final String id;
  final String playerId;
  final String playerName;
  final AbsenceKind kind;
  final String? note;
}

// ---- Kartu QR ----

/// Data kartu siswa dari `GET /players/:id`.
class PlayerCard {
  PlayerCard({required this.id, required this.fullName, required this.memberNo, required this.status, required this.position, required this.ageGroup, required this.photoV});

  factory PlayerCard.fromJson(Map<String, dynamic> j) => PlayerCard(
        id: j['id'] as String,
        fullName: j['fullName'] as String,
        memberNo: j['memberNo'] as String?,
        status: (j['status'] as String?) ?? 'aktif',
        position: j['position'] as String?,
        ageGroup: NamedRef.from(j['ageGroup']),
        photoV: j['photoV'] as String?,
      );

  final String id;
  final String fullName;
  final String? memberNo;
  final String status;
  final String? position;
  final NamedRef? ageGroup;
  final String? photoV;

  String get statusLabel => switch (status) {
        'cuti' => 'Cuti',
        'keluar' => 'Keluar',
        _ => 'Aktif',
      };

  String get positionLabel => switch (position) {
        'GK' => 'Kiper',
        'DF' => 'Bek',
        'MF' => 'Gelandang',
        'FW' => 'Penyerang',
        _ => 'Posisi belum ditentukan',
      };
}

final _uuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');

/// Isi QR kartu sama dengan web: `<alamat web>/pemain/<id siswa>`.
String playerQrPayload(String webOrigin, String playerId) => '$webOrigin/pemain/$playerId';

/// Alamat web dari alamat API: web memakai `/api` pada origin yang sama, jadi cukup membuang akhiran itu.
/// Bila tidak berakhiran `/api` (mis. API lokal), dipakai origin-nya.
String webOriginOf(String apiUrl) {
  final trimmed = apiUrl.endsWith('/') ? apiUrl.substring(0, apiUrl.length - 1) : apiUrl;
  if (trimmed.endsWith('/api')) return trimmed.substring(0, trimmed.length - 4);
  final u = Uri.tryParse(trimmed);
  return u == null || !u.hasAuthority ? trimmed : u.origin;
}

/// Mengambil id siswa dari isi QR: URL `.../pemain/<id>` (atau `/siswa/<id>`), atau id polos. Selain itu null.
String? parsePlayerQr(String? raw) {
  final v = raw?.trim();
  if (v == null || v.isEmpty) return null;
  if (_uuid.hasMatch(v)) return v.toLowerCase();
  final u = Uri.tryParse(v);
  if (u == null) return null;
  final seg = u.pathSegments;
  for (var i = 0; i + 1 < seg.length; i++) {
    if ((seg[i] == 'pemain' || seg[i] == 'siswa') && _uuid.hasMatch(seg[i + 1])) return seg[i + 1].toLowerCase();
  }
  return null;
}

// ---- Tagihan ----

class PaymentRecord {
  PaymentRecord({required this.amount, required this.paidOn, required this.method, required this.note});

  factory PaymentRecord.fromJson(Map<String, dynamic> j) => PaymentRecord(
        amount: (j['amount'] as num).toInt(),
        paidOn: j['paidOn'] as String,
        method: j['method'] as String,
        note: j['note'] as String?,
      );

  final int amount;
  final String paidOn;

  /// tunai | transfer | lainnya
  final String method;
  final String? note;

  String get methodLabel => switch (method) {
        'tunai' => 'Tunai',
        'transfer' => 'Transfer',
        _ => 'Lainnya',
      };
}

/// Satu tagihan dari `GET /invoices` beserta riwayat pembayarannya.
class InvoiceDetail {
  InvoiceDetail({required this.invoice, required this.payments});

  factory InvoiceDetail.fromJson(Map<String, dynamic> j) => InvoiceDetail(
        invoice: Invoice.fromJson(j),
        payments: [for (final p in (j['payments'] as List?) ?? const []) PaymentRecord.fromJson(p as Map<String, dynamic>)],
      );

  final Invoice invoice;
  final List<PaymentRecord> payments;
}
