import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/outbox.dart';
import 'core/repository.dart';
import 'core/session.dart';
import 'features/platform/google_login.dart';
import 'features/platform/outbox_notices.dart';
import 'features/platform/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');
  final api = ApiClient();
  final outbox = await Outbox.load(api);
  final session = SessionController(api);
  final push = PushService(api, session, await SharedPreferences.getInstance());
  final notices = OutboxNotices(outbox);
  final google = GoogleLoginController(session)..start();
  // Perangkat push dicabut lebih dulu (butuh token yang masih berlaku), lalu antrean offline dikosongkan.
  session.onLogout.add(push.unregister);
  session.onLogout.add(outbox.clear);
  session.onLogout.add(() async => notices.clear());
  // Kirim antrean offline begitu akun siap (setelah login atau buka aplikasi).
  session.addListener(() {
    if (session.status == AuthStatus.ready) outbox.flush();
  });
  // Push mendengarkan sesi sejak awal supaya tidak ketinggalan status siap; tidak pernah melempar.
  unawaited(push.start());
  session.start();
  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<Repository>.value(value: Repository(api)),
        ChangeNotifierProvider<Outbox>.value(value: outbox),
        ChangeNotifierProvider<SessionController>.value(value: session),
        ChangeNotifierProvider<PushService>.value(value: push),
        ChangeNotifierProvider<OutboxNotices>.value(value: notices),
        ChangeNotifierProvider<GoogleLoginController>.value(value: google),
      ],
      child: const SsbApp(),
    ),
  );
}
