import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/theme.dart';

/// Anak yang sedang dipilih orang tua. Dipakai bersama oleh Beranda, Kartu, dan Rapor, jadi memilih
/// satu anak di salah satu tab berlaku juga di tab lain.
class KidSelection extends ChangeNotifier {
  String? _id;

  String? get id => _id;

  void select(String id) {
    if (_id == id) return;
    _id = id;
    notifyListeners();
  }

  /// Anak terpilih dari [kids]; anak pertama bila belum memilih atau pilihan sudah tidak ada.
  PlayerSummary pick(List<PlayerSummary> kids) => kids.firstWhere((k) => k.id == _id, orElse: () => kids.first);
}

/// Satu pilihan anak pada [KidChips].
typedef KidOption = ({String id, String name});

List<KidOption> kidOptions(List<PlayerSummary> kids) => [for (final k in kids) (id: k.id, name: k.fullName)];

/// Deretan chip nama anak (hanya tampil bila lebih dari satu). [allLabel] menambah pilihan "Semua" di awal.
class KidChips extends StatelessWidget {
  const KidChips({super.key, required this.kids, required this.selectedId, required this.onSelect, this.allLabel, this.padding = const EdgeInsets.fromLTRB(12, 8, 12, 8)});

  final List<KidOption> kids;

  /// Id anak terpilih; null berarti pilihan "Semua" (hanya bila [allLabel] diberikan).
  final String? selectedId;
  final ValueChanged<String?> onSelect;
  final String? allLabel;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    if (kids.length < 2) return const SizedBox.shrink();
    return SizedBox(
      height: 56,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: padding,
        children: [
          if (allLabel != null) ...[
            ChoiceChip(label: Text(allLabel!), selected: selectedId == null, onSelected: (_) => onSelect(null), selectedColor: Brand.kuning, showCheckmark: false),
            const SizedBox(width: Space.gap),
          ],
          for (final k in kids) ...[
            ChoiceChip(label: Text(k.name.split(' ').first), selected: k.id == selectedId, onSelected: (_) => onSelect(k.id), selectedColor: Brand.kuning, showCheckmark: false),
            const SizedBox(width: Space.gap),
          ],
        ],
      ),
    );
  }
}
