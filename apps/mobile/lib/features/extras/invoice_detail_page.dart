import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Rincian satu tagihan SPP: jumlah, sisa, riwayat pembayaran, dan cara membayar.
/// Bisa dibuka dengan [invoice] yang sudah ada (tampil langsung sambil riwayat dimuat) atau hanya [invoiceId].
class InvoiceDetailPage extends StatelessWidget {
  const InvoiceDetailPage({super.key, this.invoice, this.invoiceId}) : assert(invoice != null || invoiceId != null, 'butuh invoice atau invoiceId');

  final Invoice? invoice;
  final String? invoiceId;

  String get _id => invoice?.id ?? invoiceId!;

  Future<({InvoiceDetail? detail, String? bank})> _load(ExtrasRepository repo) async {
    final all = await repo.invoiceDetails();
    final detail = all.where((d) => d.invoice.id == _id).firstOrNull;
    String? bank;
    try {
      bank = await repo.bankInfo();
    } on Object {
      // Info rekening hanya tambahan; tagihan tetap tampil tanpanya.
    }
    return (detail: detail, bank: bank);
  }

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Rincian tagihan')),
      body: LoadView<({InvoiceDetail? detail, String? bank})>(
        load: () => _load(repo),
        builder: (context, data) {
          final inv = data.detail?.invoice ?? invoice;
          if (inv == null) return const EmptyState('Tagihan tidak ditemukan.');
          return _Body(invoice: inv, payments: data.detail?.payments ?? const [], bank: data.bank);
        },
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.invoice, required this.payments, required this.bank});

  final Invoice invoice;
  final List<PaymentRecord> payments;
  final String? bank;

  (String, Color) _status(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (invoice.status) {
      'lunas' => ('Lunas', Brand.hadir),
      'dibatalkan' => ('Dibatalkan', scheme.outline),
      _ when invoice.overdue => ('Menunggak', Brand.alpa),
      'sebagian' => ('Sebagian', Brand.sakit),
      _ => ('Belum bayar', Brand.sakit),
    };
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = _status(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('SPP ${monthLabel(invoice.month)}', style: Theme.of(context).textTheme.titleMedium)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
                Text(invoice.playerName, style: TextStyle(color: scheme.outline)),
                const Divider(height: 24),
                _Line('Jumlah tagihan', rupiah(invoice.amount)),
                _Line('Sudah dibayar', rupiah(invoice.paid)),
                _Line('Sisa', rupiah(invoice.remaining), bold: true),
                _Line('Jatuh tempo', dayLabel(invoice.dueOn)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Riwayat pembayaran', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (payments.isEmpty) Text('Belum ada pembayaran tercatat.', style: TextStyle(color: scheme.outline)),
        for (final p in payments)
          Card(
            child: ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: Text(rupiah(p.amount), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text([dayLabel(p.paidOn), p.methodLabel, if (p.note != null && p.note!.isNotEmpty) p.note!].join(' · ')),
            ),
          ),
        const SizedBox(height: 16),
        if (invoice.open) ...[
          Text('Pembayaran dilakukan langsung ke SSB. Status berubah setelah admin SSB mencatat pembayaran Anda.', style: TextStyle(color: scheme.outline, fontSize: 13)),
          if (bank != null)
            Card(
              color: scheme.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Cara pembayaran', style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSecondaryContainer)),
                    const SizedBox(height: 4),
                    SelectableText(bank!, style: TextStyle(color: scheme.onSecondaryContainer)),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Expanded(child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.outline))),
            Text(value, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
          ],
        ),
      );
}
