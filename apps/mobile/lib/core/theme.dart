import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Warna sama dengan web (`apps/web/src/app.css`) agar aplikasi dan situs terasa satu produk.
abstract final class Brand {
  static const rumput = Color(0xFF1B4D36);
  static const rumputTua = Color(0xFF143A29);
  static const kapur = Color(0xFFF4F6EF);
  static const tinta = Color(0xFF14201A);
  static const redup = Color(0xFF56655B);
  static const garis = Color(0xFFC9D1C4);
  static const kuning = Color(0xFFF0C23B);
  static const merah = Color(0xFFB3372A);
  static const merahMuda = Color(0xFFFBEAE7);

  /// Status kehadiran; kontras >= 4.5:1 di atas putih untuk teks tombol terpilih.
  static const hadir = Color(0xFF1E7A46);
  static const izin = Color(0xFF1F5FA8);
  static const sakit = Color(0xFFB45F06);
  static const alpa = Color(0xFFB3372A);
}

/// Jarak dan ukuran bersama. Sentuhan minimal 48dp (Android) dan jarak antar target 8dp.
abstract final class Space {
  static const touch = 48.0;
  static const gap = 8.0;
  static const page = 16.0;
  static const radius = 10.0;
}

/// Tombol sekunder "buku besar": hijau rumput dengan tulisan kapur (dipakai di samping tombol utama kuning).
ButtonStyle ledgerButton() => FilledButton.styleFrom(backgroundColor: Brand.rumput, foregroundColor: Brand.kapur, side: BorderSide.none);

ThemeData buildTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: Brand.rumput,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFD7E6DA),
    onPrimaryContainer: Brand.rumputTua,
    secondary: Brand.kuning,
    onSecondary: Brand.tinta,
    secondaryContainer: Color(0xFFFBEFC4),
    onSecondaryContainer: Color(0xFF3D2F00),
    error: Brand.merah,
    onError: Colors.white,
    errorContainer: Brand.merahMuda,
    onErrorContainer: Color(0xFF5C1710),
    surface: Colors.white,
    onSurface: Brand.tinta,
    onSurfaceVariant: Brand.redup,
    outline: Brand.redup,
    outlineVariant: Brand.garis,
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: Brand.kapur,
    surfaceContainer: Color(0xFFEDF0E6),
    surfaceContainerHigh: Color(0xFFE6EADD),
    surfaceContainerHighest: Color(0xFFDFE4D6),
  );

  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius));
  const minButton = Size(64, Space.touch);

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.kapur,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    textTheme: Typography.material2021().black.apply(bodyColor: Brand.tinta, displayColor: Brand.tinta).copyWith(
          // Isi minimal 14sp; judul kartu 16sp agar terbaca sambil berdiri di lapangan.
          bodyMedium: const TextStyle(fontSize: 15, height: 1.4),
          bodySmall: const TextStyle(fontSize: 13, height: 1.35),
          titleMedium: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.3),
          titleSmall: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.3),
        ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.rumput,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      toolbarHeight: 60,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      // Sudut bawah membulat, sama dengan kepala di beranda, supaya halaman dalam terasa satu keluarga.
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(bottom: Radius.circular(20))),
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: Space.gap),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius), side: const BorderSide(color: Brand.garis)),
    ),
    listTileTheme: const ListTileThemeData(minVerticalPadding: 8, minTileHeight: Space.touch),
    dividerTheme: const DividerThemeData(color: Brand.garis, space: 1),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      height: 68,
      indicatorColor: const Color(0xFFFBEFC4),
      surfaceTintColor: Colors.transparent,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 12, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500)),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(size: 24, color: s.contains(WidgetState.selected) ? Brand.rumput : Brand.redup)),
    ),
    // Tombol aksi utama desain "Garuda Muda Dossier": kuning dengan tulisan gelap dan garis emas tipis.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: minButton,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius), side: const BorderSide(color: Color(0xFFD8A826))),
        backgroundColor: Brand.kuning,
        foregroundColor: Brand.tinta,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: minButton, shape: shape, foregroundColor: Brand.tinta, backgroundColor: Colors.white, side: const BorderSide(color: Brand.garis), textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: minButton, shape: shape)),
    floatingActionButtonTheme: FloatingActionButtonThemeData(backgroundColor: Brand.kuning, foregroundColor: Brand.tinta, elevation: 2, shape: shape, extendedTextStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(Space.radius), borderSide: const BorderSide(color: Brand.garis)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Space.radius), borderSide: const BorderSide(color: Brand.garis)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Space.radius), borderSide: const BorderSide(color: Brand.rumput, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Space.radius), borderSide: const BorderSide(color: Brand.merah)),
    ),
    // Tulisan chip harus eksplisit gelap: tanpa warna, teks chip pilihan dan KU tidak terbaca di HP.
    chipTheme: ChipThemeData(
      shape: shape,
      side: const BorderSide(color: Brand.garis),
      backgroundColor: Colors.white,
      selectedColor: Brand.kuning,
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Brand.tinta),
      secondaryLabelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Brand.tinta),
    ),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: Brand.tinta, contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14), shape: shape),
    dialogTheme: DialogThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), backgroundColor: Colors.white),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent, showDragHandle: true),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Brand.rumput),
  );
}
