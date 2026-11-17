import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'config.dart';
import 'models.dart';
import 'models_extras.dart';

/// Isi berkas yang diunduh dengan token bearer.
class DownloadedFile {
  DownloadedFile(this.bytes, this.mime);

  final Uint8List bytes;
  final String mime;
}

/// Permintaan unggah berkas siswa. Kolom form sama dengan web: `kind`, `label` (raport), `file`.
/// Dipisah dari pengirimannya agar bisa diuji tanpa jaringan.
http.MultipartRequest buildDocumentUpload(Uri uri, Map<String, String> headers, {required DocKind kind, String? label, required List<int> bytes, required String filename}) {
  final req = http.MultipartRequest('POST', uri)
    ..headers.addAll(headers)
    ..fields['kind'] = kind.wire;
  if (kind == DocKind.raport && label != null) req.fields['label'] = label;
  // Tipe berkas ditentukan server dari isinya, jadi Content-Type bagian file tidak perlu akurat.
  req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
  return req;
}

/// Akses data fitur tambahan. Semua endpoint ada di API web; izin dan batas data ditegakkan server.
class ExtrasRepository {
  ExtrasRepository(this.api, {http.Client? client}) : _client = client ?? _shared;

  factory ExtrasRepository.of(BuildContext context) => ExtrasRepository(context.read<ApiClient>());

  static final http.Client _shared = http.Client();

  final ApiClient api;
  final http.Client _client;

  List<T> _list<T>(dynamic data, T Function(Map<String, dynamic>) f) => [for (final e in data as List) f(e as Map<String, dynamic>)];

  // ---- Kalender ----

  Future<List<CalendarEvent>> calendar({required String from, required String to}) async =>
      _list(await api.get('/calendar', query: {'from': from, 'to': to}), CalendarEvent.fromJson);

  // ---- Donasi ----

  Future<List<Campaign>> campaigns() async => _list(await api.get('/fundraising'), Campaign.fromJson);

  Future<CampaignDetail> campaign(String id) async => CampaignDetail.fromJson(await api.get('/fundraising/${Uri.encodeComponent(id)}') as Map<String, dynamic>);

  Future<void> pledge(String campaignId, {required PledgeKind kind, required int amount, String message = '', bool isAnonymous = false}) async {
    await api.post('/fundraising/${Uri.encodeComponent(campaignId)}/pledges', {'kind': kind.wire, 'amount': amount, 'message': message, 'isAnonymous': isAnonymous});
  }

  // ---- Berkas siswa ----

  String _docs(String playerId) => '/players/${Uri.encodeComponent(playerId)}/documents';

  Future<List<PlayerDocument>> documents(String playerId) async =>
      [for (final d in await api.get(_docs(playerId)) as List) ?PlayerDocument.tryParse(d as Map<String, dynamic>)];

  Future<PlayerDocument?> uploadDocument(String playerId, {required DocKind kind, String? label, required List<int> bytes, required String filename}) async {
    final req = buildDocumentUpload(Uri.parse('$apiUrl${_docs(playerId)}'), api.authHeaders, kind: kind, label: label, bytes: bytes, filename: filename);
    final res = await _sendRaw(req, const Duration(seconds: 90));
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    return body is Map<String, dynamic> ? PlayerDocument.tryParse(body) : null;
  }

  Future<void> deleteDocument(String playerId, String docId) async {
    await api.delete('${_docs(playerId)}/${Uri.encodeComponent(docId)}');
  }

  Future<DownloadedFile> downloadDocument(String playerId, String docId) async {
    final req = http.Request('GET', Uri.parse('$apiUrl${_docs(playerId)}/${Uri.encodeComponent(docId)}/file'))..headers.addAll(api.authHeaders);
    final res = await _sendRaw(req, const Duration(seconds: 60));
    return DownloadedFile(res.bodyBytes, res.headers['content-type'] ?? 'application/octet-stream');
  }

