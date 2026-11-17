import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/config.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/session.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

/// Kartu anggota siswa dengan kode QR; isi QR sama dengan kartu di web (alamat profil siswa).
class PlayerCardPage extends StatelessWidget {
  const PlayerCardPage({super.key, required this.playerId, this.embedded = false});

  final String playerId;

  /// Tanpa bilah judul sendiri, saat dipakai sebagai isi tab.
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    final ssbName = context.read<SessionController>().me?.active?.ssbName ?? '';
    return Scaffold(
      appBar: embedded ? null : AppBar(title: const Text('Kartu siswa')),
      body: LoadView<PlayerCard>(
        load: () => repo.playerCard(playerId),
        builder: (context, p) {
          final scheme = Theme.of(context).colorScheme;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 4),
              Card(
                clipBehavior: Clip.antiAlias,
                elevation: 2,
                child: Column(
                  children: [
                    Container(
                      color: Brand.rumput,
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          const CircleAvatar(radius: 22, backgroundColor: Brand.kuning, child: Icon(Icons.shield_outlined, color: Brand.tinta)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(ssbName.toUpperCase(), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.kuning, fontWeight: FontWeight.w800, fontSize: 17)),
                                Text('KARTU ANGGOTA RESMI', style: TextStyle(color: Brand.kapur.withValues(alpha: 0.85), fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.6)),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(p.memberNo ?? 'Belum ada nomor', style: const TextStyle(color: Brand.kuning, fontWeight: FontWeight.w800)),
                              Row(mainAxisSize: MainAxisSize.min, children: [
                                const Icon(Icons.circle, size: 8, color: Brand.kuning),
                                const SizedBox(width: 4),
                                Text(p.statusLabel, style: TextStyle(color: Brand.kapur.withValues(alpha: 0.9), fontSize: 12)),
                              ]),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              PlayerAvatar(id: p.id, name: p.fullName, photoV: p.photoV, radius: 36),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Chip(label: Text(p.ageGroup == null ? 'KU belum ditentukan' : kuShort(p.ageGroup!.name)), visualDensity: VisualDensity.compact),
                                    Text(p.fullName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                                    Text(p.positionLabel, style: TextStyle(color: scheme.outline)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(color: scheme.surfaceContainer, borderRadius: BorderRadius.circular(Space.radius)),
                            child: Column(
                              children: [
                                Semantics(
                                  label: 'Kode QR ${p.fullName}, nomor anggota ${p.memberNo ?? 'belum ada'}',
                                  child: Container(
                                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Space.radius)),
                                    padding: const EdgeInsets.all(12),
                                    child: QrImageView(data: playerQrPayload(webOriginOf(apiUrl), p.id), size: 220, backgroundColor: Colors.white, errorCorrectionLevel: QrErrorCorrectLevel.M),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text('Tunjukkan ke pelatih saat tiba di lapangan untuk presensi otomatis.', textAlign: TextAlign.center, style: TextStyle(color: scheme.outline)),
                                if (p.memberNo != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(Icons.qr_code_2, size: 18, color: scheme.outline),
                                        const SizedBox(width: 6),
                                        Text('KODE UNIK: ', style: TextStyle(color: scheme.outline, fontWeight: FontWeight.w700, fontSize: 13)),
                                        Text(p.memberNo!, style: const TextStyle(fontWeight: FontWeight.w800)),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(onPressed: () => context.push('/siswa/${p.id}'), icon: const Icon(Icons.person_outline), label: const Text('Lihat profil')),
            ],
          );
        },
      ),
    );
  }
}
