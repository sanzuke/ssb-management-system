import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repo_extras.dart';
import '../../core/repository.dart';
import '../../core/session.dart';
import 'kid_selection.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

class _HomeData {
  _HomeData(this.kids, this.attendance, this.sessions, this.invoices);

  final List<PlayerSummary> kids;
  final List<AttendanceRow> attendance;
  final List<GuardianSession> sessions;

  /// Null bila tagihan gagal dimuat; itu tidak boleh mengganggu beranda.
  final List<Invoice>? invoices;
}

/// Salam menurut jam perangkat; dini hari (00-03) masih "malam".
String _salam() {
  final h = DateTime.now().hour;
  if (h < 4) return 'Selamat malam';
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/// Beranda orang tua mengikuti desain "Garuda Muda Dossier": kartu anak dengan tombol Lihat rapor dan
/// Kartu pemain, jadwal terdekat dengan tombol Ajukan izin, lalu riwayat sesi dan tagihan SPP.
class ParentHomePage extends StatelessWidget {
  const ParentHomePage({super.key, required this.onOpenInvoices});

  final VoidCallback onOpenInvoices;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final name = context.read<SessionController>().me?.name ?? '';
    final selection = context.watch<KidSelection>();
    return LoadView<_HomeData>(
      load: () async {
        final r = await Future.wait<Object?>([
          repo.players(),
          repo.attendanceSummary().then<List<AttendanceRow>>((v) => v, onError: (_) => <AttendanceRow>[]),
          repo.guardianSessions(),
          repo.invoices().then<List<Invoice>?>((v) => v, onError: (_) => null),
        ]);
        return _HomeData(r[0]! as List<PlayerSummary>, r[1]! as List<AttendanceRow>, r[2]! as List<GuardianSession>, r[3] as List<Invoice>?);
      },
      builder: (context, d) {
        final scheme = Theme.of(context).colorScheme;
        final many = d.kids.length > 1;
        final kid = d.kids.isEmpty ? null : selection.pick(d.kids);
        // Dengan beberapa anak, jadwal dan riwayat hanya untuk anak yang dipilih.
        bool mine(GuardianSession s) => !many || s.playerId == kid?.id;
        final upcoming = d.sessions.where((s) => mine(s) && s.date.compareTo(today()) >= 0).toList();
        final recent = d.sessions.where((s) => mine(s) && s.date.compareTo(today()) < 0).toList().reversed.take(5).toList();
        final open = (d.invoices ?? const <Invoice>[]).where((i) => i.open).toList();
        final overdue = open.where((i) => i.overdue).length;
        final sisa = open.fold<int>(0, (a, i) => a + i.remaining);

        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 24),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${_salam()}, ${name.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  if (d.kids.isNotEmpty)
                    Text(many ? 'Wali dari ${d.kids.map((k) => k.fullName.split(' ').first).join(' dan ')}' : 'Wali dari ${d.kids.first.fullName}', style: TextStyle(color: scheme.outline)),
                ],
              ),
            ),
            const SizedBox(height: 12),
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
            if (d.kids.isNotEmpty) ...[
              KidChips(
                kids: kidOptions(d.kids),
                selectedId: kid!.id,
                onSelect: (id) => selection.select(id!),
                padding: const EdgeInsets.only(bottom: 8),
              ),
              _KidCard(kid: kid, stat: d.attendance.where((a) => a.playerId == kid.id).firstOrNull),
            ],
            if (upcoming.isNotEmpty) _NextSession(upcoming.first, many: false, laterCount: upcoming.length - 1),
            _Heading('Riwayat sesi terakhir'),
            if (recent.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('Belum ada riwayat latihan.')),
            if (recent.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(children: [for (final s in recent) _HistoryRow(s, many: false)]),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
        child: Text(text, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
      );
}

/// Kartu anak: foto, nomor, nama, KU, persentase kehadiran, lalu tombol Lihat rapor dan Kartu pemain.
class _KidCard extends StatelessWidget {
  const _KidCard({required this.kid, required this.stat});

  final PlayerSummary kid;
  final AttendanceRow? stat;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pct = stat?.percent;
    final tertib = pct != null && pct >= 80;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                PlayerAvatar(id: kid.id, name: kid.fullName, photoV: kid.photoV, radius: 34),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (kid.memberNo != null) Text(kid.memberNo!, style: TextStyle(color: scheme.outline, fontSize: 13, fontWeight: FontWeight.w600)),
                      Text(kid.fullName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                      Text([?(kid.ageGroup == null ? null : kuShort(kid.ageGroup!.name)), '${ageOf(kid.birthDate)} tahun'].join(' · '), style: TextStyle(color: scheme.outline)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: scheme.surfaceContainer, borderRadius: BorderRadius.circular(Space.radius)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Kehadiran', style: TextStyle(color: scheme.outline, fontSize: 13)),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(pct == null ? '-' : pct.toStringAsFixed(pct == pct.roundToDouble() ? 0 : 1).replaceAll('.', ','), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, height: 1.1)),
                      if (pct != null) const Padding(padding: EdgeInsets.only(bottom: 4, left: 2), child: Text('%', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                      const Spacer(),
                      if (tertib)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: Brand.rumput, borderRadius: BorderRadius.circular(20)),
                          child: const Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.verified_outlined, size: 14, color: Colors.white),
                            SizedBox(width: 4),
                            Text('Tertib hadir', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                          ]),
                        ),
                    ],
                  ),
                  Text(stat == null || stat!.recorded == 0 ? 'Belum ada catatan' : '${stat!.hadir} dari ${stat!.recorded} sesi', style: TextStyle(color: scheme.outline, fontSize: 13)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    style: ledgerButton(),
                    onPressed: () => context.push('/siswa/${kid.id}/rapor'),
                    icon: const Icon(Icons.menu_book_outlined, size: 20),
                    label: const Text('Lihat rapor'),
                  ),
                ),
                const SizedBox(width: Space.gap),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/kartu/${kid.id}'),
                    icon: const Icon(Icons.badge_outlined, size: 20),
                    label: const Text('Kartu pemain'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Space.gap),
            Center(
              child: TextButton(
                onPressed: () => context.push('/siswa/${kid.id}', extra: kid),
                child: const Text('Lihat profil lengkap'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Latihan terdekat dalam kartu kuning, dengan tombol Ajukan izin.
class _NextSession extends StatelessWidget {
  const _NextSession(this.s, {required this.many, required this.laterCount});

  final GuardianSession s;
  final bool many;
  final int laterCount;

  @override
  Widget build(BuildContext context) {
    const ink = Brand.tinta;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.gap),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Brand.kuning, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.sports_soccer, size: 20, color: ink),
              const SizedBox(width: 8),
              const Expanded(child: Text('JADWAL LATIHAN TERDEKAT', style: TextStyle(color: ink, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.6))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Text(relativeDay(s.date), style: const TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Space.radius)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dayLabel(s.date), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                if (s.startTime != null) Text('Pukul ${s.startTime}', style: const TextStyle(color: Brand.redup)),
                const SizedBox(height: 10),
                if (s.location != null) _Line(Icons.place_outlined, s.location!.name),
                _Line(Icons.groups_outlined, many ? '${s.playerName} · ${kuShort(s.ageGroup.name)}' : kuShort(s.ageGroup.name)),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/izin'),
                    icon: const Icon(Icons.event_busy_outlined, size: 20),
                    label: const Text('Ajukan izin'),
                  ),
                ),
              ],
            ),
          ),
          if (laterCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8, left: 4),
              child: Text('$laterCount jadwal lagi setelah ini', style: const TextStyle(color: ink, fontSize: 13)),
            ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(children: [Icon(icon, size: 18, color: Brand.redup), const SizedBox(width: 8), Expanded(child: Text(text))]),
      );
}

