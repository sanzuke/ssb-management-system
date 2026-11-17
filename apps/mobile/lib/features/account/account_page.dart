import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../core/dialogs.dart';
import '../../core/outbox.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import '../extras/extras_menu.dart';
import '../platform/outbox_notices.dart';
import '../platform/push_service.dart';
import 'account_dialogs.dart';

class AccountPage extends StatefulWidget {
  const AccountPage({super.key});

  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> {
  late final Future<PackageInfo> _info = PackageInfo.fromPlatform();

  Future<void> _logout() async {
    final pending = context.read<Outbox>().pending;
    final ok = await showConfirm(
      context,
      icon: Icons.logout_rounded,
      title: 'Keluar dari akun?',
      message: pending > 0
          ? 'Ada $pending perubahan yang belum terkirim di perangkat ini dan akan hilang jika Anda keluar. Anda perlu masuk lagi untuk memakai aplikasi.'
          : 'Anda perlu masuk lagi untuk memakai aplikasi.',
      confirmLabel: 'Ya, keluar',
      destructive: true,
    );
    if (ok && mounted) await context.read<SessionController>().logout();
  }

  Future<void> _toggleNotifications(PushService push, bool value) async {
    await push.setEnabled(value);
    if (mounted && value && push.permissionDenied) {
      showMessage(context, 'Izin notifikasi ditolak. Aktifkan lewat pengaturan perangkat.');
    }
  }

  Future<void> _flush(Outbox outbox) async {
    await outbox.flush();
    if (!mounted) return;
    showMessage(context, outbox.pending == 0 ? 'Semua perubahan sudah terkirim.' : 'Belum terkirim. Periksa sinyal Anda lalu coba lagi.');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionController>();
    final push = context.watch<PushService>();
    final outbox = context.watch<Outbox>();
    final notices = context.watch<OutboxNotices>();
    final scheme = Theme.of(context).colorScheme;
    final me = s.me;
    final active = me?.active;
    final notifSubtitle = !push.available
        ? 'Belum tersedia di versi aplikasi ini'
        : push.permissionDenied
            ? 'Izin ditolak di pengaturan perangkat'
            : push.enabled
                ? 'Aktif di perangkat ini'
                : 'Mati di perangkat ini';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text(me?.name ?? ''),
            subtitle: Text(me?.email ?? ''),
          ),
        ),
        if (active != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.shield_outlined),
              title: Text(active.ssbName),
              subtitle: Text(active.role.label),
              trailing: (me?.memberships.length ?? 0) > 1 ? TextButton(onPressed: s.showSsbPicker, child: const Text('Ganti')) : null,
            ),
          ),
        if (active != null) Card(clipBehavior: Clip.antiAlias, child: ExtrasMenu(role: active.role)),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              SwitchListTile(
                secondary: const Icon(Icons.notifications_outlined),
                title: const Text('Notifikasi'),
                subtitle: Text(notifSubtitle),
                value: push.available && push.enabled && !push.permissionDenied,
                onChanged: push.available ? (v) => _toggleNotifications(push, v) : null,
              ),
              if (active != null)
                ListTile(
                  leading: const Icon(Icons.chat_outlined),
                  title: const Text('Nomor WhatsApp'),
                  subtitle: Text(me?.whatsapp == null || me!.whatsapp!.isEmpty ? 'Belum diisi' : me.whatsapp!),
                  trailing: const Icon(Icons.edit_outlined),
                  onTap: () async {
                    if (await WhatsappDialog.show(context, current: me?.whatsapp) && context.mounted) showMessage(context, 'Nomor WhatsApp disimpan.');
                  },
                ),
              ListTile(
                leading: const Icon(Icons.lock_outline),
                title: Text(s.hasPassword ? 'Ganti kata sandi' : 'Buat kata sandi'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  if (await ChangePasswordDialog.show(context) && context.mounted) {
                    showMessage(context, s.hasPassword ? 'Kata sandi diganti. Perangkat lain perlu masuk ulang.' : 'Kata sandi dibuat.');
                  }
                },
              ),
            ],
          ),
        ),
        if (outbox.pending > 0 || notices.recent.isNotEmpty)
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (outbox.pending > 0)
                  ListTile(
                    leading: const Icon(Icons.cloud_upload_outlined),
                    title: Text('${outbox.pending} perubahan menunggu sinyal'),
                    subtitle: Text(outbox.items.map((i) => i.label ?? i.key).join(', '), maxLines: 2, overflow: TextOverflow.ellipsis),
                    trailing: TextButton(onPressed: () => _flush(outbox), child: const Text('Kirim sekarang')),
                  ),
                if (notices.recent.isNotEmpty) ...[
                  ListTile(
                    leading: Icon(Icons.error_outline, color: scheme.error),
                    title: const Text('Perubahan yang ditolak server'),
                    trailing: TextButton(onPressed: notices.clear, child: const Text('Hapus')),
                  ),
                  for (final m in notices.recent)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(72, 0, 16, 8),
                      child: Text(m, style: TextStyle(color: scheme.error, fontSize: 13)),
                    ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 16),
        OutlinedButton.icon(onPressed: _logout, icon: const Icon(Icons.logout), label: const Text('Keluar')),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: () => DeleteAccountDialog.show(context),
          style: TextButton.styleFrom(foregroundColor: scheme.error),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Hapus akun'),
        ),
        const SizedBox(height: 8),
        FutureBuilder<PackageInfo>(
          future: _info,
          builder: (context, snap) => snap.hasData
              ? Text('SSB App versi ${snap.data!.version} (${snap.data!.buildNumber})', textAlign: TextAlign.center, style: TextStyle(color: scheme.outline, fontSize: 12))
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}
