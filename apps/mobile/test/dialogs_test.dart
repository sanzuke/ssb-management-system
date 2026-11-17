import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ssb_mobile/core/dialogs.dart';
import 'package:ssb_mobile/core/theme.dart';

void main() {
  Future<void> open(WidgetTester t, void Function(bool) onResult) async {
    await t.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async => onResult(await showConfirm(context, icon: Icons.logout_rounded, title: 'Keluar dari akun?', message: 'Anda perlu masuk lagi.', confirmLabel: 'Ya, keluar', destructive: true)),
                child: const Text('buka'),
              ),
            ),
          ),
        ),
      ),
    );
    await t.tap(find.text('buka'));
    await t.pumpAndSettle();
    expect(find.text('Keluar dari akun?'), findsOneWidget);
    expect(find.text('Anda perlu masuk lagi.'), findsOneWidget);
  }

  testWidgets('aksi utama mengembalikan true dan menutup dialog', (t) async {
    final results = <bool>[];
    await open(t, results.add);
    await t.tap(find.text('Ya, keluar'));
    await t.pumpAndSettle();
    expect(results, [true]);
    expect(find.text('Keluar dari akun?'), findsNothing);
  });

  testWidgets('Batal dan ketuk di luar dialog sama-sama mengembalikan false', (t) async {
    final results = <bool>[];
    await open(t, results.add);
    await t.tap(find.text('Batal'));
    await t.pumpAndSettle();
    expect(results, [false]);

    await t.tap(find.text('buka'));
    await t.pumpAndSettle();
    await t.tapAt(const Offset(5, 5));
    await t.pumpAndSettle();
    expect(results, [false, false]);
    expect(find.text('Keluar dari akun?'), findsNothing);
  });
}
