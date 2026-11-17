import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_players.dart';
import 'player_widgets.dart';

Color _groupColor(BadgeGroup? g) => switch (g) {
      BadgeGroup.teknik => const Color(0xFF1565C0),
      BadgeGroup.fisik => const Color(0xFFEF6C00),
      BadgeGroup.mental => const Color(0xFF6A1B9A),
      BadgeGroup.sikap => const Color(0xFF2E7D32),
      null => const Color(0xFF546E7A),
    };

/// Lencana aktif. [onAward] dan [onRevoke] null untuk yang tidak boleh mengubah (orang tua, korlas).
class BadgesSection extends StatelessWidget {
  const BadgesSection({super.key, required this.badges, this.onAward, this.onRevoke});

  final List<PlayerBadge> badges;
  final VoidCallback? onAward;
  final ValueChanged<PlayerBadge>? onRevoke;

  @override
  Widget build(BuildContext context) {
    // Orang tua dan korlas tanpa lencana tidak perlu bagian kosong; pelatih tetap melihat tombol beri.
    if (badges.isEmpty && onAward == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          'Lencana',
          trailing: onAward == null ? null : TextButton.icon(onPressed: onAward, icon: const Icon(Icons.add), label: const Text('Beri lencana')),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: badges.isEmpty
                ? Text('Belum ada lencana.', style: TextStyle(color: scheme.outline))
                : Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      for (final b in badges)
                        Tooltip(
                          message: '${b.group?.label ?? ''}. Diberikan ${dateText(b.awardedAt)}${b.awardedBy == null ? '' : ' oleh ${b.awardedBy}'}',
                          child: InputChip(
                            avatar: Icon(Icons.military_tech, size: 18, color: _groupColor(b.group)),
                            label: Text(b.label),
                            side: BorderSide(color: _groupColor(b.group).withValues(alpha: 0.5)),
                            onDeleted: onRevoke == null ? null : () => onRevoke!(b),
                            deleteButtonTooltipMessage: 'Cabut lencana ${b.label}',
                          ),
                        ),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

/// Cedera yang berjalan dan riwayatnya. Data kesehatan anak: server hanya mengirimnya ke yang berhak.
class InjuriesSection extends StatelessWidget {
  const InjuriesSection({super.key, required this.injuries, this.onAdd, this.onEdit, this.onRecover});

  final List<PlayerInjury> injuries;
  final VoidCallback? onAdd;
  final ValueChanged<PlayerInjury>? onEdit;
  final ValueChanged<PlayerInjury>? onRecover;

  @override
  Widget build(BuildContext context) {
    if (injuries.isEmpty && onAdd == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final ongoing = [for (final i in injuries) if (i.ongoing) i];
    final past = [for (final i in injuries) if (!i.ongoing) i];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          'Cedera',
          trailing: onAdd == null ? null : TextButton.icon(onPressed: onAdd, icon: const Icon(Icons.add), label: const Text('Catat cedera')),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (ongoing.isEmpty) Text('Tidak ada cedera yang sedang berjalan.', style: TextStyle(color: scheme.outline)),
                for (final i in ongoing)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.healing, size: 18, color: scheme.error),
                            const SizedBox(width: 6),
                            Expanded(child: Text(bodyPartLabel(i.bodyPart), style: const TextStyle(fontWeight: FontWeight.w700))),
                          ],
                        ),
                        Text(
                          'Sejak ${dateText(i.startedOn)}, ${i.expectedReturnOn == null ? 'perkiraan pulih belum ditentukan' : 'perkiraan pulih ${dateText(i.expectedReturnOn!)}'}',
                          style: TextStyle(color: scheme.outline, fontSize: 13),
                        ),
                        if (i.note != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(i.note!)),
                        if (onEdit != null || onRecover != null)
                          Wrap(
                            spacing: 8,
                            children: [
                              if (onEdit != null) OutlinedButton(onPressed: () => onEdit!(i), child: const Text('Ubah')),
                              if (onRecover != null) FilledButton.tonal(onPressed: () => onRecover!(i), child: const Text('Tandai pulih')),
                            ],
                          ),
                      ],
                    ),
                  ),
                if (past.isNotEmpty)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text('Riwayat cedera (${past.length})', style: const TextStyle(fontSize: 14)),
                    children: [
                      for (final i in past)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(bodyPartLabel(i.bodyPart)),
                          subtitle: Text('${dateText(i.startedOn)} sampai ${dateText(i.recoveredOn!)}${i.note == null ? '' : '\n${i.note}'}'),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Indeks nilai: staf melihat angka dan rincian komponen, orang tua hanya kategori per periode.
class MviSection extends StatelessWidget {
  const MviSection({super.key, required this.view});

  final MviView? view;

  @override
  Widget build(BuildContext context) {
    final v = view;
    if (v == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    if (!v.staff) {
      if (v.items.isEmpty) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('Indeks nilai'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final i in v.items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: [
                        Expanded(child: Text(i.periodName, style: const TextStyle(fontWeight: FontWeight.w600))),
                        Chip(label: Text(i.category ?? '-'), visualDensity: VisualDensity.compact),
                      ]),
                    ),
                  Text('Gambaran perkembangan dibanding teman satu KU, dari penilaian pelatih dan data lain. Bukan peringkat resmi.', style: TextStyle(color: scheme.outline, fontSize: 12)),
                ],
              ),
            ),
          ),
        ],
      );
    }
    if (v.items.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('Indeks nilai'),
          Card(child: Padding(padding: const EdgeInsets.all(14), child: Text('Belum dihitung. Hitung dari web setelah penilaian, statistik laga, atau tes kebugaran diisi.', style: TextStyle(color: scheme.outline)))),
        ],
      );
    }
    final latest = v.items.first;
    final missing = [for (final c in latest.components) if (c.score == null) c.label.toLowerCase()];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle('Indeks nilai · ${latest.periodName}'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (latest.mvi == null)
                  Text('Data belum cukup untuk indeks. Perlu penilaian pelatih dan minimal satu dari statistik laga atau tes kebugaran. Yang belum ada: ${missing.join(', ')}.', style: TextStyle(color: scheme.outline))
                else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(scoreText(latest.mvi!), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 6),
                      Text('dari 100', style: TextStyle(color: scheme.outline)),
                      const Spacer(),
                      if (latest.category != null) Chip(label: Text(latest.category!), visualDensity: VisualDensity.compact),
                    ],
                  ),
                if (latest.coverage != null) Text('${latest.ageGroupName ?? ''} · data terisi ${latest.coverage}%', style: TextStyle(color: scheme.outline, fontSize: 12)),
                const SizedBox(height: 8),
                for (final c in latest.components)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${c.label} · bobot ${c.weight}%', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        if (c.score != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: c.score! / 100, minHeight: 6)),
                          ),
                        Text('${c.score == null ? 'Belum ada' : scoreText(c.score!)} · ${c.detail}', style: TextStyle(color: scheme.outline, fontSize: 12)),
                      ],
                    ),
                  ),
                if (v.items.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Periode sebelumnya: ${v.items.skip(1).map((i) => '${i.periodName} ${i.mvi == null ? 'belum cukup data' : scoreText(i.mvi!)}${i.category == null ? '' : ' (${i.category})'}').join(' · ')}',
                      style: TextStyle(color: scheme.outline, fontSize: 12),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Relatif terhadap teman satu KU, bukan harga atau ramalan.', style: TextStyle(color: scheme.outline, fontSize: 12)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Kehadiran siswa dari ringkasan absensi.
class AttendanceSection extends StatelessWidget {
  const AttendanceSection({super.key, required this.row});

  final AttendanceRow? row;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final r = row;
    final percent = r?.percent;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('Kehadiran'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: percent == null
                ? Text('Belum ada catatan kehadiran.', style: TextStyle(color: scheme.outline))
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${scoreText(percent)}%', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                      Text('${r!.hadir} hadir dari ${r.recorded} sesi tercatat', style: TextStyle(color: scheme.outline)),
                      const SizedBox(height: 8),
                      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: percent / 100, minHeight: 8)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

/// Data lengkap siswa (padanan blok "Data" di web, tanpa data wali yang hanya untuk admin).
class PlayerInfoCard extends StatelessWidget {
  const PlayerInfoCard({super.key, required this.player});

  final PlayerDetail player;

  @override
  Widget build(BuildContext context) {
    final s = player.summary;
    final rows = <(String, String)>[
      ('ID siswa', s.memberNo ?? '-'),
      ('NISN', player.nisn ?? '-'),
      ('Tempat, tanggal lahir', '${player.birthPlace == null ? '' : '${player.birthPlace}, '}${dateText(s.birthDate)}'),
      ('Usia', '${ageOf(s.birthDate)} tahun'),
      ('KU', s.ageGroup?.name ?? 'Belum ditentukan'),
      ('Posisi', s.position == null ? 'Belum ditentukan' : positionLabel[s.position] ?? s.position!),
      ('No. punggung', player.jerseyNo?.toString() ?? '-'),
      ('Ukuran jersey', player.jerseySize ?? '-'),
      ('Ukuran sepatu', player.shoeSize?.toString() ?? '-'),
      ('Tinggi badan', player.heightCm == null ? '-' : '${player.heightCm} cm'),
      ('Berat badan', player.weightKg == null ? '-' : '${scoreText(player.weightKg!)} kg'),
      ('Orang tua', player.guardianName ?? '-'),
      ('Catatan medis', player.medicalNote ?? '-'),
      ('Sekolah', player.school ?? '-'),
      ('Status', playerStatusLabel[player.status] ?? player.status),
    ];
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('Data siswa'),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              children: [
                for (final (label, value) in rows)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 4, child: Text(label, style: TextStyle(color: scheme.outline, fontSize: 13))),
                        Expanded(flex: 5, child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