/// Satu baris riwayat: lingkaran status, tanggal, dan lencana status.
class _HistoryRow extends StatelessWidget {
  const _HistoryRow(this.s, {required this.many});

  final GuardianSession s;
  final bool many;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(context, s.status);
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerLow, borderRadius: BorderRadius.circular(Space.radius)),
      child: Row(
        children: [
          CircleAvatar(radius: 20, backgroundColor: c, child: Icon(statusIcon(s.status), color: Colors.white, size: 20)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dayLabel(s.date), style: const TextStyle(fontWeight: FontWeight.w700)),
                Text([if (many) s.playerName, kuShort(s.ageGroup.name), ?s.location?.name].join(' · '), style: const TextStyle(color: Brand.redup, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          StatusChip(s.status),
        ],
      ),
    );
  }
}

class _SppData {
  _SppData(this.invoices, this.bank);

  final List<Invoice> invoices;
  final String? bank;
}

/// Menu SPP orang tua: ringkasan yang harus dibayar, cara pembayaran (info rekening dari admin SSB),
/// lalu daftar tagihan. Pembayaran dicatat admin setelah transfer, jadi statusnya berubah di sini setelah dicatat.
class InvoicesPage extends StatefulWidget {
  const InvoicesPage({super.key});

  @override
  State<InvoicesPage> createState() => _InvoicesPageState();
}

