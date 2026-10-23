# Email untuk domain akademi

Rancangan dan catatan setup email untuk domain akademi, memakai mail stack yang sudah ada di server zukelabs (`43.156.92.240`, `mail.zukelabs.web.id`).

Status: setup `familyunitedfa.com` sudah jalan di sisi server. Record DNS belum dipasang karena domainnya belum aktif.

## Satu VPS bisa melayani banyak domain

Bisa, dan itu cara kerja standar. Satu server email (Postfix + Dovecot + OpenDKIM di sini) menerima dan mengirim email untuk banyak domain sekaligus. Yang berbeda per domain hanya data di database, kunci DKIM, dan record DNS. Yang dipakai bersama: satu IP, satu hostname server, satu reverse DNS, dan satu sertifikat TLS.

Yang perlu diingat:

- Satu domain per mailbox. Alamat seperti `noreply@familyunitedfa.com` milik domain itu saja.
- PTR (reverse DNS) cukup satu per IP. Hostname di PTR sebaiknya sama dengan yang diperkenalkan server saat mengirim (HELO). Tidak harus sama dengan domain pengirim.
- Reputasi IP dibagi antar domain. Kalau satu domain dilaporkan spam, domain lain di IP itu ikut tertahan.
- Port 25 keluar sering diblokir bawaan VPS. Di server ini port 25 terbuka, jadi email keluar bisa langsung dipakai.

## Mail stack yang ada

| Komponen | Peran | Status |
|---|---|---|
| Postfix | Penerima dan pengirim SMTP | aktif, port 25, 465, 587 |
| Dovecot | POP3 dan IMAP untuk pembacaan mailbox | aktif, port 143, 993, 110, 995 |
| OpenDKIM | Penandatanganan email keluar | aktif, socket 127.0.0.1:8891 |
| PostfixAdmin | Manage domain dan mailbox | aktif, `mail-admin.zukelabs.web.id` |
| MySQL | Penyimpanan domain dan mailbox | aktif, database `postfixadmin` |
| Certbot | Sertifikat TLS | aktif, Let's Encrypt untuk `mail.zukelabs.web.id` |

Konfigurasi penting: Postfix memakai `virtual_mailbox_domains = mysql:/etc/postfix/mysql/virtual_domains.cf`, jadi menambah domain cukup dengan satu baris di database. Tidak perlu `postmap` manual.

Kunci DKIM ada di `/etc/dkimkeys`, dua entri di `keytable` dan `signingtable`:

```
mail._domainkey.zukelabs.web.id zukelabs.web.id:mail:/etc/dkimkeys/mail.private
family._domainkey.familyunitedfa.com familyunitedfa.com:family:/etc/dkimkeys/family.private
```

## Domain familyunitedfa.com

Sisi server sudah disiapkan pada 21 Oktober 2026.

| Yang dibuat | Nilai |
|---|---|
| Domain | `familyunitedfa.com`, deskripsi "Family United Football Academy" |
| Mailbox | `noreply@familyunitedfa.com` (untuk aplikasi), `admin@`, `info@` |
| Selektor DKIM | `family`, RSA 2048 bit, kunci privat di `/etc/dkimkeys/family.private` |
| Tanda tangan | `*@familyunitedfa.com` |

Domain `familyunitedfa.com` belum aktif di DNS saat dokumen ini ditulis (NXDOMAIN, dicek 21 Oktober 2026). Record di bawah harus dipasang lebih dulu, baru email bisa keluar ke internet dan masuk dari luar.

### Record DNS

Semua di panel DNS Domainesia (tanpa proxy).

| Tipe | Nama | Isi | TTL |
|---|---|---|---|
| A | `mail` | `43.156.92.240` | 3600 |
| MX | `@` | `10 mail.zukelabs.web.id` | 3600 |
| TXT | `@` | `v=spf1 mx ip4:43.156.92.240 -all` | 3600 |
| TXT | `mail._domainkey.family` | kunci DKIM (lihat di bawah) | 3600 |
| TXT | `_dmarc.familyunitedfa.com` | `v=DMARC1; p=none; rua=mailto:admin@familyunitedfa.com` | 3600 |

Nama TXT DKIM diisi `family._domainkey` untuk host `familyunitedfa.com`, jadi label penuhnya `family._domainkey.familyunitedfa.com`. Pemeriksaan:

```
dig +short TXT family._domainkey.familyunitedfa.com
```

Kunci publik (dari `/etc/dkimkeys/family.txt`, sudah dipecah jadi satu baris):

```
v=DKIM1; h=sha256; k=rsa; s=email; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzZY7lgslOpXLRklRY/Ylx+9C6WtIjsJ1+rgrSTPndW+SSunl8jObNszF5/V9PH99jXtCO2gqUI0lXGS3WqGxK5Zi6zKMDyvtGhje1FnZnkRCe9MrTsr1d65Cu0YwujtapKQpVARVeZ8ulk0GsRVJCkNVOXXz+mxNLjCphEIR5rW39b9gMV86i71ssNbtKUzGYYYnTZdJwEBDp9Y1nWOwRpteuA3tb3F43WgWYEDVNRdhXjgsAH8VWEC+OAPd7oQiSa4YaI6MFHLE7/zRwlrgUt1+Gmgip6It9Bidgf4KvjjlWIawvnVwBDO9uADKjdWEaBhK9CdGjGAPrK/2N/qDrwIDAQAB
```

