import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import 'links.dart';

/// Alur "Masuk dengan Google": membuka browser, lalu menerima `ssbapp://auth?code=...` dan menukarnya
/// dengan token. Hidup selama aplikasi berjalan (bukan per halaman) supaya tautan yang datang saat
/// aplikasi baru dibuka dari kondisi mati tidak hilang.
class GoogleLoginController extends ChangeNotifier {
  GoogleLoginController(this.session, {this.links, Future<bool> Function(Uri)? launch}) : _launch = launch ?? openExternal;

  final SessionController session;

  /// Sumber tautan masuk; bawaannya app_links. Diganti saat uji.
  final Stream<Uri>? links;
  final Future<bool> Function(Uri) _launch;
  StreamSubscription<Uri>? _sub;
  String? _lastCode;

  bool busy = false;

  /// Pesan galat terakhir untuk ditampilkan di halaman masuk.
  String? error;

  void start() {
    if (_sub != null) return;
    try {
      // app_links mengirim tautan awal (aplikasi dibuka dari tautan) dan tautan berikutnya lewat aliran yang sama.
      _sub = (links ?? AppLinks().uriLinkStream).listen(handle, onError: (Object _) {});
    } on Object catch (e) {
      debugPrint('Tautan masuk tidak didukung di platform ini: $e');
    }
  }

  void clearError() {
    if (error == null) return;
    error = null;
    notifyListeners();
  }

  /// Membuka halaman Google di browser; hasilnya datang lewat [handle].
  Future<void> open() async {
    error = null;
    notifyListeners();
    final ok = await _launch(googleStartUrl(apiUrl));
    if (!ok) {
      error = 'Tidak bisa membuka browser. Coba lagi.';
      notifyListeners();
    }
  }

  /// Memproses satu tautan masuk. Kode hanya dipakai sekali; tautan ganda diabaikan.
  Future<void> handle(Uri uri) async {
    final link = parseAuthLink(uri);
    if (link == null) return;
    if (session.status == AuthStatus.ready || session.status == AuthStatus.needSsb) return;
    if (link.error != null) {
      error = googleErrorMessage(link.error!);
      notifyListeners();
      return;
    }
    final code = link.code!;
    if (code == _lastCode) return;
    _lastCode = code;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await session.loginWithGoogleCode(code);
    } on ApiException catch (e) {
      error = e.message;
    } on Object {
      error = 'Masuk dengan Google gagal. Coba lagi.';
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