class _InvoicesPageState extends State<InvoicesPage> {
  /// Anak yang disaring; null = semua anak.
  String? _kidId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final extras = ExtrasRepository.of(context);
    return LoadView<_SppData>(
      load: () async {
        final invoices = await repo.invoices();
        String? bank;
        try {
          bank = await extras.bankInfo();
        } on Object {
          // Info rekening hanya tambahan; tagihan tetap tampil tanpanya.
        }
        return _SppData(invoices, bank);
      },
      builder: (context, data) {
        final all = data.invoices.where((i) => i.status != 'dibatalkan').toList();
        // Anak yang punya tagihan, untuk saringan chip (hanya muncul bila lebih dari satu).
        final kids = <String, String>{for (final i in all) if (i.playerId.isNotEmpty) i.playerId: i.playerName};
        final filter = kids.containsKey(_kidId) ? _kidId : null;
        final list = all.where((i) => filter == null || i.playerId == filter).toList();
        list.sort((a, b) {
          if (a.open != b.open) return a.open ? -1 : 1;
          return b.month.compareTo(a.month);
        });
        final open = list.where((i) => i.open).toList();
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(12),
          children: [
            KidChips(
              kids: [for (final e in kids.entries) (id: e.key, name: e.value)],
              selectedId: filter,
              allLabel: 'Semua anak',
              onSelect: (id) => setState(() => _kidId = id),
              padding: const EdgeInsets.only(bottom: 8),
            ),
            if (list.isEmpty)
              const Card(child: ListTile(leading: Icon(Icons.receipt_long_outlined), title: Text('Belum ada tagihan SPP'), subtitle: Text('Tagihan bulanan akan muncul di sini setelah dibuat admin SSB.')))
            else
              _SppSummary(open),
            _HowToPay(data.bank),
            if (list.isNotEmpty) const _Heading('Daftar tagihan'),
            for (final i in list) _InvoiceCard(i),
          ],
        );
      },
    );
  }
}

/// Ringkasan di atas: total sisa, jumlah tunggakan, dan jatuh tempo terdekat; atau pesan lunas.
class _SppSummary extends StatelessWidget {
  const _SppSummary(this.open);

  final List<Invoice> open;

  @override
  Widget build(BuildContext context) {
    if (open.isEmpty) {
      return Container(
        margin: const EdgeInsets.only(bottom: Space.gap),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Brand.hadir.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16), border: Border.all(color: Brand.hadir.withValues(alpha: 0.4))),
        child: const Row(
          children: [
            Icon(Icons.check_circle, color: Brand.hadir, size: 32),
            SizedBox(width: 12),
            Expanded(child: Text('Semua tagihan SPP sudah lunas. Terima kasih!', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
          ],
        ),
      );
    }
    final sisa = open.fold<int>(0, (a, i) => a + i.remaining);
    final overdue = open.where((i) => i.overdue).length;
    final nearest = (open.toList()..sort((a, b) => a.dueOn.compareTo(b.dueOn))).first;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.gap),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.rumputTua, Brand.rumput]),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('TOTAL YANG HARUS DIBAYAR', style: TextStyle(color: Brand.kuning, fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Text(rupiah(sisa), style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _Pill('${open.length} tagihan', Colors.white.withValues(alpha: 0.18), Colors.white),
              if (overdue > 0) _Pill('$overdue menunggak', Brand.merahMuda, Brand.merah) else _Pill('Jatuh tempo ${shortDay(nearest.dueOn)}', Brand.kuning, Brand.tinta),
            ],
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, this.bg, this.fg);

  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
      );
}

/// Cara membayar: info rekening yang diisi admin SSB, dengan tombol salin.
class _HowToPay extends StatelessWidget {
  const _HowToPay(this.bank);

  final String? bank;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final info = bank?.trim();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(children: [Icon(Icons.account_balance_outlined, size: 20), SizedBox(width: 8), Text('Cara pembayaran', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800))]),
            const SizedBox(height: 10),
            if (info == null || info.isEmpty)
              Text('Info rekening belum diisi. Hubungi admin SSB untuk cara membayar.', style: TextStyle(color: scheme.outline))
            else ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: scheme.surfaceContainer, borderRadius: BorderRadius.circular(Space.radius)),
                child: SelectableText(info, style: const TextStyle(fontSize: 15, height: 1.4)),
              ),
              const SizedBox(height: Space.gap),
              OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: info));
                  if (context.mounted) showMessage(context, 'Info rekening disalin');
                },
                icon: const Icon(Icons.copy, size: 18),
                label: const Text('Salin info rekening'),
              ),
            ],
            const SizedBox(height: 10),
            Text('Setelah transfer, admin SSB mencatat pembayaran Anda. Status tagihan akan berubah di sini setelah dicatat.', style: TextStyle(color: scheme.outline, fontSize: 13)),
          ],
        ),
      ),
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
      'lunas' => ('Lunas', Brand.hadir),
      'sebagian' => (i.overdue ? 'Sebagian, terlambat' : 'Sebagian', Brand.sakit),
      _ => (i.overdue ? 'Terlambat' : 'Belum bayar', i.overdue ? scheme.error : scheme.primary),
    };
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/tagihan/${i.id}', extra: i),
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
                    child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
                  ),
                ],
              ),
              Text(i.playerName, style: TextStyle(color: scheme.outline)),
              const SizedBox(height: 12),
              Text(i.open ? 'Sisa ${rupiah(i.remaining)}' : rupiah(i.amount), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              if (i.status == 'sebagian') Text('Dibayar ${rupiah(i.paid)} dari ${rupiah(i.amount)}', style: TextStyle(color: scheme.outline)),
              if (i.open) Text('Jatuh tempo ${shortDay(i.dueOn)}', style: TextStyle(color: i.overdue ? scheme.error : scheme.outline)),
            ],
          ),
        ),
      ),
    );
  }
}