Catatan: DNS `familyunitedfa.com` dikelola di Domainesia (bukan Cloudflare). Panel Domainesia memecah TXT yang panjang secara otomatis; itu normal dan tetap dibaca sebagai satu nilai.

Situs landing domain ini ada di server lain (`124.156.192.17`), dan record `@` serta `www` sudah menunjuk ke sana. Jadi yang harus diubah hanya record email:

| Tipe | Nama | Sekarang (23 Okt 2026) | Seharusnya |
|---|---|---|---|
| MX | `@` | `0 familyunitedfa.com` (bawaan) | `10 mail.zukelabs.web.id` |
| A | `mail` | `124.156.192.17` (server landing) | hapus; MX sudah menunjuk ke `mail.zukelabs.web.id` |
| TXT | `@` | belum ada | SPF, sesuai tabel di atas |
| TXT | `family._domainkey` | belum ada | kunci DKIM, sesuai di atas |
| TXT | `_dmarc` | belum ada | DMARC, sesuai di atas |

Vhost sementara untuk domain ini yang sempat dibuat di server zukelabs sudah dihapus.

### Verifikasi

Setelah DNS dipasang:

```
# SPF dan DKIM terbaca
dig +short TXT familyunitedfa.com
dig +short TXT family._domainkey.familyunitedfa.com

# email keluar ditandatangani
echo "uji" | mail -s "uji" -r noreply@familyunitedfa.com info@familyunitedfa.com
sudo journalctl -u opendkim --since '1 min ago' | grep DKIM-Signature
```

Tanda tangan yang benar muncul seperti ini:

```
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/simple; d=familyunitedfa.com;
	s=family; t=...;
```

## Menhubungkan SSB App

Aplikasi memakai satu `SMTP_URL` dan satu `MAIL_FROM` untuk seluruh deployment (lihat `apps/api/src/mail.ts`). Isi `.env` di server:

```
SMTP_URL=smtps://noreply%40familyunitedfa.com:<sandi>@mail.zukelabs.web.id:465
MAIL_FROM="Family United FA <noreply@familyunitedfa.com>"
```

Bagian `noreply%40familyunitedfa.com` harus di-encode karena tanda `@` memisahkan user dan host. Karakter lain yang perlu di-encode: `@` jadi `%40`, `:` jadi `%3A`, `/` jadi `%2F`, `#` jadi `%23`.

Sudah dipasang di server zukelabs pada 21 Oktober 2026, dan email uji terkirim dengan tanda tangan DKIM yang benar.

Setelah `SMTP_URL` diisi, halaman Lupa kata sandi mengirim tautan reset lewat email. Tanpa `SMTP_URL`, halaman itu meminta pengguna menghubungi admin SSB.

## Menambah domain lain

1. Daftarkan domain di PostfixAdmin:

   ```
   sudo postfixadmin-cli domain add <domain> --description "<nama>" --aliases 0 --mailboxes 0 --backupmx 0 --active 1
   ```

2. Buat mailbox:

   ```
   sudo postfixadmin-cli mailbox add <alamat>@<domain> --password '<sandi>' --password2 '<sandi>' --name "<nama>" --quota 0 --active 1
   ```

   Syarat kata sandi PostfixAdmin: minimal 5 karakter, mengandung huruf dan angka, dan minimal 2 digit.

3. Buat kunci DKIM:

   ```
   sudo -u opendkim opendkim-genkey --bits=2048 --domain=<domain> --directory=/etc/dkimkeys --selector=<selektor> --restrict
   ```

   Folder `/etc/dkimkeys` hanya bisa dibaca pengguna `opendkim`, jadi perintah harus dijalankan sebagai user itu.

4. Daftarkan di `keytable` dan `signingtable`, lalu muat ulang OpenDKIM:

   ```
   echo 'family._domainkey.familyunitedfa.com familyunitedfa.com:family:/etc/dkimkeys/family.private' | sudo tee -a /etc/dkimkeys/keytable
   echo '*@familyunitedfa.com family._domainkey.familyunitedfa.com' | sudo tee -a /etc/dkimkeys/signingtable
   sudo systemctl reload opendkim
   ```

5. Pasang record DNS MX, SPF, DKIM, dan DMARC seperti di atas.

## Batasan

- Satu `SMTP_URL` untuk seluruh deployment. Kalau nanti tiap SSB punya domain sendiri dan ingin email dari domainnya masing-masing, perlu pengaturan SMTP per SSB, mirip pengaturan Fonnte yang sudah ada di `docs/fonnte.md`. Itu belum dibuat.
- Tidak ada otomatisasi penerbitan DKIM ke DNS. Record DKIM ditulis manual, atau lewat API DNS bila perlu berulang.
- Email keluar dari `garudamuda.test` dan domain lain tanpa MX-nya sendiri ditolak relay. Itu perilaku normal, bukan cacat.
