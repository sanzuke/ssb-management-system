"""Uji e2e layar auth di 360 px. Butuh: harness API (:3000), web dev (:3001), PostgreSQL.
Pakai: python3 tools/e2e/run.py [folder-screenshot]"""
import datetime, json, re, sys, uuid, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright, expect

WEB = "http://localhost:3001"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/e2e-shots"
import os; os.makedirs(OUT, exist_ok=True)
uid = uuid.uuid4().hex[:8]
PASS = "kata-sandi-panjang-1"
HOME = re.compile(r"^http://localhost:3001/(\?.*)?$")

def set_google(sub, email, name):
    urllib.request.urlopen("http://localhost:3000/__google?" + urllib.parse.urlencode(dict(sub=sub, email=email, name=name))).read()

def no_overflow(page, label):
    w = page.evaluate("document.documentElement.scrollWidth")
    assert w <= 360, f"{label}: scroll horizontal {w}px"

HIDE_DEV_BADGE = "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='div:has(>div>span[data-start-text-size]),div:has(>span[data-start-text-size]){display:none!important}';document.head.append(s)})"

def mkctx(b):
    """Konteks 360 px; lencana devtools SolidStart (hanya mode dev) disembunyikan karena menutupi tombol bawah."""
    c = b.new_context(viewport={"width": 360, "height": 740}, locale="id-ID")
    c.add_init_script(HIDE_DEV_BADGE)
    return c

def api_get(page, path):
    return page.evaluate("""async (p) => (await fetch('/api'+p)).json()""", path)

