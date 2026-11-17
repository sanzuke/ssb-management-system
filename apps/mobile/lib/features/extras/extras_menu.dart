import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';

/// Menu fitur tambahan menurut role (kalender, donasi, pemindai QR, izin).
/// Kartu QR dan berkas dibuka dari profil anak. Ditampilkan di halaman Akun.
class ExtrasMenu extends StatelessWidget {
  const ExtrasMenu({super.key, required this.role});

  final Role role;

  @override
  Widget build(BuildContext context) {
    final items = <({IconData icon, String title, String subtitle, String route})>[
      if (role.isCoach) (icon: Icons.qr_code_scanner, title: 'Pindai kartu QR', subtitle: 'Catat hadir dari kartu siswa', route: '/pindai'),
      if (role == Role.orangTua) (icon: Icons.receipt_long_outlined, title: 'Tagihan SPP', subtitle: 'Tagihan, jatuh tempo, dan riwayat bayar', route: '/tagihan'),
      if (role == Role.orangTua) (icon: Icons.event_busy_outlined, title: 'Izin latihan', subtitle: 'Ajukan izin atau sakit untuk anak', route: '/izin'),
      (icon: Icons.calendar_month_outlined, title: 'Kalender', subtitle: 'Pertandingan, acara, dan libur', route: '/kalender'),
      (icon: Icons.volunteer_activism_outlined, title: role == Role.orangTua ? 'Yayasan dan donasi' : 'Donasi', subtitle: 'Kampanye penggalangan dana kegiatan', route: '/donasi'),
    ];
    return Column(
      children: [
        for (final i in items)
          ListTile(
            leading: Icon(i.icon),
            title: Text(i.title),
            subtitle: Text(i.subtitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(i.route),
          ),
      ],
    );
  }
}
