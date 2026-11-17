// getToken/onTokenRefresh dinyatakan usang di firebase_messaging 17, tetapi penggantinya (register/onRegistered)
// memberi Firebase Installation ID, bukan token pendaftaran FCM yang dipakai server (FCM HTTP v1, field `token`).
// ignore_for_file: deprecated_member_use
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api.dart';
import '../../core/session.dart';
import 'messenger.dart';

const _tabs = {'hari-ini', 'siswa', 'jadwal', 'beranda', 'anak', 'tagihan', 'akun'};
final _idPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

/// Memeriksa `data['route']` dari notifikasi. Hanya rute aplikasi yang dikenal yang diterima
/// (`/?tab=...`, `/absensi/<id>`, `/siswa/<id>/rapor`); selain itu null, supaya pesan yang dibuat
/// sembarangan tidak bisa membawa pengguna ke layar lain.
String? safePushRoute(Object? raw) {
  if (raw is! String || !raw.startsWith('/') || raw.startsWith('//')) return null;
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.hasScheme || uri.hasAuthority || uri.hasFragment) return null;
  if (uri.path == '/') {
    final q = uri.queryParameters;
    if (q.isEmpty) return '/';
    return q.length == 1 && _tabs.contains(q['tab']) ? '/?tab=${q['tab']}' : null;
  }
  if (uri.hasQuery) return null;
  final s = uri.pathSegments;
  if (s.length == 2 && s[0] == 'absensi' && _idPattern.hasMatch(s[1])) return uri.path;
  if (s.length == 3 && s[0] == 'siswa' && s[2] == 'rapor' && _idPattern.hasMatch(s[1])) return uri.path;
  return null;
}

/// Push FCM: mendaftarkan perangkat ke API, menerima notifikasi, dan membuka layar tujuannya.
///
/// Firebase hanya diaktifkan bila build membawa konfigurasinya (`google-services.json` /
/// `GoogleService-Info.plist`). Tanpa itu [available] false dan seluruh push mati diam-diam;
/// aplikasi berjalan normal.
class PushService extends ChangeNotifier {
  PushService(this.api, this.session, this._prefs);

  static const _prefKey = 'ssb_push_enabled';

  final ApiClient api;
  final SessionController session;
  final SharedPreferences _prefs;

  GoRouter? _router;
  String? _pendingRoute;
  String? _registeredToken;
  bool _registering = false;
  bool _started = false;

  /// Firebase siap dan platform mendukung push.
  bool available = false;

  /// Izin notifikasi ditolak di perangkat (pengguna perlu mengubahnya di pengaturan sistem).
  bool permissionDenied = false;

  /// Preferensi pengguna di perangkat ini; bawaan menyala.
  bool get enabled => _prefs.getBool(_prefKey) ?? true;

