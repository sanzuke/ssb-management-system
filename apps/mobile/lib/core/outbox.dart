import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Satu perubahan yang menunggu dikirim. [key] mengidentifikasi entitasnya
/// (mis. `attendance:<sessionId>`); item baru dengan key sama menggantikan yang lama,
/// jadi hanya keadaan terakhir yang dikirim. Hanya untuk permintaan PUT yang menimpa (idempoten).
class OutboxItem {
  OutboxItem({required this.key, required this.path, required this.body, DateTime? createdAt, this.label}) : createdAt = createdAt ?? DateTime.now();

  factory OutboxItem.fromJson(Map<String, dynamic> j) => OutboxItem(
        key: j['key'] as String,
        path: j['path'] as String,
        body: j['body'] as Object,
        label: j['label'] as String?,
        createdAt: DateTime.parse(j['createdAt'] as String),
      );

  final String key;

  /// Jalur API, mis. `/sessions/<id>/attendance`.
  final String path;

  /// Isi JSON permintaan PUT (Map atau List).
  final Object body;

  /// Nama singkat untuk pengguna, mis. "Absensi KU-10, 17 Nov".
  final String? label;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {'key': key, 'path': path, 'body': body, 'label': label, 'createdAt': createdAt.toIso8601String()};
}

/// Hasil [Outbox.submit]: [data] berisi jawaban server bila terkirim; [queued] true bila disimpan karena tidak ada koneksi.
class OutboxResult {
  const OutboxResult.sent(this.data) : queued = false;
  const OutboxResult.queued() : data = null, queued = true;

  final dynamic data;
  final bool queued;
}

/// Antrean perubahan lokal agar absensi dan nilai tetap tersimpan tanpa sinyal.
///
/// - [submit] mencoba kirim langsung; bila jaringan gagal, item disimpan di perangkat dan dikirim ulang
///   saat aplikasi dibuka kembali, tiap 30 detik, atau lewat [flush].
/// - Galat dari server (400/403/404/409) tidak diulang: item dibuang dan pesannya masuk [failures].
/// - Antrean dihapus saat pengguna keluar sengaja ([clear]), bukan saat sesi kedaluwarsa.
class Outbox extends ChangeNotifier with WidgetsBindingObserver {
  Outbox(this._api, this._prefs, {this.retryEvery = const Duration(seconds: 30)}) {
    _items = _read();
    WidgetsBinding.instance.addObserver(this);
    _schedule();
  }

  static const _prefsKey = 'ssb_outbox_v1';

  static Future<Outbox> load(ApiClient api) async => Outbox(api, await SharedPreferences.getInstance());

  final ApiClient _api;
  final SharedPreferences _prefs;
  final Duration retryEvery;
  late List<OutboxItem> _items;
  Timer? _timer;
  bool _flushing = false;

  /// Pesan galat dari item yang ditolak server; ditampilkan lalu dikosongkan lewat [takeFailures].
  final List<String> failures = [];

  List<OutboxItem> get items => List.unmodifiable(_items);
  int get pending => _items.length;

  bool has(String key) => _items.any((i) => i.key == key);

  /// Isi terakhir yang menunggu dikirim untuk [key], atau null.
  Object? bodyFor(String key) => _items.where((i) => i.key == key).firstOrNull?.body;

  /// Mengirim [item] sekarang. Jaringan gagal: disimpan dan hasilnya `queued`.
  /// Galat server: dilempar ke pemanggil dan item tidak disimpan.
  Future<OutboxResult> submit(OutboxItem item) async {
    _items.removeWhere((i) => i.key == item.key);
    try {
      final data = await _api.put(item.path, item.body);
      await _write();
      notifyListeners();
      return OutboxResult.sent(data);
    } on ApiException catch (e) {
      if (!e.isNetwork) {
        await _write();
        notifyListeners();
        rethrow;
      }
      _items.add(item);
      await _write();
      _schedule();
      notifyListeners();
      return const OutboxResult.queued();
    }
  }

  /// Mengirim antrean berurutan. Berhenti pada galat jaringan pertama; item yang ditolak server dibuang.
  Future<void> flush() async {
    if (_flushing || _items.isEmpty) return;
    _flushing = true;
    try {
      for (final item in List.of(_items)) {
        try {
          await _api.put(item.path, item.body);
          _items.removeWhere((i) => identical(i, item));
        } on ApiException catch (e) {
          if (e.isNetwork || e.isUnauthorized) break;
          _items.removeWhere((i) => identical(i, item));
          failures.add('${item.label ?? item.key}: ${e.message}');
        }
      }
      await _write();
      _schedule();
      notifyListeners();
    } finally {
      _flushing = false;
    }
  }

  /// Mengambil dan mengosongkan pesan galat.
  List<String> takeFailures() {
    final f = List.of(failures);
    failures.clear();
    return f;
  }

  Future<void> clear() async {
    _items.clear();
    failures.clear();
    _timer?.cancel();
    await _prefs.remove(_prefsKey);
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) flush();
  }

  void _schedule() {
    _timer?.cancel();
    if (_items.isEmpty) return;
    _timer = Timer(retryEvery, flush);
  }

  List<OutboxItem> _read() {
    final raw = _prefs.getString(_prefsKey);
    if (raw == null) return [];
    try {
      return [for (final j in jsonDecode(raw) as List) OutboxItem.fromJson(j as Map<String, dynamic>)];
    } on Object {
      return [];
    }
  }

  Future<void> _write() => _prefs.setString(_prefsKey, jsonEncode([for (final i in _items) i.toJson()]));

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
