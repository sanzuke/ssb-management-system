import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format.dart';
import '../../core/theme.dart';

/// Kepala aplikasi: lambang akademi, nama SSB, peran dan halaman aktif, serta avatar akun.
/// Menangani area status bar sendiri, jadi dipasang di badan layar (bukan `appBar`).
class AppHeader extends StatelessWidget {
  const AppHeader({super.key, required this.ssbName, required this.userName, required this.roleLabel, required this.pageLabel, required this.onAccount});

  final String ssbName;
  final String userName;
  final String roleLabel;
  final String pageLabel;
  final VoidCallback onAccount;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Brand.rumputTua, Brand.rumput]),
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
          boxShadow: [BoxShadow(color: Color(0x33143A29), blurRadius: 12, offset: Offset(0, 4))],
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: Brand.kuning, width: 2)),
                  child: Image.asset('assets/branding/icon.png', fit: BoxFit.contain, semanticLabel: 'Lambang akademi'),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ssbName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800, height: 1.2)),
                      const SizedBox(height: 2),
                      Text(
                        '${roleLabel.toUpperCase()}  ·  ${pageLabel.toUpperCase()}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Brand.kuning, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.8),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Semantics(
                  button: true,
                  label: 'Akun $userName',
                  excludeSemantics: true,
                  child: InkResponse(
                    onTap: onAccount,
                    radius: 28,
                    child: Container(
                      width: 46,
                      height: 46,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: Brand.kuning, shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 2)),
                      child: Text(initials(userName), style: const TextStyle(color: Brand.tinta, fontWeight: FontWeight.w800, fontSize: 16)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
