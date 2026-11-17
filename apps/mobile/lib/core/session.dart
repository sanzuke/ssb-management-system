import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'models.dart';

enum AuthStatus {
  /// Memeriksa token tersimpan.
  loading,
  anonymous,

  /// Login berhasil tetapi belum ada SSB aktif (akun punya beberapa SSB).
  needSsb,
  ready,

  /// Gagal menghubungi server saat memulai; token tetap disimpan.
  offline,
}

/// Status login, akun, dan SSB aktif. Token disimpan di Keychain/Keystore.
class SessionController extends ChangeNotifier {
  SessionController(this.api, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage() {
    api.onUnauthorized = _expire;
  }

  static const _tokenKey = 'ssb_token';

  final ApiClient api;
  final FlutterSecureStorage _storage;

  AuthStatus status = AuthStatus.loading;
  Me? me;

  /// Apakah akun punya kata sandi (akun yang hanya login Google tidak); menentukan form ganti sandi dan hapus akun.
  bool hasPassword = true;

  Role? get role => me?.active?.role;

  Future<void> start() async {
    final saved = await _storage.read(key: _tokenKey);
    if (saved == null) {
      _set(AuthStatus.anonymous);
      return;
    }
    api.token = saved;
    await refresh();
  }

  /// Memuat ulang akun dari server dan menentukan status.
  Future<void> refresh() async {
    try {
      final j = await api.get('/auth/me') as Map<String, dynamic>;
      me = Me.fromJson(j);
      hasPassword = j['hasPassword'] as bool? ?? true;
      _set(me!.active == null ? AuthStatus.needSsb : AuthStatus.ready);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        await _expire();
        return;
      }
      if (e.isNetwork) {
        _set(AuthStatus.offline);
        return;
      }
      rethrow;
    }
  }

  Future<void> login(String email, String password) async {
    final j = await api.post('/auth/token', {'email': email.trim(), 'password': password}) as Map<String, dynamic>;
    await loginWithToken(j['token'] as String);
  }

  /// Menyimpan token yang sudah didapat dari server lalu memuat akun; dipakai semua jalur masuk.
  Future<void> loginWithToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    api.token = token;
    await refresh();
  }

  /// Menukar kode sekali pakai dari tautan balik `ssbapp://auth?code=...` (login Google) dengan token sesi.
  Future<void> loginWithGoogleCode(String code) async {
    final j = await api.post('/auth/mobile-exchange', {'code': code}) as Map<String, dynamic>;
    await loginWithToken(j['token'] as String);
  }

  Future<void> selectSsb(String ssbId) async {
    await api.post('/auth/select', {'ssbId': ssbId});
    await refresh();
  }

  /// Membuka pilihan SSB untuk akun yang punya lebih dari satu SSB; SSB aktif baru diganti lewat [selectSsb].
  void showSsbPicker() => _set(AuthStatus.needSsb);

  /// Dipanggil sebelum token dihapus pada keluar sengaja (bukan saat sesi kedaluwarsa), mis. untuk
  /// mencabut perangkat push dan mengosongkan antrean offline. Galat di dalamnya diabaikan.
  final List<Future<void> Function()> onLogout = [];

  Future<void> _runLogoutHooks() async {
    for (final h in onLogout) {
      try {
        await h();
      } on Object {
        // Bersih-bersih sebisanya; keluar tetap dilanjutkan.
      }
    }
  }

  Future<void> logout() async {
    await _runLogoutHooks();
    try {
      await api.post('/auth/logout');
    } on ApiException {
      // Sesi di server kedaluwarsa sendiri; token lokal tetap dihapus.
    }
    await _expire();
  }

  /// Menghapus akun sendiri. [confirm] adalah kata sandi, atau email untuk akun yang hanya login Google.
  /// Galat server (mis. 409 `sole_admin`) dilempar tanpa mengubah apa pun; bersih-bersih lokal baru
  /// berjalan sesudah berhasil, karena sesi di server sudah hilang bersama akunnya.
  Future<void> deleteAccount(String confirm) async {
    await api.post('/auth/delete-account', {'confirm': confirm});
    await _runLogoutHooks();
    await _expire();
  }

  Future<void> _expire() async {
    api.token = null;
    me = null;
    await _storage.delete(key: _tokenKey);
    _set(AuthStatus.anonymous);
  }

  void _set(AuthStatus s) {
    status = s;
    notifyListeners();
  }
}
