import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

/// Kesalahan dari API (`{error: {code, message}}`) atau jaringan (status 0).
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  bool get isUnauthorized => status == 401;
  bool get isNetwork => status == 0;

  @override
  String toString() => message;
}

/// Klien HTTP ke API yang sama dengan web. Autentikasi memakai token bearer
/// (`POST /auth/token`), bukan cookie.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  /// Dipanggil saat API menjawab 401 untuk permintaan yang membawa token (sesi habis atau dicabut).
  void Function()? onUnauthorized;

  Map<String, String> get authHeaders => {if (token != null) 'authorization': 'Bearer $token'};

  Uri _uri(String path, [Map<String, String?>? query]) {
    final q = <String, String>{
      for (final e in (query ?? const {}).entries)
        if (e.value != null) e.key: e.value!,
    };
    final base = Uri.parse('$apiUrl$path');
    return q.isEmpty ? base : base.replace(queryParameters: {...base.queryParameters, ...q});
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) => _send('GET', _uri(path, query));

  Future<dynamic> post(String path, [Object? body]) => _send('POST', _uri(path), body: body ?? const {});

  Future<dynamic> put(String path, Object body) => _send('PUT', _uri(path), body: body);

  Future<dynamic> patch(String path, Object body) => _send('PATCH', _uri(path), body: body);

  Future<dynamic> delete(String path, [Object? body]) => _send('DELETE', _uri(path), body: body ?? const {});

  Future<dynamic> _send(String method, Uri uri, {Object? body}) async {
    final req = http.Request(method, uri)..headers.addAll(authHeaders);
    if (method != 'GET') {
      req.headers['content-type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _client.send(req).timeout(const Duration(seconds: 20)));
    } on TimeoutException {
      throw ApiException(0, 'timeout', 'Koneksi terlalu lambat. Coba lagi.');
    } on http.ClientException {
      throw ApiException(0, 'network', 'Tidak ada koneksi ke server. Periksa sinyal Anda.');
    }
    final text = utf8.decode(res.bodyBytes);
    dynamic data;
    if (text.isNotEmpty) {
      try {
        data = jsonDecode(text);
      } on FormatException {
        data = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final err = data is Map ? data['error'] : null;
    final e = ApiException(
      res.statusCode,
      err is Map ? '${err['code']}' : 'error',
      err is Map && err['message'] is String ? err['message'] as String : 'Terjadi kesalahan. Coba lagi.',
    );
    if (e.isUnauthorized && token != null) onUnauthorized?.call();
    throw e;
  }
}
