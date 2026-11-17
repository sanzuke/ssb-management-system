import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

String _longDate(String iso) => DateFormat('d MMMM yyyy', 'id_ID').format(parseDate(iso));

/// Waktu pembuatan (ISO UTC) menurut jam perangkat, supaya tidak mundur sehari di WIB.
String _createdDate(String iso) => DateFormat('d MMMM yyyy', 'id_ID').format(DateTime.parse(iso).toLocal());

Color _statusColor(BuildContext context, String status) => switch (status) {
      'aktif' || 'diterima' => Brand.hadir,
      'menunggu' => Brand.sakit,
      'ditolak' => Brand.alpa,
      _ => Theme.of(context).colorScheme.outline,
    };

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.text, this.status);

  final String text;
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = _statusColor(context, status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

/// Bilah dan ringkasan dana terkumpul. Tanpa bilah bila kampanye tidak punya target.
class FundProgress extends StatelessWidget {
  const FundProgress({super.key, required this.raised, required this.target, required this.supporters});

  final int raised;
  final int? target;
  final int supporters;

  @override
  Widget build(BuildContext context) {
    final percent = fundPercent(raised, target);
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (percent != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Semantics(
              label: 'Dana terkumpul $percent persen',
              child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: percent / 100, minHeight: 10)),
            ),
          ),
        Text.rich(
          TextSpan(children: [
            TextSpan(text: rupiah(raised), style: const TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: target == null ? ' terkumpul' : ' dari ${rupiah(target!)} ($percent%)'),
            TextSpan(text: ' · $supporters pendukung'),
          ]),
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
        ),
      ],
    );
  }
}

/// Daftar kampanye donasi yang aktif atau selesai.
class CampaignsPage extends StatelessWidget {
  const CampaignsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Donasi kegiatan')),
      body: LoadView<List<Campaign>>(
        load: repo.campaigns,
        builder: (context, list) {
          if (list.isEmpty) return const EmptyState('Belum ada kampanye donasi saat ini.');
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  'Galang dana untuk kegiatan akademi. Admin mengonfirmasi tiap sumbangan setelah transfer diterima.',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              for (final k in list) _CampaignCard(k),
            ],
          );
        },
      ),
    );
  }
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard(this.k);

  final Campaign k;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          final owner = context.findAncestorStateOfType<LoadViewState<List<Campaign>>>();
          context.push('/donasi/${k.id}').then((_) => owner?.reload());
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(k.title, style: Theme.of(context).textTheme.titleMedium)),
                  const SizedBox(width: 8),
                  _StatusPill(k.statusLabel, k.open ? 'aktif' : 'selesai'),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [
                  k.eventTitle == null ? 'Tidak terkait kegiatan' : 'Untuk: ${k.eventTitle}${k.eventDate == null ? '' : ' (${_longDate(k.eventDate!)})'}',
                  if (k.deadline != null) 'Sampai ${_longDate(k.deadline!)}',
                ].join(' · '),
                style: TextStyle(color: scheme.outline, fontSize: 13),
              ),
              if (k.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(k.description, maxLines: 3, overflow: TextOverflow.ellipsis)),
              const SizedBox(height: 12),
              FundProgress(raised: k.raised, target: k.target, supporters: k.supporters),
              const SizedBox(height: 8),
              Align(alignment: Alignment.centerRight, child: Text(k.open ? 'Lihat dan sumbang' : 'Lihat detail', style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600))),
            ],
          ),
        ),
      ),
    );
  }
}

