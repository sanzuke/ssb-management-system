import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

class _HomeData {
  _HomeData(this.sessions, this.invoices);

  final List<GuardianSession> sessions;

  /// Null bila tagihan gagal dimuat; itu tidak boleh mengganggu beranda.
  final List<Invoice>? invoices;
}

/// Beranda orang tua: sesi berikutnya, tagihan SPP yang belum lunas, dan kehadiran terakhir.
class ParentHomePage extends StatelessWidget {
  const ParentHomePage({super.key, required this.onOpenInvoices});

  final VoidCallback onOpenInvoices;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final name = context.read<SessionController>().me?.name ?? '';
    return LoadView<_HomeData>(
      load: () async {
        final results = await Future.wait([repo.guardianSessions(), repo.invoices().then<List<Invoice>?>((v) => v, onError: (_) => null)]);
        return _HomeData(results[0] as List<GuardianSession>, results[1] as List<Invoice>?);
      },
      builder: (context, d) {
        final scheme = Theme.of(context).colorScheme;
        final upcoming = d.sessions.where((s) => s.date.compareTo(today()) >= 0).toList();
        final recent = d.sessions.where((s) => s.date.compareTo(today()) < 0).toList().reversed.take(5).toList();
        final open = (d.invoices ?? const <Invoice>[]).where((i) => i.open).toList();
        final overdue = open.where((i) => i.overdue).length;
        final sisa = open.fold<int>(0, (a, i) => a + i.remaining);
        final many = d.sessions.map((s) => s.playerId).toSet().length > 1;
        String detail(GuardianSession s) => [if (many) s.playerName, s.ageGroup.name, ?s.location?.name].join(', ');
        String when(GuardianSession s) => '${dayLabel(s.date)}${s.startTime != null ? ', jam ${s.startTime}' : ''}';

        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('Halo, ${name.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            if (open.isNotEmpty)
              Card(
                color: overdue > 0 ? scheme.errorContainer : scheme.secondaryContainer,
                child: ListTile(
                  leading: const Icon(Icons.receipt_long),
                  title: Text(overdue > 0 ? '$overdue tagihan SPP lewat jatuh tempo' : 'Ada tagihan SPP yang belum dibayar'),
                  subtitle: Text('Sisa ${rupiah(sisa)}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: onOpenInvoices,
                ),
              ),
            const SizedBox(height: 8),
            _heading(context, 'Latihan berikutnya'),
            if (upcoming.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Belum ada jadwal latihan.')),
            if (upcoming.isNotEmpty)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.event),
                  title: Text(when(upcoming.first), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${relativeDay(upcoming.first.date)} · ${detail(upcoming.first)}'),
                ),
              ),
            for (final s in upcoming.skip(1).take(3))
              ListTile(dense: true, leading: const Icon(Icons.event_outlined), title: Text(when(s)), subtitle: Text(detail(s))),
            const SizedBox(height: 16),
            _heading(context, 'Kehadiran terakhir'),
            if (recent.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Belum ada riwayat latihan.')),
            for (final s in recent)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(when(s)),
                subtitle: Text(detail(s)),
                trailing: StatusChip(s.status),
              ),
          ],
        );
      },
    );
  }

  Widget _heading(BuildContext context, String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.outline, fontWeight: FontWeight.w700)),
      );
}

/// Tagihan SPP anak: yang belum lunas di atas, lalu yang sudah lunas.
class InvoicesPage extends StatelessWidget {
  const InvoicesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return LoadView<List<Invoice>>(
      load: repo.invoices,
      builder: (context, all) {
        final list = all.where((i) => i.status != 'dibatalkan').toList();
        if (list.isEmpty) return const EmptyState('Belum ada tagihan SPP.');
        list.sort((a, b) {
          if (a.open != b.open) return a.open ? -1 : 1;
          return b.month.compareTo(a.month);
        });
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [for (final i in list) _InvoiceCard(i)],
        );
      },
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard(this.i);

  final Invoice i;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (i.status) {
      'lunas' => ('Lunas', const Color(0xFF2E7D32)),
      'sebagian' => (i.overdue ? 'Sebagian, terlambat' : 'Sebagian', const Color(0xFFEF6C00)),
      _ => (i.overdue ? 'Terlambat' : 'Belum bayar', i.overdue ? scheme.error : scheme.primary),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(monthLabel(i.month), style: Theme.of(context).textTheme.titleMedium)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                  child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
                ),
              ],
            ),
            Text(i.playerName, style: TextStyle(color: scheme.outline)),
            const SizedBox(height: 12),
            Text(i.open ? 'Sisa ${rupiah(i.remaining)}' : rupiah(i.amount), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            if (i.status == 'sebagian') Text('Dibayar ${rupiah(i.paid)} dari ${rupiah(i.amount)}', style: TextStyle(color: scheme.outline)),
            if (i.open) Text('Jatuh tempo ${shortDay(i.dueOn)}', style: TextStyle(color: i.overdue ? scheme.error : scheme.outline)),
          ],
        ),
      ),
    );
  }
}