def api_post(page, path, body):
    return page.evaluate("""async ([p,b]) => { const r = await fetch('/api'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); return {s:r.status, j: await r.json().catch(()=>null)} }""", [path, body])

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome") if os.path.exists("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") else pw.chromium.launch()
    ctx = mkctx(b)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))

    # 1. Halaman masuk dan daftar
    page.goto(f"{WEB}/masuk"); page.wait_for_selector("h1")
    page.wait_for_timeout(1500); page.screenshot(path=f"{OUT}/1-masuk.png"); no_overflow(page, "masuk")
    page.goto(f"{WEB}/daftar"); page.wait_for_selector("h1"); no_overflow(page, "daftar")
    page.screenshot(path=f"{OUT}/2-daftar.png", full_page=True)

    # 2. Daftar SSB dengan email
    page.get_by_label("Nama SSB").fill(f"SSB Uji {uid}")
    assert page.get_by_label("Kode SSB").input_value() == f"ssb-uji-{uid}", page.get_by_label("Kode SSB").input_value()
    page.get_by_label("Nama Anda").fill("Admin Uji")
    page.get_by_label("Email").fill(f"admin-{uid}@uji.test")
    page.get_by_label("Kata sandi").fill(PASS)
    page.get_by_role("button", name="Daftar dengan email").click()
    page.wait_for_url(HOME); expect(page.get_by_role("heading", name="Halo, Admin Uji")).to_be_visible()
    page.screenshot(path=f"{OUT}/3-beranda.png"); no_overflow(page, "beranda")

    # 2b. Data master: KU (tumpang tindih ditolak), periode, lokasi
    page.get_by_role("link", name="Data master").click(); page.wait_for_url("**/master")
    expect(page.get_by_role("heading", name="Data master")).to_be_visible()
    page.get_by_role("button", name="Tambah KU").click()
    page.get_by_label("Nama KU").fill("KU-10"); page.get_by_label("Usia minimal (tahun)").fill("9"); page.get_by_label("Usia maksimal (tahun)").fill("10")
    page.get_by_role("button", name="Simpan").click(); expect(page.get_by_text("KU-10, usia 9 sampai 10 tahun")).to_be_visible()
    page.get_by_role("button", name="Tambah KU").click()
    page.get_by_label("Nama KU").fill("KU-12"); page.get_by_label("Usia minimal (tahun)").fill("10"); page.get_by_label("Usia maksimal (tahun)").fill("12")
    page.get_by_role("button", name="Simpan").click(); expect(page.get_by_role("alert")).to_contain_text("tumpang tindih")
    page.screenshot(path=f"{OUT}/10-master-tumpang.png", full_page=True); no_overflow(page, "master tumpang")
    page.get_by_label("Usia minimal (tahun)").fill("11"); page.get_by_role("button", name="Simpan").click()
    expect(page.get_by_text("KU-12, usia 11 sampai 12 tahun")).to_be_visible()
    page.get_by_role("button", name="Tambah periode").click()
    page.get_by_label("Nama periode").fill("Musim 2026/27"); page.get_by_label("Tanggal mulai").fill("2026-08-01"); page.get_by_label("Tanggal selesai").fill("2027-05-31")
    page.get_by_role("button", name="Simpan").click(); expect(page.get_by_text("Musim 2026/27, ")).to_be_visible()
    page.get_by_role("button", name="Tambah lokasi").click()
    page.get_by_label("Nama lokasi").fill("Lapangan Utama"); page.get_by_role("button", name="Simpan").click()
    expect(page.get_by_text("Lapangan Utama")).to_be_visible()
    # hapus dengan konfirmasi
    page.get_by_role("button", name="Hapus").last.click(); page.get_by_role("button", name="Ya, hapus").click()
    expect(page.get_by_text("Belum ada lokasi")).to_be_visible()
    page.screenshot(path=f"{OUT}/11-master.png", full_page=True); no_overflow(page, "master")

    # 2c. Pemain: kosong, tambah, cari, ubah (riwayat)
    page.goto(f"{WEB}/pemain"); expect(page.get_by_text("Belum ada pemain")).to_be_visible()
    page.get_by_role("link", name="Tambah pemain").click(); page.wait_for_url("**/pemain/baru")
    page.get_by_label("Nama lengkap").fill("Budi Santoso"); page.get_by_label("Tanggal lahir").fill("2016-04-05")
    page.get_by_label("Kelompok usia (KU)").select_option(label="KU-10 (usia 9 sampai 10)")
    page.get_by_role("button", name="Tambah pemain").click()
    expect(page.get_by_role("heading", name="Budi Santoso")).to_be_visible(); expect(page.get_by_text("P0001")).to_be_visible()
    page.screenshot(path=f"{OUT}/12-pemain-detail.png", full_page=True); no_overflow(page, "pemain detail")
    page.goto(f"{WEB}/pemain/baru")
    page.get_by_label("Nama lengkap").fill("Andi Pratama"); page.get_by_label("Tanggal lahir").fill("2014-09-20")
    page.get_by_label("Kelompok usia (KU)").select_option(label="KU-12 (usia 11 sampai 12)")
    page.get_by_role("button", name="Tambah pemain").click(); expect(page.get_by_text("P0002")).to_be_visible()
    page.goto(f"{WEB}/pemain"); expect(page.get_by_text("2 pemain")).to_be_visible()
    page.screenshot(path=f"{OUT}/13-pemain-daftar.png", full_page=True); no_overflow(page, "pemain daftar")
    page.get_by_label("Cari nama").fill("andi"); expect(page.get_by_text("1 pemain")).to_be_visible()
    expect(page.get_by_text("Budi Santoso")).to_have_count(0)
    page.get_by_label("Cari nama").fill(""); page.get_by_label("Cari nama").press("Tab")
    page.get_by_role("link", name="Budi Santoso").click(); page.get_by_role("button", name="Ubah data pemain").click()
    page.get_by_label("Status").select_option(label="Cuti"); page.get_by_role("button", name="Simpan perubahan").click()
    expect(page.get_by_text("Perubahan disimpan")).to_be_visible(); expect(page.get_by_text("Status: Aktif menjadi Cuti")).to_be_visible()
    page.screenshot(path=f"{OUT}/14-pemain-riwayat.png", full_page=True); no_overflow(page, "pemain riwayat")

    # 3. Undangan, dibuat admin lewat API (sesi cookie browser)
    inv = api_post(page, "/invitations", {"role": "pelatih", "label": "Pelatih KU-10"})
    assert inv["s"] in (200, 201), inv
    token = inv["j"]["token"]

    # 4. Akun: ganti kata sandi
    page.goto(f"{WEB}/akun"); page.wait_for_selector("h1")
    page.get_by_label("Kata sandi saat ini").fill(PASS)
    page.get_by_label("Kata sandi baru").fill("kata-sandi-baru-22")
    page.get_by_role("button", name="Simpan kata sandi").click()
    expect(page.get_by_text("Kata sandi disimpan")).to_be_visible()
    page.screenshot(path=f"{OUT}/4-akun.png"); no_overflow(page, "akun")
    PASS2 = "kata-sandi-baru-22"

    # 5. Keluar, masuk gagal lalu berhasil
    page.get_by_role("button", name="Keluar").click(); page.wait_for_url(f"{WEB}/masuk")
    page.get_by_label("Email").fill(f"admin-{uid}@uji.test"); page.get_by_label("Kata sandi").fill("salah-salah-1")
    page.get_by_role("button", name="Masuk", exact=True).click()
    expect(page.get_by_role("alert")).to_be_visible(); page.screenshot(path=f"{OUT}/5-masuk-gagal.png"); no_overflow(page, "masuk gagal")
    page.get_by_label("Kata sandi").fill(PASS2); page.get_by_role("button", name="Masuk", exact=True).click()
    page.wait_for_url(HOME); expect(page.get_by_role("heading", name="Halo, Admin Uji")).to_be_visible()

    # 6. Undangan sebagai pengunjung baru (konteks bersih), terima dengan email
    ctx2 = mkctx(b); p2 = ctx2.new_page()
    p2.goto(f"{WEB}/undangan/{token}"); expect(p2.get_by_role("heading", name=f"Bergabung dengan SSB Uji {uid}")).to_be_visible()
    p2.screenshot(path=f"{OUT}/6-undangan.png", full_page=True); no_overflow(p2, "undangan")
    p2.get_by_label("Nama Anda").fill("Pelatih Uji"); p2.get_by_label("Email").fill(f"pelatih-{uid}@uji.test"); p2.get_by_label("Kata sandi").fill(PASS)
    p2.get_by_role("button", name="Buat akun dan bergabung").click()
    p2.wait_for_url(HOME); expect(p2.get_by_text("sebagai Pelatih")).to_be_visible()
    # Penugasan lewat layar admin; pelatih lalu hanya melihat KU-nya
    page.goto(f"{WEB}/penugasan"); expect(page.get_by_text("Belum ada penugasan")).to_be_visible()
    page.get_by_label("Pelatih atau korlas").select_option(label="Pelatih Uji (Pelatih)")
    page.get_by_label("KU", exact=True).select_option(label="KU-10"); page.get_by_label("Periode", exact=True).select_option(label="Musim 2026/27")
    page.get_by_role("button", name="Tambah penugasan").click(); expect(page.get_by_text("Pelatih Uji (Pelatih), KU-10, Musim 2026/27")).to_be_visible()
    page.screenshot(path=f"{OUT}/15-penugasan.png", full_page=True); no_overflow(page, "penugasan")
    p2.goto(f"{WEB}/pemain");
    expect(p2.get_by_text("1 pemain")).to_be_visible(); expect(p2.get_by_text("Budi Santoso")).to_be_visible(); expect(p2.get_by_text("Andi Pratama")).to_have_count(0)
    expect(p2.get_by_role("link", name="Tambah pemain")).to_have_count(0); p2.screenshot(path=f"{OUT}/16-pemain-pelatih.png", full_page=True)
    # Jadwal: admin menjadwalkan (berulang), pelatih mengisi absensi sekali ketuk
    today = datetime.date.today(); iso = lambda n: (today + datetime.timedelta(days=n)).isoformat()
    ku10 = [g for g in api_get(page, "/age-groups") if g["name"] == "KU-10"][0]["id"]
    for n in ("Cakra Uji", "Dodi Uji", "Eko Uji"):
        assert api_post(page, "/players", {"fullName": n, "birthDate": "2016-06-06", "ageGroupId": ku10})["s"] == 201
    page.goto(f"{WEB}/jadwal"); expect(page.get_by_text("Belum ada sesi latihan")).to_be_visible()
    page.get_by_role("button", name="Tambah sesi").click()
    page.get_by_label("KU", exact=True).select_option(label="KU-10"); page.get_by_label("Tanggal", exact=True).fill(iso(0)); page.get_by_label("Jam mulai (boleh dikosongkan)").fill("16:00")
    page.get_by_label("Ulangi tiap minggu di hari yang sama").check(); page.get_by_label("Ulangi sampai tanggal").fill(iso(14))
    page.get_by_role("button", name="Simpan jadwal").click(); expect(page.get_by_text("3 sesi dijadwalkan.")).to_be_visible()
    expect(page.get_by_text("KU-10, jam 16:00")).to_have_count(3)
    page.screenshot(path=f"{OUT}/17-jadwal-admin.png", full_page=True); no_overflow(page, "jadwal admin")
    p2.goto(f"{WEB}/jadwal"); expect(p2.get_by_text("KU-10, jam 16:00")).to_have_count(3)
    expect(p2.get_by_role("button", name="Tambah sesi")).to_have_count(0)
    p2.get_by_text("KU-10, jam 16:00").first.click(); expect(p2.get_by_role("heading", name="Absensi KU-10")).to_be_visible()
    expect(p2.get_by_text("Budi Santoso")).to_have_count(0)  # status cuti tidak masuk daftar
    t0 = datetime.datetime.now()
    p2.get_by_role("button", name="Tandai semua yang belum diisi hadir").click()
    p2.get_by_role("group", name="Kehadiran Cakra Uji").get_by_role("button", name="Sakit").click()
    p2.get_by_role("group", name="Kehadiran Dodi Uji").get_by_role("button", name="Alpa").click()
    p2.get_by_role("button", name="Simpan absensi").click(); expect(p2.get_by_text("Absensi disimpan")).to_be_visible()
    print("waktu isi absensi (otomatis, bukan uji manusia):", (datetime.datetime.now() - t0).total_seconds(), "dtk")
    expect(p2.get_by_text("1 hadir, 0 izin, 1 sakit, 1 alpa, 0 belum")).to_be_visible()
    p2.screenshot(path=f"{OUT}/18-absensi.png", full_page=True); no_overflow(p2, "absensi")
    page.goto(f"{WEB}/jadwal"); expect(page.get_by_text("1 hadir, 1 sakit, 1 alpa")).to_be_visible()
    page.get_by_role("button", name="Hapus").first.click(); page.get_by_role("button", name="Ya, hapus").click()
    expect(page.get_by_role("alert")).to_contain_text("sudah punya absensi")
    # Rekap kehadiran: admin melihat semua, pelatih hanya KU-nya
    page.goto(f"{WEB}/kehadiran"); expect(page.get_by_text("1 sesi latihan tercatat pada")).to_be_visible()
    expect(page.get_by_text("0 hadir, 0 izin, 1 sakit, 0 alpa dari 1 sesi")).to_be_visible()
    expect(page.get_by_text("100%")).to_be_visible(); expect(page.get_by_text("belum ada catatan").first).to_be_visible()
    page.screenshot(path=f"{OUT}/19-kehadiran-admin.png", full_page=True); no_overflow(page, "kehadiran admin")
    page.get_by_label("KU", exact=True).select_option(label="KU-12"); expect(page.get_by_text("Cakra Uji")).to_have_count(0)
    p2.goto(f"{WEB}/kehadiran"); expect(p2.get_by_text("Cakra Uji")).to_be_visible(); expect(p2.get_by_text("Andi Pratama")).to_have_count(0)
    p2.screenshot(path=f"{OUT}/20-kehadiran-pelatih.png", full_page=True); no_overflow(p2, "kehadiran pelatih")
    # Portal orang tua: undangan untuk Eko Uji, lalu lihat beranda
    eko = [p for p in api_get(page, "/players") if p["fullName"] == "Eko Uji"][0]["id"]
    invo = api_post(page, "/invitations", {"role": "orang_tua", "playerId": eko}); assert invo["s"] in (200, 201), invo
    cto = mkctx(b); po = cto.new_page()
    po.goto(f"{WEB}/undangan/{invo['j']['token']}"); po.wait_for_selector("h1")
    po.get_by_label("Nama Anda").fill("Ortu Eko"); po.get_by_label("Email").fill(f"ortu-{uid}@uji.test"); po.get_by_label("Kata sandi").fill(PASS)
    po.get_by_role("button", name="Buat akun dan bergabung").click()
    expect(po.get_by_role("heading", name="Anak Anda")).to_be_visible(); expect(po.get_by_role("link", name="Eko Uji")).to_be_visible()
    expect(po.get_by_text("hadir 1 dari 1 sesi")).to_be_visible(); expect(po.get_by_text("Latihan mendatang")).to_be_visible()
    expect(po.get_by_text("Hadir", exact=True)).to_be_visible(); expect(po.get_by_text("Andi Pratama")).to_have_count(0)
    po.screenshot(path=f"{OUT}/21-beranda-orang-tua.png", full_page=True); no_overflow(po, "beranda orang tua")
    po.goto(f"{WEB}/pemain/{[p for p in api_get(page, '/players') if p['fullName'] == 'Cakra Uji'][0]['id']}"); expect(po.get_by_text("tidak ditemukan", exact=False).first).to_be_visible()
    # Kartu pemain: tampil lengkap, QR terbaca kamera dan menunjuk profil anak; kartu anak lain tertutup
    po.goto(f"{WEB}/"); po.get_by_role("link", name="Kartu").click()
    expect(po.get_by_role("heading", name="Kartu pemain")).to_be_visible(); expect(po.get_by_text("Eko Uji", exact=True)).to_be_visible(); expect(po.get_by_text("KU-10", exact=True)).to_be_visible()
    po.locator("svg.qr").screenshot(path=f"{OUT}/22-qr.png"); po.screenshot(path=f"{OUT}/22-kartu.png", full_page=True); no_overflow(po, "kartu")
    import cv2
    img = cv2.imread(f"{OUT}/22-qr.png"); data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    assert data == f"{WEB}/pemain/{eko}", f"isi QR salah: {data!r}"
    cakra = [p for p in api_get(page, "/players") if p["fullName"] == "Cakra Uji"][0]["id"]
    po.goto(f"{WEB}/kartu/{cakra}"); expect(po.get_by_role("heading", name="Kartu tidak ditemukan")).to_be_visible()
    page.goto(f"{WEB}/kartu/{cakra}"); expect(page.get_by_text("Cakra Uji", exact=True)).to_be_visible()
    # Penilaian (skala 1-10): admin menyiapkan indikator, pelatih menilai di HP, admin menerbitkan, orang tua melihat
    page.goto(f"{WEB}/indikator"); expect(page.get_by_role("heading", name="Indikator penilaian")).to_be_visible()
    page.get_by_label("KU", exact=True).select_option(label="KU-10")
    page.get_by_role("button", name="Pasang usulan awal").click(); expect(page.get_by_text("Usulan awal dipasang")).to_be_visible(); expect(page.get_by_text("Kontrol bola", exact=True)).to_be_visible()
    page.get_by_label("Aspek", exact=True).select_option(label="Mental"); page.get_by_label("Nama indikator").fill("Disiplin")
    page.get_by_role("button", name="Tambah indikator").click(); expect(page.get_by_text("Indikator ditambahkan.")).to_be_visible()
    page.screenshot(path=f"{OUT}/23-indikator.png", full_page=True); no_overflow(page, "indikator")
    invc = api_post(page, "/invitations", {"role": "orang_tua", "playerId": cakra}); assert invc["s"] in (200, 201), invc
    ctc = mkctx(b); pc = ctc.new_page()
    pc.goto(f"{WEB}/undangan/{invc['j']['token']}"); pc.wait_for_selector("h1")
    pc.get_by_label("Nama Anda").fill("Ortu Cakra"); pc.get_by_label("Email").fill(f"ortu-cakra-{uid}@uji.test"); pc.get_by_label("Kata sandi").fill(PASS)
    pc.get_by_role("button", name="Buat akun dan bergabung").click(); expect(pc.get_by_role("heading", name="Anak Anda")).to_be_visible()
    pc.get_by_role("link", name="Penilaian").click(); expect(pc.get_by_text("Belum ada penilaian yang diterbitkan")).to_be_visible()
    p2.goto(f"{WEB}/nilai/{cakra}"); expect(p2.get_by_role("heading", name="Penilaian Cakra Uji")).to_be_visible()
    for nm in ("Kontrol bola 8", "Passing 6", "Fokus 9"): p2.get_by_role("button", name=nm, exact=True).click()
    expect(p2.get_by_text("3 dari 17 indikator terisi")).to_be_visible()
    p2.get_by_label("Catatan pelatih").fill("Cepat belajar, perlu lebih tenang di depan gawang.")
    p2.screenshot(path=f"{OUT}/24-nilai-input.png", full_page=True); no_overflow(p2, "nilai input")
    p2.get_by_role("button", name="Simpan penilaian").click(); expect(p2.get_by_text("Penilaian disimpan")).to_be_visible()
    expect(p2.get_by_role("button", name="Terbitkan ke orang tua")).to_have_count(0)  # pelatih tidak menerbitkan
    p2.get_by_text("Riwayat perubahan skor").click(); expect(p2.get_by_text("diisi 8")).to_be_visible()
    page.goto(f"{WEB}/nilai/{cakra}"); expect(page.get_by_text("Belum diterbitkan ke orang tua")).to_be_visible()
    page.get_by_role("button", name="Terbitkan ke orang tua").click(); expect(page.get_by_text("Penilaian diterbitkan")).to_be_visible()
    pc.reload(); expect(pc.get_by_text("Kontrol bola", exact=True)).to_be_visible(); expect(pc.get_by_text("Cepat belajar")).to_be_visible(); expect(pc.locator(".hasil-total .persen").first).to_have_text("7,7")
    # Periode kedua: grafik perkembangan dan radar (hanya satu periode -> belum ada garis perkembangan)
    pc.reload(); expect(pc.get_by_text("Grafik perkembangan muncul setelah dua periode")).to_be_visible()
    pc.screenshot(path=f"{OUT}/26-grafik-satu-periode.png", full_page=True); no_overflow(pc, "grafik satu periode")
    per2 = api_post(page, "/periods", {"name": "Musim 2027/28", "startDate": "2027-08-01", "endDate": "2028-05-31"}); assert per2["s"] in (200, 201), per2
    p2.goto(f"{WEB}/nilai/{cakra}"); p2.get_by_label("Periode", exact=True).select_option(label="Musim 2027/28")
    for nm in ("Kontrol bola 9", "Passing 8", "Fokus 9", "Kecepatan 8", "Penempatan posisi 7", "Pengambilan keputusan 6", "Koordinasi 9"): p2.get_by_role("button", name=nm, exact=True).click()
    p2.get_by_role("button", name="Simpan penilaian").click(); expect(p2.get_by_text("Penilaian disimpan")).to_be_visible()
    page.goto(f"{WEB}/nilai/{cakra}"); page.get_by_label("Periode", exact=True).select_option(label="Musim 2027/28")
    page.get_by_role("button", name="Terbitkan ke orang tua").click(); expect(page.get_by_text("Penilaian diterbitkan")).to_be_visible()
    pc.reload(); expect(pc.get_by_role("img", name="Radar enam aspek periode Musim 2027/28 dibanding Musim 2026/27")).to_be_visible()
    expect(pc.get_by_role("img", name="Rata-rata per periode: Musim 2026/27 7,7, Musim 2027/28 8")).to_be_visible()
    pc.screenshot(path=f"{OUT}/26-grafik-orang-tua.png", full_page=True); no_overflow(pc, "grafik orang tua")
    p2.goto(f"{WEB}/nilai/{cakra}"); p2.get_by_text("Grafik perkembangan").click()
    expect(p2.get_by_text("Radar muncul bila minimal tiga aspek sudah punya skor. Saat ini 2 aspek terisi.")).to_be_visible()
    p2.get_by_label("Periode", exact=True).select_option(label="Musim 2027/28")
    expect(p2.get_by_role("img", name="Radar enam aspek periode Musim 2027/28 dibanding Musim 2026/27")).to_be_visible()
    p2.screenshot(path=f"{OUT}/27-grafik-pelatih.png", full_page=True); no_overflow(p2, "grafik pelatih")
    page.goto(f"{WEB}/nilai/{cakra}"); page.get_by_label("Periode", exact=True).select_option(label="Musim 2027/28")
    page.get_by_role("button", name="Tarik dari orang tua").click(); expect(page.get_by_text("Penilaian ditarik")).to_be_visible()
    page.get_by_label("Periode", exact=True).select_option(label="Musim 2026/27")
    pc.screenshot(path=f"{OUT}/25-nilai-orang-tua.png", full_page=True); no_overflow(pc, "nilai orang tua")
    po.goto(f"{WEB}/nilai/{cakra}"); expect(po.get_by_role("heading", name="Pemain tidak ditemukan")).to_be_visible()  # orang tua Eko tidak bisa melihat anak lain
    page.get_by_role("button", name="Tarik dari orang tua").click(); expect(page.get_by_text("Penilaian ditarik")).to_be_visible()
    pc.reload(); expect(pc.get_by_text("Belum ada penilaian yang diterbitkan")).to_be_visible()

    # tautan sama tidak bisa dipakai lagi
    p2.goto(f"{WEB}/undangan/{token}"); expect(p2.get_by_role("heading", name="Undangan tidak berlaku")).to_be_visible()
    p2.screenshot(path=f"{OUT}/7-undangan-pakai-ulang.png")

    # 7. Google: daftar SSB baru dengan akun Google, lalu undangan kedua -> dua SSB -> pemilih
    ctx3 = mkctx(b); p3 = ctx3.new_page()
    set_google(f"g-{uid}", f"gadmin-{uid}@uji.test", "Admin Google")
    p3.goto(f"{WEB}/daftar"); p3.get_by_label("Nama SSB").fill(f"SSB Google {uid}")
    p3.get_by_role("button", name="Daftar dengan Google").click()
    p3.wait_for_url(HOME); expect(p3.get_by_role("heading", name="Halo, Admin Google")).to_be_visible()
    inv2 = api_post(p3, "/invitations", {"role": "korlas"}); tok2 = inv2["j"]["token"]
    # Akun email (Pelatih) sudah masuk di p2: terima undangan kedua -> punya dua SSB
    p2.goto(f"{WEB}/undangan/{tok2}"); p2.get_by_role("button", name="Gabung sebagai Koordinator kelompok usia").click()
    p2.wait_for_url(HOME)
    p2.goto(f"{WEB}/pilih-ssb"); expect(p2.get_by_role("heading", name="Pilih SSB")).to_be_visible()
    p2.screenshot(path=f"{OUT}/8-pilih-ssb.png"); no_overflow(p2, "pilih-ssb")
    p2.get_by_role("button", name=f"SSB Google {uid}").click(); p2.wait_for_url(HOME)
    expect(p2.get_by_text("sebagai Koordinator kelompok usia")).to_be_visible()

    # 8. Google untuk akun tak dikenal -> pesan jelas
    ctx4 = mkctx(b); p4 = ctx4.new_page()
    set_google(f"asing-{uid}", f"asing-{uid}@uji.test", "Asing")
    p4.goto(f"{WEB}/masuk"); p4.get_by_role("link", name="Masuk dengan Google").click()
    p4.wait_for_url("**/masuk?error=*"); expect(p4.get_by_role("alert")).to_be_visible()
    p4.screenshot(path=f"{OUT}/9-google-asing.png"); print("pesan:", p4.get_by_role("alert").inner_text())

    errors = [e for e in errors if "401" not in e and "409" not in e and "resolve-uri" not in e]  # 401 = cek sesi saat belum masuk; 409 = penolakan KU tumpang tindih yang disengaja; resolve-uri = galat dev Vite saja
    assert not errors, errors
    print("SEMUA LOLOS; screenshot di", OUT)
    b.close()
