import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../core/session.dart';
import '../account/account_page.dart';
import '../coach/schedule_page.dart';
import '../coach/today_page.dart';
import '../parent/parent_home_page.dart';
import '../players/players_page.dart';

class _Tab {
  const _Tab(this.id, this.label, this.icon, this.selectedIcon, this.page);

  final String id;
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget page;
}

/// Tab bawah menurut role: pelatih/korlas (Hari ini, Siswa, Jadwal, Akun) atau orang tua (Beranda, Anak, Tagihan, Akun).
/// Izin tetap ditegakkan server; ini hanya memilih menu.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.tab});

  /// Tab yang dibuka lewat `/?tab=<id>` (mis. dari notifikasi): hari-ini, siswa, jadwal, beranda, anak, tagihan, akun.
  final String? tab;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  String? _pendingTab;

  @override
  void initState() {
    super.initState();
    _pendingTab = widget.tab;
  }

  @override
  void didUpdateWidget(HomeShell old) {
    super.didUpdateWidget(old);
    if (widget.tab != old.tab) _pendingTab = widget.tab;
  }

  List<_Tab> _tabs(Role role) {
    const account = _Tab('akun', 'Akun', Icons.person_outline, Icons.person, AccountPage());
    if (role.isCoach) {
      return const [
        _Tab('hari-ini', 'Hari ini', Icons.today_outlined, Icons.today, TodayPage()),
        _Tab('siswa', 'Siswa', Icons.groups_outlined, Icons.groups, PlayersPage()),
        _Tab('jadwal', 'Jadwal', Icons.calendar_month_outlined, Icons.calendar_month, SchedulePage()),
        account,
      ];
    }
    return [
      _Tab('beranda', 'Beranda', Icons.home_outlined, Icons.home, ParentHomePage(onOpenInvoices: () => setState(() => _index = 2))),
      const _Tab('anak', 'Anak', Icons.child_care_outlined, Icons.child_care, PlayersPage()),
      const _Tab('tagihan', 'Tagihan', Icons.receipt_long_outlined, Icons.receipt_long, InvoicesPage()),
      account,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<SessionController>().role;
    if (role == null) return const SizedBox.shrink();
    if (role == Role.adminSsb) return const _AdminNotice();
    final tabs = _tabs(role);
    if (_pendingTab != null) {
      final i = tabs.indexWhere((t) => t.id == _pendingTab);
      if (i >= 0) _index = i;
      _pendingTab = null;
    }
    return Scaffold(
      appBar: AppBar(title: Text(tabs[_index].label)),
      body: IndexedStack(index: _index, children: [for (final t in tabs) t.page]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [for (final t in tabs) NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.selectedIcon), label: t.label)],
      ),
    );
  }
}

/// Admin SSB memakai web; aplikasi ini hanya untuk pelatih dan orang tua.
class _AdminNotice extends StatelessWidget {
  const _AdminNotice();

  @override
  Widget build(BuildContext context) {
    final s = context.read<SessionController>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.desktop_windows_outlined, size: 48),
                const SizedBox(height: 16),
                const Text('Akun admin SSB dikelola lewat web.', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                if ((s.me?.memberships.length ?? 0) > 1) FilledButton.tonal(onPressed: s.showSsbPicker, child: const Text('Ganti SSB')),
                TextButton(onPressed: s.logout, child: const Text('Keluar')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
