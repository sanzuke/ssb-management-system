import 'package:flutter/foundation.dart';

/// Alamat API. Atur saat build: `--dart-define=API_URL=https://ssb-ms.zukelabs.web.id/api`.
///
/// Bawaan untuk pengembangan: emulator Android mengakses mesin host lewat 10.0.2.2.
/// Web di produksi memakai `/api` pada origin web; di sini web ikut bawaan lokal.
String get apiUrl {
  const fromEnv = String.fromEnvironment('API_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

/// Alamat web (halaman lupa sandi dan undangan dibuka di browser). Atur: `--dart-define=WEB_URL=...`.
String get webUrl {
  const fromEnv = String.fromEnvironment('WEB_URL');
  return (fromEnv.isNotEmpty ? fromEnv : 'https://ssb-ms.zukelabs.web.id').replaceFirst(RegExp(r'/+$'), '');
}
