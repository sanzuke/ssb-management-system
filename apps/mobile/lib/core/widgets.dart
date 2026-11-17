import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api.dart';
import 'config.dart';
import 'format.dart';
import 'models.dart';
import 'theme.dart';
import 'session.dart';

/// Memuat data async dengan indikator, pesan galat + "Coba lagi", dan tarik-untuk-muat-ulang.
/// [builder] harus mengembalikan widget yang bisa di-scroll (mis. ListView).
class LoadView<T> extends StatefulWidget {
  const LoadView({super.key, required this.load, required this.builder});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data) builder;

  @override
  State<LoadView<T>> createState() => LoadViewState<T>();
}

class LoadViewState<T> extends State<LoadView<T>> {
  late Future<T> _future = widget.load();

  Future<void> reload() {
    final f = widget.load();
    setState(() => _future = f);
    return f.then((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SkeletonList();
        }
        final Widget body;
        if (snap.hasError) {
          final e = snap.error;
          body = ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 48),
              Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: 12),
              Text(e is ApiException ? e.message : 'Data tidak bisa dimuat.', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              Center(child: FilledButton.tonal(onPressed: reload, child: const Text('Coba lagi'))),
            ],
          );
        } else {
          body = widget.builder(context, snap.data as T);
        }
        return RefreshIndicator(onRefresh: reload, child: body);
      },
    );
  }
}

/// Layar kosong dengan ikon dan teks yang tetap bisa ditarik untuk muat ulang.
class EmptyState extends StatelessWidget {
  const EmptyState(this.message, {super.key, this.icon = Icons.inbox_outlined});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.outline;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 56),
        Icon(icon, size: 56, color: Brand.garis),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center, style: TextStyle(color: c, fontSize: 15)),
      ],
    );
  }
}

/// Kerangka daftar saat data dimuat: menjaga tata letak tetap stabil dan terasa lebih cepat daripada spinner.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 5});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Memuat',
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Space.page),
        children: [
          for (var i = 0; i < count; i++)
            Container(
              height: 76,
              margin: const EdgeInsets.only(bottom: Space.gap),
              decoration: BoxDecoration(color: Brand.garis.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(Space.radius)),
            ),
        ],
      ),
    );
  }
}

/// Foto siswa dari API (butuh token) atau inisial bila belum ada foto.
class PlayerAvatar extends StatelessWidget {
  const PlayerAvatar({super.key, required this.id, required this.name, required this.photoV, this.radius = 22});

  final String id;
  final String name;
  final String? photoV;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final api = context.read<SessionController>().api;
    final scheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundImage: photoV == null ? null : NetworkImage('$apiUrl/players/$id/photo?v=$photoV', headers: api.authHeaders),
      onForegroundImageError: photoV == null ? null : (_, _) {},
      child: Text(initials(name), style: TextStyle(color: scheme.onPrimaryContainer, fontSize: radius * 0.7, fontWeight: FontWeight.w600)),
    );
  }
}

Color statusColor(BuildContext context, AttendanceStatus? s) => switch (s) {
      AttendanceStatus.hadir => Brand.hadir,
      AttendanceStatus.izin => Brand.izin,
      AttendanceStatus.sakit => Brand.sakit,
      AttendanceStatus.alpa => Brand.alpa,
      null => Theme.of(context).colorScheme.outline,
    };

IconData statusIcon(AttendanceStatus? s) => switch (s) {
      AttendanceStatus.hadir => Icons.check_circle,
      AttendanceStatus.izin => Icons.mail_outline,
      AttendanceStatus.sakit => Icons.healing,
      AttendanceStatus.alpa => Icons.cancel,
      null => Icons.radio_button_unchecked,
    };

/// Status kehadiran sebagai ikon + teks, supaya tidak hanya bergantung pada warna.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final AttendanceStatus? status;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(context, status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusIcon(status), size: 14, color: c),
          const SizedBox(width: 4),
          Text(status?.label ?? 'Belum dicatat', style: TextStyle(color: c, fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Info singkat satu sesi: "KU-10 · Lapangan A · 16:00".
String sessionLine({required String ageGroup, String? location, String? time}) => [ageGroup, ?location, if (time != null) 'jam $time'].join(' · ');

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

String errorText(Object e) => e is ApiException ? e.message : 'Terjadi kesalahan. Coba lagi.';