  bool get _supported => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  String get _platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  /// Dipanggil sekali dari main. Tidak pernah melempar.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    session.addListener(_onSession);
    if (_supported) {
      try {
        await Firebase.initializeApp();
        final messaging = FirebaseMessaging.instance;
        FirebaseMessaging.onMessage.listen(_onForeground);
        FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data['route']));
        messaging.onTokenRefresh.listen(_onTokenRefresh, onError: (Object _) {});
        final initial = await messaging.getInitialMessage();
        if (initial != null) _open(initial.data['route']);
        available = true;
      } on Object catch (e) {
        // Tanpa konfigurasi Firebase ini normal: push dimatikan, aplikasi lain tetap jalan.
        debugPrint('Push dimatikan: $e');
        available = false;
      }
      notifyListeners();
    }
    _onSession();
  }

  /// Menghubungkan router agar ketukan notifikasi bisa membuka layar.
  void attach(GoRouter router) {
    _router = router;
    _applyPending();
  }

  void _onSession() {
    switch (session.status) {
      case AuthStatus.ready:
        _applyPending();
        unawaited(_register());
      case AuthStatus.anonymous:
        // Sesi berakhir: token harus didaftarkan ulang bagi akun berikutnya.
        _registeredToken = null;
      case AuthStatus.loading || AuthStatus.needSsb || AuthStatus.offline:
        break;
    }
  }

  /// Meminta izin (saat pertama kali siap login, bukan sebelum) lalu mendaftarkan token ke API.
  Future<void> _register() async {
    if (!available || !enabled || _registering) return;
    _registering = true;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      final granted = settings.authorizationStatus == AuthorizationStatus.authorized || settings.authorizationStatus == AuthorizationStatus.provisional;
      if (permissionDenied == granted) {
        permissionDenied = !granted;
        notifyListeners();
      }
      if (!granted) return;
      final token = await messaging.getToken();
      if (token == null || token == _registeredToken) return;
      await _post(token);
    } on Object catch (e) {
      // Jaringan putus atau APNs belum siap; dicoba lagi pada pembukaan berikutnya.
      debugPrint('Gagal mendaftarkan perangkat push: $e');
    } finally {
      _registering = false;
    }
  }

  Future<void> _post(String token) async {
    await api.post('/push/devices', {'token': token, 'platform': _platform});
    _registeredToken = token;
  }

  void _onTokenRefresh(String token) {
    if (!available || !enabled || session.status != AuthStatus.ready || token == _registeredToken) return;
    unawaited(_post(token).catchError((Object e) => debugPrint('Gagal memperbarui token push: $e')));
  }

  /// Mencabut perangkat ini dari akun. Dipasang di `SessionController.onLogout` (jalan sebelum token dihapus).
  Future<void> unregister() async {
    if (!available) return;
    var token = _registeredToken;
    token ??= await FirebaseMessaging.instance.getToken();
    _registeredToken = null;
    if (token == null) return;
    await api.delete('/push/devices', {'token': token});
  }

  /// Saklar notifikasi di Akun: menyimpan preferensi, lalu mendaftarkan atau mencabut perangkat.
  Future<void> setEnabled(bool value) async {
    await _prefs.setBool(_prefKey, value);
    notifyListeners();
    if (value) {
      await _register();
    } else {
      try {
        await unregister();
      } on ApiException catch (e) {
        debugPrint('Gagal mencabut perangkat push: ${e.message}');
      }
    }
  }

  /// Notifikasi yang tiba saat aplikasi terbuka tidak ditampilkan sistem; tampilkan sebagai pesan singkat.
  void _onForeground(RemoteMessage m) {
    final title = m.notification?.title;
    final body = m.notification?.body;
    final text = [title, body].whereType<String>().where((s) => s.isNotEmpty).join(': ');
    final route = safePushRoute(m.data['route']);
    if (text.isEmpty) return;
    rootMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(text),
          duration: const Duration(seconds: 6),
          action: route == null ? null : SnackBarAction(label: 'Buka', onPressed: () => _open(route)),
        ),
      );
  }

  /// Menyimpan rute tujuan; dijalankan segera bila sudah login, atau setelah login selesai.
  void _open(Object? raw) {
    final route = safePushRoute(raw);
    if (route == null) return;
    _pendingRoute = route;
    _applyPending();
  }

  void _applyPending() {
    final route = _pendingRoute;
    final router = _router;
    if (route == null || router == null || session.status != AuthStatus.ready) return;
    _pendingRoute = null;
    // Ditunda satu putaran: dipanggil dari pendengar sesi, saat router sendiri sedang menata ulang rute.
    scheduleMicrotask(() {
      if (route == '/' || route.startsWith('/?')) {
        router.go(route);
        return;
      }
      // Layar detail ditumpuk di atas beranda supaya tombol kembali tetap masuk akal.
      router.go('/');
      router.push(route);
    });
  }

  @override
  void dispose() {
    session.removeListener(_onSession);
    super.dispose();
  }
}
