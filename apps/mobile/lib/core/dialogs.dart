import 'package:flutter/material.dart';

import 'theme.dart';

/// Dialog konfirmasi seragam: lencana ikon, judul, penjelasan, lalu dua tombol selebar dialog
/// (aksi utama di atas, batal di bawah). [destructive] mewarnai aksi dan lencana merah.
/// Mengembalikan true hanya bila aksi utama diketuk; menutup lewat luar dialog atau Batal berarti false.
Future<bool> showConfirm(
  BuildContext context, {
  required IconData icon,
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Batal',
  bool destructive = false,
  Widget? extra,
}) async {
  final accent = destructive ? Brand.merah : Brand.rumput;
  final ok = await showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Tutup',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (c, _, _) => SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              clipBehavior: Clip.antiAlias,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Pita warna di atas menandai jenis tindakan (hijau biasa, merah untuk yang merusak).
                  Container(height: 6, color: accent),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(color: accent.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(18)),
                          child: Icon(icon, size: 32, color: accent),
                        ),
                        const SizedBox(height: 16),
                        Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Brand.tinta, height: 1.25)),
                        const SizedBox(height: 8),
                        Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, color: Brand.redup, height: 1.45)),
                        if (extra != null) ...[const SizedBox(height: 12), extra],
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white, side: BorderSide.none),
                            onPressed: () => Navigator.of(c).pop(true),
                            child: Text(confirmLabel),
                          ),
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(onPressed: () => Navigator.of(c).pop(false), child: Text(cancelLabel)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
    transitionBuilder: (c, anim, _, child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic, reverseCurve: Curves.easeIn);
      return FadeTransition(opacity: curved, child: ScaleTransition(scale: Tween(begin: 0.92, end: 1.0).animate(curved), child: child));
    },
  );
  return ok ?? false;
}