/// Detail kampanye: ringkasan, cara transfer, formulir sumbangan, dan daftar pendukung.
class CampaignDetailPage extends StatelessWidget {
  const CampaignDetailPage({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Kampanye donasi')),
      body: LoadView<CampaignDetail>(
        load: () => repo.campaign(id),
        builder: (context, d) => _DetailBody(detail: d),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.detail});

  final CampaignDetail detail;

  @override
  Widget build(BuildContext context) {
    final c = detail.campaign;
    final scheme = Theme.of(context).colorScheme;
    final heading = Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Text(c.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
            const SizedBox(width: 8),
            _StatusPill(c.statusLabel, c.open ? 'aktif' : 'selesai'),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          [
            c.eventTitle == null ? 'Tidak terkait kegiatan' : 'Untuk: ${c.eventTitle}${c.eventDate == null ? '' : ' (${_longDate(c.eventDate!)})'}',
            if (c.deadline != null) 'Sampai ${_longDate(c.deadline!)}',
          ].join(' · '),
          style: TextStyle(color: scheme.outline, fontSize: 13),
        ),
        if (c.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(c.description)),
        const SizedBox(height: 16),
        FundProgress(raised: c.raised, target: c.target, supporters: c.supporters),
        const SizedBox(height: 24),
        Text('Menyumbang atau menjadi sponsor', style: heading),
        const SizedBox(height: 8),
        if (c.paymentInfo.isNotEmpty)
          Card(
            color: scheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Transfer ke:', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  SelectableText(c.paymentInfo),
                ],
              ),
            ),
          ),
        if (c.open)
          _PledgeForm(
            campaignId: c.id,
            onSaved: () {
              showMessage(context, 'Terima kasih. Sumbangan Anda tercatat dan menunggu konfirmasi admin setelah transfer diterima.');
              context.findAncestorStateOfType<LoadViewState<CampaignDetail>>()?.reload();
            },
          )
        else
          Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('Kampanye ini sedang tidak menerima sumbangan baru.', style: TextStyle(color: scheme.outline))),
        const SizedBox(height: 24),
        Text('Pendukung', style: heading),
        Text('Sumbangan yang sudah diterima, dan sumbangan Anda sendiri.', style: TextStyle(color: scheme.outline, fontSize: 13)),
        const SizedBox(height: 8),
        if (detail.pledges.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('Belum ada sumbangan.', style: TextStyle(color: scheme.outline))),
        for (final p in detail.pledges) _PledgeTile(p),
      ],
    );
  }
}

class _PledgeTile extends StatelessWidget {
  const _PledgeTile(this.p);

  final Pledge p;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${p.donorName ?? 'Anonim'}${p.mine ? ' (Anda)' : ''}${p.isAnonymous && p.mine ? ' · disembunyikan' : ''}', style: Theme.of(context).textTheme.titleSmall),
                ),
                Text(rupiah(p.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                _StatusPill(p.statusLabel, p.status),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [p.kind.label, if (p.packageName != null) p.packageName!, p.receivedOn != null ? _longDate(p.receivedOn!) : _createdDate(p.createdAt)].join(' · '),
                    style: TextStyle(color: scheme.outline, fontSize: 12),
                  ),
                ),
              ],
            ),
            if (p.message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('“${p.message}”', style: TextStyle(color: scheme.onSurfaceVariant))),
          ],
        ),
      ),
    );
  }
}

/// Formulir sumbangan anggota: jenis, nominal, pesan, anonim. Hasilnya menunggu konfirmasi admin.
class _PledgeForm extends StatefulWidget {
  const _PledgeForm({required this.campaignId, required this.onSaved});

  final String campaignId;
  final VoidCallback onSaved;

  @override
  State<_PledgeForm> createState() => _PledgeFormState();
}

class _PledgeFormState extends State<_PledgeForm> {
  final _amount = TextEditingController();
  final _message = TextEditingController();
  PledgeKind _kind = PledgeKind.donasi;
  bool _anonymous = false;
  bool _busy = false;
  String? _amountError;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = parseAmount(_amount.text);
    if (amount == null) {
      setState(() => _amountError = 'Isi nominal dalam rupiah.');
      return;
    }
    setState(() {
      _busy = true;
      _amountError = null;
      _error = null;
    });
    try {
      await ExtrasRepository.of(context).pledge(widget.campaignId, kind: _kind, amount: amount, message: _message.text.trim(), isAnonymous: _anonymous);
      if (!mounted) return;
      _amount.clear();
      _message.clear();
      setState(() => _anonymous = false);
      widget.onSaved();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Isi formulir setelah Anda mentransfer. Sumbangan dihitung setelah admin mengonfirmasi.', style: TextStyle(color: scheme.outline, fontSize: 13)),
          const SizedBox(height: 12),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: scheme.error))),
          SegmentedButton<PledgeKind>(
            segments: [for (final k in PledgeKind.values) ButtonSegment(value: k, label: Text(k.label))],
            selected: {_kind},
            onSelectionChanged: _busy ? null : (s) => setState(() => _kind = s.first),
          ),
          if (_kind == PledgeKind.sponsor)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text('Pilih Sponsor bila menyumbang sebagai perusahaan atau pendukung utama kegiatan.', style: TextStyle(color: scheme.outline, fontSize: 12))),
          const SizedBox(height: 12),
          TextField(
            controller: _amount,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: 'Nominal, rupiah', prefixText: 'Rp ', border: const OutlineInputBorder(), errorText: _amountError),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _message,
            enabled: !_busy,
            maxLength: 300,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Pesan (boleh dikosongkan)', border: OutlineInputBorder()),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _anonymous,
            onChanged: _busy ? null : (v) => setState(() => _anonymous = v),
            title: const Text('Sembunyikan nama dari anggota lain'),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim sumbangan'),
            ),
          ),
        ],
      ),
    );
  }
}
