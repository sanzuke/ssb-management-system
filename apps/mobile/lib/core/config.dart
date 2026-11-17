import 'package:flutter/foundation.dart';

/// Alamat web dan API produksi (server fufa). `app.familyunitedfa.com` meneruskan `/api` ke API yang sama dengan web.
const _prodWeb = 'https://app.familyunitedfa.com';
const _prodApi = '$_prodWeb/api';

/// Alamat API. Bisa diganti saat build: `--dart-define=API_URL=https://.../api`.
///
/// Tanpa `API_URL`: build rilis memakai produksi; build debug memakai mesin lokal
/// (emulator Android mengakses host lewat 10.0.2.2).
String get apiUrl {
  const fromEnv = String.fromEnvironment('API_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (kReleaseMode) return _prodApi;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

/// Alamat web (halaman lupa sandi dan undangan dibuka di browser). Bisa diganti: `--dart-define=WEB_URL=...`.
String get webUrl {
  const fromEnv = String.fromEnvironment('WEB_URL');
  return (fromEnv.isNotEmpty ? fromEnv : _prodWeb).replaceFirst(RegExp(r'/+$'), '');
}
