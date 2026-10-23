import type { SiteContent } from "@ssb/shared";

/**
 * Konten awal landing Family United, disalin dari halaman statik di repo `ssb-family-united`
 * (src/data/academyData.ts dan teks di komponen) supaya situs langsung terisi setelah dipasang.
 * Semua isinya CONTOH dari desain tim: klaim jumlah siswa, beasiswa, lisensi, nama pelatih, testimoni, dan jadwal laga
 * harus diganti dengan data asli lewat halaman Konten situs sebelum dipublikasikan sungguhan.
 * Kolom yang tidak punya padanan di skema (jumlah sesi per pekan, fitur fasilitas, klub asal pelatih, pencetak gol,
 * dampak testimoni) digabung ke teks terdekat atau dibuang.
 */
export const kontenFamilyUnited: SiteContent = {
  identity: {
    name: "Yayasan Sinar Harapan Bangsa Padasuka",
    shortName: "YSHB Padasuka",
    brandName: "Family United Football Club",
    acronym: "FUFA",
    motto: { id: "Membina Karakter, Mencetak Juara, Membangun Keluarga", en: "Nurturing Character, Forging Champions, Building Family" },
    foundedYear: 1997,
    address: "Komplek Lapangan Sepak Bola Cikajang, Garut & Padasuka, Jawa Barat",
    phone: "+62 812-2345-6789",
    email: "info@fufa-padasuka.org",
    whatsapp: "6281223456789",
    venue: "Stadion Mini Cikajang Garut & Lapangan Padasuka",
  },
  hero: {
    title: { id: "Membina Karakter, Mencetak Juara, Membangun Keluarga", en: "Nurturing Character, Forging Champions, Building Family" },
    subtitle: {
      id: "Akademi sepak bola berstandar AFC yang memadukan pembinaan teknik modern, disiplin akademik, dan nilai kekeluargaan sejak 1997. Didukung beasiswa penuh bagi talenta muda berprestasi di Jawa Barat.",
      en: "AFC-standard football academy combining modern tactical development, academic discipline, and deep community kinship in Padasuka, Bandung since 1997. Supported by 100% full foundation scholarships.",
    },
    primaryCta: { id: "Daftar Free Trial Gratis", en: "Register Free Trial" },
  },
  stats: [
    { value: "185+", label: { id: "Siswa Terbina Aktif (U-9 s/d U-17)", en: "Active Students (U-9 to U-17)" } },
    { value: "42%", label: { id: "Penerima Beasiswa Penuh Yayasan", en: "Full Foundation Scholarship Recipients" } },
    { value: "AFC B & C", label: { id: "Lisensi Tim Pelatih & Fisioterapis", en: "Coaching & Physiotherapy Staff Licenses" } },
    { value: "EST. 1997", label: { id: "29 Tahun Dedikasi Sepak Bola Grassroots", en: "29 Years of Grassroots Football Dedication" } },
  ],
  story: {
    title: {
      id: "Lahir dari Dedikasi Yayasan Sinar Harapan Bangsa Padasuka untuk Generasi Emas Indonesia",
      en: "Born from Yayasan Sinar Harapan Bangsa Padasuka for the Golden Generation",
    },
    body: {
      id: "Yayasan Sinar Harapan Bangsa Padasuka memandang sepak bola bukan sekadar permainan 90 menit di atas rumput hijau, melainkan wahana pembentukan karakter luhur, ketangguhan mental, dan kehangatan rasa kekeluargaan sejak didirikan tahun 1997. Di Family United Football Club, setiap anak dari berbagai latar belakang sosial di kawasan Padasuka dan Garut berhak mendapatkan pendidikan sepak bola bermutu tinggi, nutrisi yang memadai, dan bimbingan belajar gratis agar prestasi akademiknya seimbang dengan kemampuan olahraganya.",
      en: "Yayasan Sinar Harapan Bangsa Padasuka sees football as a powerful vessel for character building, mental resilience, and lifelong kinship that removes economic barriers for aspiring youth since 1997. At Family United Football Club, every child from every social background in Padasuka and Garut deserves high-quality football education, proper nutrition, and free academic tutoring so schoolwork keeps pace with sporting talent.",
    },
  },
  programs: [
    {
      id: "u-9",
      code: "TUNAS",
      name: { id: "Grassroots Foundation (U-9)" },
      subname: { id: "Tunas Harapan Padasuka" },
      ageRange: { id: "Usia 6 – 9 Tahun", en: "Age 6 – 9 Years" },
      focus: { id: "Keceriaan Bermain, Penguasaan Bola & Dasar Kelincahan", en: "Joy of Play, Ball Mastery & Agility Fundamentals" },
      schedule: { id: "Rabu & Sabtu (07:30 - 09:30 WIB)", en: "Wednesday & Saturday (07:30 - 09:30 WIB)" },
      curriculum: [
        { id: "Teknik dasar dribbling & percaya diri 1v1", en: "Basic dribbling technique & 1v1 confidence" },
        { id: "Permainan koordinasi mata-tangan dan mata-kaki", en: "Hand-eye & foot-eye coordination games" },
        { id: "Festival seru 4v4", en: "4v4 small-sided fun festivals" },
        { id: "Dasar sportivitas & saling menghormati", en: "Sportsmanship & peer respect basics" },
      ],
      maxSquadSize: 24,
      fee: "IDR 250.000 / month",
      hasScholarship: true,
    },
    {
      id: "u-12",
      code: "BINTANG",
      name: { id: "Youth Development (U-12)" },
      subname: { id: "Bintang Muda Padasuka" },
      ageRange: { id: "Usia 10 – 12 Tahun", en: "Age 10 – 12 Years" },
      focus: { id: "Kesadaran Taktik, Pergerakan Ruang & Kekeluargaan Tim", en: "Tactical Awareness, Spatial Movement & Team Kinship" },
      schedule: { id: "Selasa, Kamis & Sabtu (15:30 - 17:30 WIB)", en: "Tuesday, Thursday & Saturday (15:30 - 17:30 WIB)" },
      curriculum: [
        { id: "Permainan posisi & kombinasi umpan", en: "Positional play & passing combinations" },
        { id: "Kontrol sentuhan pertama di bawah tekanan", en: "First touch control under pressure" },
        { id: "Transisi format laga 7v7 & 9v9", en: "7v7 & 9v9 match format transitions" },
        { id: "Ketangguhan mental & bimbingan belajar terpadu", en: "Mental toughness & academic tutoring integration" },
      ],
      maxSquadSize: 22,
      fee: "IDR 350.000 / month",
      hasScholarship: true,
    },
    {
      id: "u-15",
      code: "GARUDA",
      name: { id: "Junior Elite (U-15)" },
      subname: { id: "Garuda Padasuka" },
      ageRange: { id: "Usia 13 – 15 Tahun", en: "Age 13 – 15 Years" },
      focus: { id: "Strategi Kompetitif, Kondisi Fisik & Persiapan Liga", en: "Competitive Strategy, Physical Conditioning & League Prep" },
      schedule: { id: "Senin, Rabu, Jumat & Minggu (15:45 - 18:00 WIB)", en: "Monday, Wednesday, Friday & Sunday (15:45 - 18:00 WIB)" },
      curriculum: [
        { id: "Sistem taktik 11v11 penuh & analisis video", en: "Full 11v11 tactical systems & video analysis" },
        { id: "Kondisi kecepatan, kelincahan, dan daya tahan aerobik", en: "Speed, agility, and aerobic capacity conditioning" },
        { id: "Piala Soeratin U-15 & liga regional", en: "Piala Soeratin U-15 & regional league campaigns" },
        { id: "Lokakarya kepemimpinan & pembinaan karakter", en: "Leadership & character mentorship workshops" },
      ],
      maxSquadSize: 25,
      fee: "IDR 450.000 / month",
      hasScholarship: true,
    },
    {
      id: "u-17",
      code: "ELITE",
      name: { id: "Pre-Professional Pathway (U-17)" },
      subname: { id: "Family United First Squad" },
      ageRange: { id: "Usia 16 – 17 Tahun", en: "Age 16 – 17 Years" },
      focus: { id: "Jalur Profesional, Ajang Pemandu Bakat & Beasiswa Kuliah", en: "Pro Pathways, Scouting Showcases & College Athletic Grants" },
      schedule: { id: "Selasa, Kamis, Sabtu & Minggu (16:00 - 18:15 WIB)", en: "Tuesday, Thursday, Saturday & Sunday (16:00 - 18:15 WIB)" },
      curriculum: [
        { id: "Kelas pressing tempo tinggi & transisi", en: "High-tempo pressing & transition masterclasses" },
        { id: "Rencana pengembangan atletik individu bersama fisioterapis", en: "Individual athletic development plan with physio" },
        { id: "Laga showcase bersama pemandu bakat Liga 1/Liga 2", en: "Trials showcase matches with Liga 1/Liga 2 scouts" },
        { id: "Persiapan beasiswa universitas & keterampilan hidup", en: "University scholarship prep & life skills coaching" },
      ],
      maxSquadSize: 22,
      fee: "IDR 500.000 / month",
      hasScholarship: true,
    },
  ],
  coaches: [
    {
      name: "Coach Asep Saepuloh",
      role: { id: "Kepala Akademi & Direktur Teknik", en: "Head of Academy & Technical Director" },
      license: 'AFC "B" Coaching License',
      experience: "12+ Years Youth Development · Ex-Persib Bandung U-18 Coaching Staff",
      bio: {
        id: "Berdedikasi menumbuhkan disiplin, nilai keluarga, dan filosofi pressing modern bagi pemuda Padasuka.",
        en: "Dedicated to cultivating discipline, family values, and modern European-inspired pressing philosophy in Padasuka youth.",
      },
    },
    {
      name: "Coach Dimas Pratama",
      role: { id: "Koordinator Teknik Grassroots (U-9/U-12)", en: "Grassroots & Technical Coordinator (U-9/U-12)" },
      license: 'AFC "C" Coaching License & Coerver Certified',
      experience: "8+ Years Youth Training · Bandung Football College",
      bio: {
        id: "Spesialis penguasaan bola 1v1 dan latihan mikro yang membangun kepercayaan diri pemain muda.",
        en: "Specialist in 1v1 ball mastery and micro-drills that build unbreakable confidence in young ballers.",
      },
    },
    {
      name: "Coach Sarah Lestari, S.Or",
      role: { id: "Kepala Kondisi Fisik & Performa Atletik Usia Muda", en: "Head of Youth Conditioning & Athletic Performance" },
      license: "PSSI Physical Conditioning Level 1",
      experience: "6 Years Sports Science · FPOK UPI Bandung Graduate",
      bio: {
        id: "Menyusun biomekanika sesuai usia, rutinitas pencegahan cedera, dan panduan gizi bagi siswa atlet.",
        en: "Designs age-appropriate biomechanics, injury prevention routines, and nutritional guidelines for student athletes.",
      },
    },
    {
      name: "dr. Fikri Maulana, Sp.KO",
      role: { id: "Kepala Tim Medis & Fisioterapis Yayasan", en: "Chief Medical Officer & Foundation Physiotherapist" },
      license: "Certified Sports Medicine Specialist",
      experience: "10 Years Clinical & Field Practice · KONI Jawa Barat Consultant",
      bio: {
        id: "Mengawasi kesejahteraan, rehabilitasi, dan pemantauan kesehatan pemain yang didukung Yayasan Sinar Harapan Bangsa.",
        en: "Oversees player welfare, rehabilitation, and health monitoring funded by Yayasan Sinar Harapan Bangsa.",
      },
    },
  ],
  facilities: [
    {
      title: { id: "Padasuka Mini Stadium & Pitch A (Sintetis)" },
      description: {
        id: "Rumput sintetis generasi terbaru dengan shock-pad peredam cedera lutut. Lampu penerangan malam hari (LED 800 Lux), gawang reguler & mini portable, tribun suporter keluarga.",
      },
    },
    {
      title: { id: "Padasuka Grass Training Ground Pitch B (Alami)" },
      description: {
        id: "Lapangan rumput gajah mini alami terawat untuk adaptasi kompetisi outdoor. Drainase pasir serap air cepat, zona latihan kiper khusus, lintasan sprint keliling.",
      },
    },
    {
      title: { id: "Klinik Pemulihan Atlet & Ruang Fisioterapi" },
      description: {
        id: "Dikelola langsung oleh tim medis dan fisioterapis berlisensi yayasan. Peralatan terapi ultrasound & TENS, fasilitas ice bath recovery, pemeriksaan antropometri berkala.",
      },
    },
    {
      title: { id: "Ruang Analisis Video & Ruang Belajar Yayasan" },
      description: {
        id: 'Tempat evaluasi rekaman pertandingan dan bimbingan belajar kurikulum sekolah. Smart TV 75" untuk tactical briefing, akses internet wifi edukasi, buku referensi olahraga & sains.',
      },
    },
  ],
  matches: [
    {
      tournament: "Piala Soeratin U-15 Jawa Barat 2026",
      round: "Quarter-Final",
      homeTeam: "Family United FA (Padasuka)",
      awayTeam: "Saint Prima Bandung",
      homeScore: 3,
      awayScore: 1,
      date: "2026-10-18",
      time: "15:30",
      venue: "Stadion Arcamanik Bandung",
      status: "finished",
    },
    {
      tournament: "Bandung Youth Premier League 2026",
      round: "Matchday 9 (U-12)",
      homeTeam: "Saswco FC",
      awayTeam: "Family United FA (Padasuka)",
      homeScore: 2,
      awayScore: 2,
      date: "2026-10-12",
      time: "08:30",
      venue: "Lapangan Lodaya Bandung",
      status: "finished",
    },
    {
      tournament: "Piala Soeratin U-15 Jawa Barat 2026",
      round: "Semi-Final",
      homeTeam: "Family United FA (Padasuka)",
      awayTeam: "Bandung Pro United",
      date: "2026-10-25",
      time: "15:45",
      venue: "Stadion Sidolig (Persib), Bandung",
      status: "upcoming",
    },
    {
      tournament: "Trofeo Grassroots Harapan Bangsa 2026",
      round: "Round Robin Festival (U-12)",
      homeTeam: "FUFA Tunas (U-9)",
      awayTeam: "Akademi UNI Bandung",
      date: "2026-10-28",
      time: "08:00",
      venue: "Padasuka Mini Stadium",
      status: "upcoming",
    },
    {
      tournament: "Jawa Barat Youth Cup U-17",
      round: "Group Stage Matchday 3",
      homeTeam: "Family United FA (Padasuka)",
      awayTeam: "Cimahi Football Academy",
      date: "2026-11-02",
      time: "16:00",
      venue: "Padasuka Training Grounds Pitch A",
      status: "upcoming",
    },
  ],
  testimonials: [
    {
      name: "Pak Bambang Nugraha",
      role: { id: "Orang Tua Siswa U-15 & Warga Padasuka" },
      quote: {
        id: "FUFA bukan sekadar sekolah sepak bola, tetapi keluarga kedua bagi anak saya. Berkat beasiswa Yayasan Sinar Harapan Bangsa, anak saya bisa mengejar cita-citanya tanpa kendala biaya.",
      },
    },
    {
      name: "Ibu Ratna Juwita",
      role: { id: "Orang Tua Siswa U-12" },
      quote: {
        id: "Disiplin dan pembinaan karakter yang ditanamkan Coach Asep dan tim pelatih membuat anak kami lebih bertanggung jawab dalam belajar di sekolah umum dan tertib beribadah.",
      },
    },
    {
      name: "Reza Fauzan",
      role: { id: "Alumnus FUFA 2023 / Pemain Liga 3" },
      quote: {
        id: "Dari lapangan tanah Padasuka hingga kini terpilih seleksi Tim Porprov, nilai kekeluargaan dan kerja keras dari FUFA selalu menjadi pondasi saya.",
      },
    },
  ],
};
