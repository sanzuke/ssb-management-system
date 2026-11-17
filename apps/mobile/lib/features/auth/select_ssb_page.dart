import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/widgets.dart';

/// Pilihan SSB untuk akun yang menjadi anggota lebih dari satu SSB (sama dengan /pilih-ssb di web).
class SelectSsbPage extends StatelessWidget {
  const SelectSsbPage({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionController>();
    final list = s.me?.memberships ?? const [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pilih SSB'),
        actions: [TextButton(onPressed: s.logout, child: const Text('Keluar'))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final m in list)
            Card(
              child: ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: Text(m.ssbName),
                subtitle: Text(m.role.label),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  try {
                    await s.selectSsb(m.ssbId);
                  } catch (e) {
                    if (context.mounted) showMessage(context, errorText(e));
                  }
                },
              ),
            ),
        ],
      ),
    );
  }
}