  /// Mengirim permintaan non-JSON (multipart, unduhan) dengan pemetaan galat yang sama seperti [ApiClient].
  Future<http.Response> _sendRaw(http.BaseRequest req, Duration timeout) async {
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _client.send(req).timeout(timeout));
    } on TimeoutException {
      throw ApiException(0, 'timeout', 'Koneksi terlalu lambat. Coba lagi.');
    } on http.ClientException {
      throw ApiException(0, 'network', 'Tidak ada koneksi ke server. Periksa sinyal Anda.');
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return res;
    final e = apiExceptionFrom(res.statusCode, utf8.decode(res.bodyBytes, allowMalformed: true));
    if (e.isUnauthorized && api.token != null) api.onUnauthorized?.call();
    throw e;
  }

  // ---- Izin orang tua ----

  Future<List<GuardianSession>> upcomingGuardianSessions() async {
    final now = DateTime.now();
    final to = now.add(const Duration(days: 60));
    final data = await api.get('/guardian/sessions', query: {'from': _iso(now), 'to': _iso(to)});
    return _list(data, GuardianSession.fromJson);
  }

  Future<List<AbsenceRequest>> absenceRequests() async => _list(await api.get('/guardian/absence-requests'), AbsenceRequest.fromJson);

  Future<void> saveAbsenceRequest({required String sessionId, required String playerId, required AbsenceKind kind, String? note}) async {
    final n = note?.trim() ?? '';
    await api.post('/guardian/absence-requests', {'sessionId': sessionId, 'playerId': playerId, 'kind': kind.wire, if (n.isNotEmpty) 'note': n});
  }

  Future<void> deleteAbsenceRequest(String id) async {
    await api.delete('/guardian/absence-requests/${Uri.encodeComponent(id)}');
  }

  Future<List<SessionAbsenceRequest>> sessionAbsenceRequests(String sessionId) async =>
      _list(await api.get('/sessions/${Uri.encodeComponent(sessionId)}/absence-requests'), SessionAbsenceRequest.fromJson);

  // ---- Kartu dan absensi ----

  Future<PlayerCard> playerCard(String id) async => PlayerCard.fromJson(await api.get('/players/${Uri.encodeComponent(id)}') as Map<String, dynamic>);

  /// Daftar absensi dalam JSON mentah supaya bisa disimpan di [RosterCache] untuk dipakai tanpa sinyal.
  Future<Map<String, dynamic>> rawRoster(String sessionId) async => await api.get('/sessions/${Uri.encodeComponent(sessionId)}/attendance') as Map<String, dynamic>;

  // ---- Tagihan ----

  Future<List<InvoiceDetail>> invoiceDetails() async => _list(await api.get('/invoices'), InvoiceDetail.fromJson);

  Future<String?> bankInfo() async {
    final j = await api.get('/fees/public-info');
    final v = j is Map ? j['bankInfo'] : null;
    return v is String && v.trim().isNotEmpty ? v : null;
  }
}

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Galat API dari status dan isi respons (`{error: {code, message}}`).
ApiException apiExceptionFrom(int status, String body) {
  dynamic data;
  try {
    data = body.isEmpty ? null : jsonDecode(body);
  } on FormatException {
    data = null;
  }
  final err = data is Map ? data['error'] : null;
  return ApiException(
    status,
    err is Map ? '${err['code']}' : 'error',
    err is Map && err['message'] is String ? err['message'] as String : 'Terjadi kesalahan. Coba lagi.',
  );
}

/// Salinan terakhir daftar absensi dan daftar sesi hari ini di perangkat, agar absensi dan pemindai
/// tetap bisa dipakai tanpa sinyal. Dipisah per akun (`userId`) supaya akun lain di perangkat yang sama tidak membacanya.
class RosterCache {
  RosterCache(this._prefs, this.userId);

  static Future<RosterCache> open(String userId) async => RosterCache(await SharedPreferences.getInstance(), userId);

  static const _rosterKey = 'ssb_roster_cache_v1';
  static const _todayKey = 'ssb_today_sessions_v1';
  static const _maxRosters = 15;

  final SharedPreferences _prefs;
  final String userId;

  Map<String, dynamic> _read(String key) {
    final raw = _prefs.getString(key);
    if (raw == null) return {};
    try {
      final j = jsonDecode(raw);
      return j is Map<String, dynamic> && j['userId'] == userId ? j : {};
    } on FormatException {
      return {};
    }
  }

  Future<void> putRoster(String sessionId, Map<String, dynamic> rosterJson) async {
    final data = Map<String, dynamic>.from((_read(_rosterKey)['data'] as Map?) ?? const {});
    data[sessionId] = {'at': DateTime.now().toIso8601String(), 'roster': rosterJson};
    if (data.length > _maxRosters) {
      final oldest = data.entries.toList()..sort((a, b) => (a.value['at'] as String).compareTo(b.value['at'] as String));
      for (final e in oldest.take(data.length - _maxRosters)) {
        data.remove(e.key);
      }
    }
    await _prefs.setString(_rosterKey, jsonEncode({'userId': userId, 'data': data}));
  }

  AttendanceRoster? roster(String sessionId) {
    final entry = ((_read(_rosterKey)['data'] as Map?) ?? const {})[sessionId];
    if (entry is! Map) return null;
    try {
      return AttendanceRoster.fromJson(entry['roster'] as Map<String, dynamic>);
    } on Object {
      return null;
    }
  }

  /// Id sesi hari [date] yang terakhir dimuat pemindai.
  Future<void> putToday(String date, List<String> sessionIds) => _prefs.setString(_todayKey, jsonEncode({'userId': userId, 'date': date, 'ids': sessionIds}));

  List<String> today(String date) {
    final j = _read(_todayKey);
    return j['date'] == date ? [for (final id in (j['ids'] as List?) ?? const []) id as String] : const [];
  }
}
