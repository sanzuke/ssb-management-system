import { describe, expect, test } from "bun:test";
import { parseCsv, petakanBaris, tanggalDariLembar } from "./impor";

const KU = [
  { id: "ku12", name: "KU-12" },
  { id: "ku10", name: "KU-10" },
];

describe("parseCsv", () => {
  test("koma, titik koma, tab, kutip, dan baris baru di dalam kutip", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
    expect(parseCsv("a;b\r\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv('a,b\n"baris 1\nbaris 2",z')).toEqual([
      ["a", "b"],
      ["baris 1\nbaris 2", "z"],
    ]);
    expect(parseCsv("\uFEFFa,b\n1,2")[0]).toEqual(["a", "b"]);
  });
});

describe("tanggalDariLembar", () => {
  test("format lembar sebar dan tahun dua angka", () => {
    expect(tanggalDariLembar("21-Jan-14", 2026)).toBe("2014-01-21");
    expect(tanggalDariLembar("5-Mei-2015", 2026)).toBe("2015-05-05");
    expect(tanggalDariLembar("21/01/2014")).toBe("2014-01-21");
    expect(tanggalDariLembar("2014-01-21")).toBe("2014-01-21");
    expect(tanggalDariLembar("3 Agu 99", 2026)).toBe("1999-08-03");
    expect(tanggalDariLembar("kemarin")).toBe("kemarin"); // tidak dikenali: ditolak validasi API
  });
});

describe("petakanBaris", () => {
  const judul = [
    "No",
    "ID Siswa (SSB-001)",
    "NISN",
    "Nama Lengkap (sesuai kartu identitas)",
    "Tempat Lahir",
    "Tanggal Lahir (21-Jan-14)",
    "Kelompok Usia (U-12)",
    "Posisi (Penyerang)",
    "Nama Orang Tua",
    "No. WhatsApp (81234567890)",
    "Status Berkas (KK/Akta) (Lengkap)",
    "Tinggi Badan",
    "Berat Badan",
    "Catatan Medis",
    "No. Punggung",
    "Ukuran Jersey",
    "Ukuran Sepatu",
  ];

  test("baris contoh dari lembar SSB", () => {
    const { baris, kolomTakDikenal } = petakanBaris(
      [
        judul,
        [
          "1",
          "SSB-001",
          "3142186517",
          "Muhammad Setia Budi",
          "Garut",
          "21-Jan-14",
          "U-12",
          "Penyerang",
          "Nurlinda",
          "81234567890",
          "Lengkap",
          "",
          "",
          "",
          "60",
          "M",
          "38",
        ],
      ],
      KU,
    );
    expect(kolomTakDikenal).toEqual([]);
    expect(baris).toHaveLength(1);
    expect(baris[0]).toEqual({
      nomor: 2,
      galat: [],
      data: {
        memberNo: "SSB-001",
        nisn: "3142186517",
        fullName: "Muhammad Setia Budi",
        birthPlace: "Garut",
        birthDate: "2014-01-21",
        position: "FW",
        school: undefined,
        ageGroupId: "ku12",
        guardianName: "Nurlinda",
        guardianWhatsapp: "81234567890",
        documentStatus: "lengkap",
        heightCm: null,
        weightKg: null,
        medicalNote: "",
        jerseyNo: 60,
        jerseySize: "M",
        shoeSize: 38,
      },
    });
  });

  test("isian yang tidak dipahami dicatat per baris, baris kosong dilewati, nomor baris mengikuti lembar", () => {
    const { baris } = petakanBaris(
      [
        judul,
        ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ["2", "", "314218651", "Andi", "", "1-Feb-15", "U-99", "Pemain Sayap", "", "", "mungkin", "1,45 m", "35,5 kg", "", "7,5", "", "37,5"],
      ],
      KU,
    );
    expect(baris).toHaveLength(1);
    expect(baris[0]!.nomor).toBe(3);
    expect(baris[0]!.data.nisn).toBe("0314218651"); // nol di depan hilang di lembar sebar
    expect(baris[0]!.data.weightKg).toBe(35.5);
    expect(baris[0]!.data.shoeSize).toBe(37.5);
    expect(baris[0]!.galat).toEqual([
      'Kelompok usia: KU "U-99" belum ada, buat dulu di Data master',
      'Posisi: "Pemain Sayap" tidak dikenali',
      'Status berkas: "mungkin" tidak dikenali',
      'Tinggi badan: "1,45 m" bukan angka bulat',
      'No. punggung: "7,5" bukan angka bulat',
    ]);
  });

  test("kolom tak dikenal dilaporkan, kolom urutan bebas", () => {
    const { baris, kolomTakDikenal, kolomDikenali } = petakanBaris(
      [
        ["Hobi", "Nama", "Tanggal Lahir"],
        ["bola", "Rani", "2016-03-04"],
      ],
      KU,
    );
    expect(kolomTakDikenal).toEqual(["Hobi"]);
    expect(kolomDikenali.sort()).toEqual(["birthDate", "fullName"]);
    expect(baris[0]!.data).toMatchObject({ fullName: "Rani", birthDate: "2016-03-04", documentStatus: "belum", ageGroupId: null });
  });
});
