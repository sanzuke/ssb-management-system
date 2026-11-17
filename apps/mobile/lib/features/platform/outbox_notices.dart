import 'package:flutter/material.dart';

import '../../core/outbox.dart';
import 'messenger.dart';

/// Mengambil pesan galat dari [Outbox] (perubahan yang ditolak server saat dikirim ulang di latar),
/// menampilkannya sekali sebagai pesan singkat, dan menyimpannya agar masih bisa dibaca di Akun.
class OutboxNotices extends ChangeNotifier {
  OutboxNotices(this._outbox) {
    _outbox.addListener(_onChange);
  }

  static const _keep = 10;

  final Outbox _outbox;

  /// Terbaru di depan.
  final List<String> recent = [];

  void _onChange() {
    final fresh = _outbox.takeFailures();
    if (fresh.isEmpty) return;
    recent.insertAll(0, fresh);
    if (recent.length > _keep) recent.removeRange(_keep, recent.length);
    final more = fresh.length > 1 ? ' (+${fresh.length - 1} lainnya)' : '';
    rootMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('Perubahan tidak terkirim: ${fresh.first}$more'), duration: const Duration(seconds: 8)));
    notifyListeners();
  }

  void clear() {
    if (recent.isEmpty) return;
    recent.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _outbox.removeListener(_onChange);
    super.dispose();
  }
}
