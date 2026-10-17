"""Uji e2e layar auth di 360 px. Butuh: harness API (:3000), web dev (:3001), PostgreSQL.
Pakai: python3 tools/e2e/run.py [folder-screenshot]"""
import json, re, sys, uuid, urllib.request, urllib.parse
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

def api_post(page, path, body):
    return page.evaluate("""async ([p,b]) => { const r = await fetch('/api'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); return {s:r.status, j: await r.json().catch(()=>null)} }""", [path, body])

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome") if os.path.exists("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") else pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, locale="id-ID")
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
    ctx2 = b.new_context(viewport={"width": 360, "height": 740}, locale="id-ID"); p2 = ctx2.new_page()
    p2.goto(f"{WEB}/undangan/{token}"); expect(p2.get_by_role("heading", name=f"Bergabung dengan SSB Uji {uid}")).to_be_visible()
    p2.screenshot(path=f"{OUT}/6-undangan.png", full_page=True); no_overflow(p2, "undangan")
    p2.get_by_label("Nama Anda").fill("Pelatih Uji"); p2.get_by_label("Email").fill(f"pelatih-{uid}@uji.test"); p2.get_by_label("Kata sandi").fill(PASS)
    p2.get_by_role("button", name="Buat akun dan bergabung").click()
    p2.wait_for_url(HOME); expect(p2.get_by_text("sebagai Pelatih")).to_be_visible()
    # tautan sama tidak bisa dipakai lagi
    p2.goto(f"{WEB}/undangan/{token}"); expect(p2.get_by_role("heading", name="Undangan tidak berlaku")).to_be_visible()
    p2.screenshot(path=f"{OUT}/7-undangan-pakai-ulang.png")

    # 7. Google: daftar SSB baru dengan akun Google, lalu undangan kedua -> dua SSB -> pemilih
    ctx3 = b.new_context(viewport={"width": 360, "height": 740}, locale="id-ID"); p3 = ctx3.new_page()
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
    ctx4 = b.new_context(viewport={"width": 360, "height": 740}, locale="id-ID"); p4 = ctx4.new_page()
    set_google(f"asing-{uid}", f"asing-{uid}@uji.test", "Asing")
    p4.goto(f"{WEB}/masuk"); p4.get_by_role("link", name="Masuk dengan Google").click()
    p4.wait_for_url("**/masuk?error=*"); expect(p4.get_by_role("alert")).to_be_visible()
    p4.screenshot(path=f"{OUT}/9-google-asing.png"); print("pesan:", p4.get_by_role("alert").inner_text())

    errors = [e for e in errors if "401" not in e and "409" not in e and "resolve-uri" not in e]  # 401 = cek sesi saat belum masuk; 409 = penolakan KU tumpang tindih yang disengaja; resolve-uri = galat dev Vite saja
    assert not errors, errors
    print("SEMUA LOLOS; screenshot di", OUT)
    b.close()
