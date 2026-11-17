import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/session.dart';
import 'core/theme.dart';
import 'features/platform/messenger.dart';
import 'features/platform/push_service.dart';
import 'features/auth/login_page.dart';
import 'features/auth/select_ssb_page.dart';
import 'features/coach/attendance_page.dart';
import 'features/extras/routes.dart';
import 'features/players/routes.dart';
import 'features/shell/home_shell.dart';

GoRouter buildRouter(SessionController session) => GoRouter(
      refreshListenable: session,
      redirect: (context, state) {
        final path = state.matchedLocation;
        final target = switch (session.status) {
          AuthStatus.loading || AuthStatus.offline => '/memuat',
          AuthStatus.anonymous => '/masuk',
          AuthStatus.needSsb => '/pilih-ssb',
          AuthStatus.ready => path == '/masuk' || path == '/pilih-ssb' || path == '/memuat' ? '/' : null,
        };
        return target == null || target == path ? null : target;
      },
      routes: [
        GoRoute(path: '/memuat', builder: (_, _) => const _StartupPage()),
        GoRoute(path: '/masuk', builder: (_, _) => const LoginPage()),
        GoRoute(path: '/pilih-ssb', builder: (_, _) => const SelectSsbPage()),
        GoRoute(path: '/', builder: (_, s) => HomeShell(tab: s.uri.queryParameters['tab'])),
        GoRoute(path: '/absensi/:id', builder: (_, s) => AttendancePage(sessionId: s.pathParameters['id']!)),
        ...playersRoutes,
        ...extrasRoutes,
      ],
    );

class SsbApp extends StatefulWidget {
  const SsbApp({super.key});

  @override
  State<SsbApp> createState() => _SsbAppState();
}

class _SsbAppState extends State<SsbApp> {
  late final GoRouter _router = buildRouter(context.read<SessionController>());

  @override
  void initState() {
    super.initState();
    // Ketukan notifikasi membuka layar lewat router ini.
    context.read<PushService>().attach(_router);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'SSB App',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: rootMessengerKey,
      routerConfig: _router,
      theme: buildTheme(),
      // Di layar lebar (tablet, web, desktop) isi tetap selebar ponsel agar tidak melar.
      // Ikon status bar gelap di halaman terang (masuk, awal); bilah hijau memasang ikon terangnya sendiri.
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
        child: ColoredBox(
          color: Brand.kapur,
          child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 640), child: child)),
        ),
      ),
    );
  }
}

/// Layar awal: memeriksa token, atau menawarkan coba lagi bila server tidak terjangkau.
class _StartupPage extends StatelessWidget {
  const _StartupPage();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionController>();
    return Scaffold(
      body: Center(
        child: s.status == AuthStatus.offline
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off, size: 48),
                  const SizedBox(height: 12),
                  const Text('Tidak ada koneksi ke server.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(onPressed: s.refresh, child: const Text('Coba lagi')),
                ],
              )
            : const CircularProgressIndicator(),
      ),
    );
  }
}
