import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/config.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

/// Kartu anggota siswa dengan kode QR; isi QR sama dengan kartu di web (alamat profil siswa).
class PlayerCardPage extends StatelessWidget {
  const PlayerCardPage({super.key, required this.playerId});

  final String playerId;

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    final ssbName = context.read<SessionController>().me?.active?.ssbName ?? '';
    return Scaffold(
      appBar: AppBar(title: const Text('Kartu siswa')),
      body: LoadView<PlayerCard>(
        load: () => repo.playerCard(playerId),
        builder: (context, p) {
          final scheme = Theme.of(context).colorScheme;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Tunjukkan kode QR ke pelatih saat tiba di lapangan.', style: TextStyle(color: scheme.outline)),
              const SizedBox(height: 12),
              Card(
                clipBehavior: Clip.antiAlias,
                elevation: 2,
                child: Column(
                  children: [
                    Container(
                      color: scheme.primary,
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(ssbName, style: TextStyle(color: scheme.onPrimary, fontWeight: FontWeight.w700, fontSize: 16)),
                                Text('Kartu anggota', style: TextStyle(color: scheme.onPrimary.withValues(alpha: 0.8), fontSize: 12)),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(p.memberNo ?? 'Belum ada nomor', style: TextStyle(color: scheme.onPrimary, fontWeight: FontWeight.w700)),
                              Text(p.statusLabel, style: TextStyle(color: scheme.onPrimary.withValues(alpha: 0.8), fontSize: 12)),
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
                                    Chip(label: Text(p.ageGroup?.name ?? 'KU belum ditentukan'), visualDensity: VisualDensity.compact),
                                    Text(p.fullName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                                    Text(p.positionLabel, style: TextStyle(color: scheme.outline)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          Semantics(
                            label: 'Kode QR ${p.fullName}, nomor anggota ${p.memberNo ?? 'belum ada'}',
                            child: Container(
                              color: Colors.white,
                              padding: const EdgeInsets.all(8),
                              child: QrImageView(data: playerQrPayload(webOriginOf(apiUrl), p.id), size: 220, backgroundColor: Colors.white, errorCorrectionLevel: QrErrorCorrectLevel.M),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Kode ini membuka profil siswa, dan hanya akun yang berhak yang bisa melihat isinya.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: scheme.outline, fontSize: 12),
                          ),
                          if (p.memberNo != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Kode unik: ${p.memberNo}', style: const TextStyle(fontWeight: FontWeight.w600))),
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
