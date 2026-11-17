import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

/// Nomor WhatsApp seperti di `whatsappSchema` (packages/shared): spasi, strip, dan kurung dibuang,
/// awalan "+" dibuang, harus 8 sampai 15 angka. Null bila tidak valid.
String? normalizeWhatsapp(String input) {
  final s = input.trim().replaceAll(RegExp(r'[\s().-]'), '');
  return RegExp(r'^\+?\d{8,15}$').hasMatch(s) ? s.replaceFirst(RegExp(r'^\+'), '') : null;
}

/// Kerangka dialog dengan status kirim dan galat; [submit] mengembalikan true bila dialog boleh ditutup.
class _FormDialog extends StatefulWidget {
  const _FormDialog({required this.title, required this.confirmLabel, required this.builder, required this.submit, this.controllers = const [], this.destructive = false});

  final String title;
  final String confirmLabel;
  final bool destructive;

  /// Dibuang bersama dialog (bukan saat showDialog selesai: animasi tutup masih memakainya).
  final List<TextEditingController> controllers;
  final Widget Function(BuildContext context) builder;
  final Future<void> Function(BuildContext context) submit;

  @override
  State<_FormDialog> createState() => _FormDialogState();
}

class _FormDialogState extends State<_FormDialog> {
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in widget.controllers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _go() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(context);
      if (mounted) Navigator.pop(context, true);
    } on _Invalid catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _message(Object e) {
    if (e is ApiException && e.code == 'sole_admin') {
      return 'Anda satu-satunya admin di suatu SSB. Tunjuk admin lain lewat web sebelum menghapus akun.';
    }
    return errorText(e);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            widget.builder(context),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context, false), child: const Text('Batal')),
        FilledButton(
          onPressed: _busy ? null : _go,
          style: widget.destructive ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError) : null,
          child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Validasi sisi klien; pesannya tampil di dialog tanpa memanggil API.
class _Invalid implements Exception {
  _Invalid(this.message);

  final String message;
}

/// Mengubah nomor WhatsApp di SSB aktif (`PATCH /me`). Kosong menghapus nomor.
class WhatsappDialog {
  static Future<bool> show(BuildContext context, {String? current}) async {
    final field = TextEditingController(text: current ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _FormDialog(
        title: 'Nomor WhatsApp',
        controllers: [field],
        confirmLabel: 'Simpan',
        builder: (_) => TextField(
          controller: field,
          autofocus: true,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Nomor WhatsApp', hintText: '081234567890', helperText: 'Kosongkan untuk menghapus', border: OutlineInputBorder()),
        ),
        submit: (c) async {
          final raw = field.text.trim();
          final value = raw.isEmpty ? null : normalizeWhatsapp(raw);
          if (raw.isNotEmpty && value == null) throw _Invalid('Nomor WhatsApp tidak valid (8 sampai 15 angka).');
          final api = c.read<ApiClient>();
          final session = c.read<SessionController>();
          await api.patch('/me', {'whatsapp': value});
          await session.refresh();
        },
      ),
    );
    return ok ?? false;
  }
}

/// Mengganti kata sandi (`POST /auth/change-password`). Akun yang hanya login Google boleh langsung menambahkannya.
class ChangePasswordDialog {
  static Future<bool> show(BuildContext context) async {
    final session = context.read<SessionController>();
    final hasPassword = session.hasPassword;
    final current = TextEditingController();
    final next = TextEditingController();
    final again = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _FormDialog(
        title: hasPassword ? 'Ganti kata sandi' : 'Buat kata sandi',
        confirmLabel: 'Simpan',
        controllers: [current, next, again],
        builder: (_) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasPassword) ...[
              TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Kata sandi saat ini', border: OutlineInputBorder())),
              const SizedBox(height: 12),
            ],
            TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'Kata sandi baru', helperText: 'Minimal 10 karakter', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: again, obscureText: true, decoration: const InputDecoration(labelText: 'Ulangi kata sandi baru', border: OutlineInputBorder())),
          ],
        ),
        submit: (c) async {
          if (hasPassword && current.text.isEmpty) throw _Invalid('Isi kata sandi saat ini.');
          if (next.text.length < 10) throw _Invalid('Kata sandi baru minimal 10 karakter.');
          if (next.text.length > 200) throw _Invalid('Kata sandi baru maksimal 200 karakter.');
          if (next.text != again.text) throw _Invalid('Kata sandi baru dan ulangannya tidak sama.');
          final api = c.read<ApiClient>();
          await api.post('/auth/change-password', {if (hasPassword) 'currentPassword': current.text, 'newPassword': next.text});
          await session.refresh();
        },
      ),
    );
    return ok ?? false;
  }
}

/// Menghapus akun sendiri (`POST /auth/delete-account`), dikonfirmasi dengan kata sandi
/// (atau email untuk akun yang hanya login Google).
class DeleteAccountDialog {
  static Future<bool> show(BuildContext context) async {
    final session = context.read<SessionController>();
    final hasPassword = session.hasPassword;
    final confirm = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _FormDialog(
        title: 'Hapus akun?',
        confirmLabel: 'Hapus akun',
        destructive: true,
        controllers: [confirm],
        builder: (_) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Akun dan keanggotaan Anda dihapus dan tidak bisa dikembalikan. Untuk melanjutkan, konfirmasi dengan ${hasPassword ? 'kata sandi' : 'email'} Anda.'),
            const SizedBox(height: 12),
            TextField(
              controller: confirm,
              obscureText: hasPassword,
              keyboardType: hasPassword ? TextInputType.text : TextInputType.emailAddress,
              decoration: InputDecoration(labelText: hasPassword ? 'Kata sandi' : 'Ketik email Anda', border: const OutlineInputBorder()),
            ),
          ],
        ),
        submit: (c) async {
          if (confirm.text.isEmpty) throw _Invalid(hasPassword ? 'Isi kata sandi.' : 'Ketik email Anda.');
          await session.deleteAccount(confirm.text);
        },
      ),
    );
    return ok ?? false;
  }
}
