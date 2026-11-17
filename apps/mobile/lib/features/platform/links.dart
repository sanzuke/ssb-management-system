import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';

/// Hasil tautan balik `ssbapp://auth?code=...` atau `ssbapp://auth?error=...` dari login Google.
class AuthLink {
  const AuthLink.code(String this.code) : error = null;
  const AuthLink.error(String this.error) : code = null;

  final String? code;
  final String? error;
}

/// Membaca tautan balik login Google; null bila bukan tautan `ssbapp://auth`.
AuthLink? parseAuthLink(Uri uri) {
  if (uri.scheme != 'ssbapp' || (uri.host != 'auth' && uri.path.replaceAll('/', '') != 'auth')) return null;
  final code = uri.queryParameters['code'];
  if (code != null && code.isNotEmpty) return AuthLink.code(code);
  final error = uri.queryParameters['error'];
  if (error != null && error.isNotEmpty) return AuthLink.error(error);
  return null;
}

/// Pesan untuk kode `error` dari alur Google (sama dengan web, `googleErrors` di apps/web/src/lib/api.ts).
String googleErrorMessage(String code) => switch (code) {
      'akun_belum_terdaftar' => 'Akun Google ini belum terdaftar. Minta tautan undangan dari admin SSB.',
      'email_sudah_terdaftar' => 'Email ini sudah punya akun dengan kata sandi. Masuk dengan email dan kata sandi.',
      'email_belum_terverifikasi' => 'Email di akun Google ini belum diverifikasi oleh Google.',
      'google_dibatalkan' => 'Masuk dengan Google dibatalkan.',
      'sesi_google_habis' => 'Sesi masuk habis. Coba lagi.',
      'state_tidak_cocok' => 'Sesi masuk tidak cocok. Coba lagi.',
      'verifikasi_google_gagal' => 'Google tidak bisa memverifikasi akun Anda. Coba lagi.',
      _ => 'Masuk dengan Google gagal ($code). Coba lagi.',
    };

final _invitationInUrl = RegExp(r'/undangan/([A-Za-z0-9_-]+)');
final _bareToken = RegExp(r'^[A-Za-z0-9_-]{20,}$');

/// Mengambil token undangan dari tautan yang ditempel (`.../undangan/<token>`) atau token polos.
String? parseInvitationToken(String input) {
  final text = input.trim();
  final m = _invitationInUrl.firstMatch(text);
  if (m != null) return m.group(1);
  return _bareToken.hasMatch(text) ? text : null;
}

/// Alamat halaman undangan di web, dari token.
Uri invitationUrl(String token) => Uri.parse('$webUrl/undangan/$token');

/// Alamat halaman lupa kata sandi di web.
Uri forgotPasswordUrl() => Uri.parse('$webUrl/lupa-sandi');

/// Alamat awal login Google untuk aplikasi; server membalas dengan `ssbapp://auth?...` setelah selesai.
Uri googleStartUrl(String apiBase) => Uri.parse('$apiBase/auth/google/start').replace(queryParameters: {'intent': 'login', 'mobile': '1'});

/// Membuka [url] di browser eksternal; false bila tidak ada aplikasi yang bisa membukanya.
Future<bool> openExternal(Uri url) async {
  try {
    return await launchUrl(url, mode: LaunchMode.externalApplication);
  } on Object catch (e) {
    debugPrint('Gagal membuka $url: $e');
    return false;
  }
}
