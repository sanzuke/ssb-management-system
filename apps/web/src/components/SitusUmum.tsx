import { Index, Show } from "solid-js";
import { angka, geser, isi, type Sunting, ubahDi } from "~/lib/situs";
import Field from "./Field";
import { Butir, Lokal } from "./SitusKolom";

export function SitusIdentitas(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Identitas">
      <h2>Identitas akademi</h2>
      <p class="petunjuk">Nama, kontak, dan alamat yang tampil di kepala halaman, bagian kontak, dan kaki halaman.</p>
      <form class="form" onSubmit={(e) => e.preventDefault()}>
        <Field
          id="id-nama"
          label="Nama yayasan atau badan"
          hint="Nama resmi penaung. Tampil di kaki halaman (Inisiatif binaan ...) dan pesan WhatsApp, bukan di judul."
          value={d.identity.name}
          onInput={(v) => ubah((x) => isi(x.identity, "name", v))}
          error={salah("identity.name")}
          maxlength={200}
        />
        <Field
          id="id-merek"
          label="Nama merek (judul situs)"
          hint="Nama yang tampil di judul halaman, tab peramban, header, kaki halaman, dan formulir trial."
          value={d.identity.brandName}
          onInput={(v) => ubah((x) => isi(x.identity, "brandName", v))}
          error={salah("identity.brandName")}
          maxlength={200}
        />
        <Field
          id="id-singkat"
          label="Nama singkat (opsional)"
          value={d.identity.shortName ?? ""}
          onInput={(v) => ubah((x) => isi(x.identity, "shortName", v))}
          error={salah("identity.shortName")}
          maxlength={200}
        />
        <Field
          id="id-akronim"
          label="Singkatan (opsional)"
          value={d.identity.acronym ?? ""}
          onInput={(v) => ubah((x) => isi(x.identity, "acronym", v))}
          error={salah("identity.acronym")}
          maxlength={12}
        />
        <Field
          id="id-tahun"
          label="Tahun berdiri (opsional)"
          type="number"
          inputmode="numeric"
          value={d.identity.foundedYear?.toString() ?? ""}
          onInput={(v) =>
            ubah((x) => {
              const n = angka(v);
              if (n === undefined) delete x.identity.foundedYear;
              else x.identity.foundedYear = n;
            })
          }
          error={salah("identity.foundedYear")}
        />
        <Lokal
          id="id-motto"
          label="Motto"
          value={d.identity.motto}
          onChange={(v) => ubah((x) => isi(x.identity, "motto", v))}
          jalur="identity.motto"
          salah={salah}
        />
        <Field
          id="id-alamat"
          label="Alamat"
          value={d.identity.address}
          onInput={(v) => ubah((x) => isi(x.identity, "address", v))}
          error={salah("identity.address")}
          maxlength={500}
        />
        <Field
          id="id-venue"
          label="Lokasi latihan dan laga (opsional)"
          value={d.identity.venue ?? ""}
          onInput={(v) => ubah((x) => isi(x.identity, "venue", v))}
          error={salah("identity.venue")}
          maxlength={300}
        />
        <Field
          id="id-telp"
          label="Telepon"
          type="tel"
          inputmode="tel"
          value={d.identity.phone}
          onInput={(v) => ubah((x) => isi(x.identity, "phone", v))}
          error={salah("identity.phone")}
          maxlength={40}
        />
        <Field
          id="id-email"
          label="Email"
          type="email"
          inputmode="email"
          value={d.identity.email}
          onInput={(v) => ubah((x) => isi(x.identity, "email", v))}
          error={salah("identity.email")}
          maxlength={200}
        />
        <Field
          id="id-wa"
          label="WhatsApp sekretariat"
          inputmode="numeric"
          value={d.identity.whatsapp}
          onInput={(v) => ubah((x) => isi(x.identity, "whatsapp", v))}
          error={salah("identity.whatsapp")}
          hint="Format internasional tanpa plus dan spasi, mis. 6281234567890. Dipakai tombol Tanya Sekretariat."
          maxlength={15}
        />
      </form>
    </section>
  );
}

export function SitusBeranda(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <>
      <section class="master" aria-label="Sorotan utama">
        <h2>Sorotan utama</h2>
        <p class="petunjuk">Bagian paling atas halaman: judul besar, kalimat pendukung, dan tombol ajakan mendaftar.</p>
        <div class="form">
          <Lokal
            id="hero-eyebrow"
            label="Label kecil di atas judul (opsional)"
            value={d.hero.eyebrow}
            onChange={(v) => ubah((x) => isi(x.hero, "eyebrow", v))}
            jalur="hero.eyebrow"
            salah={salah}
          />
          <Lokal id="hero-judul" label="Judul" value={d.hero.title} onChange={(v) => ubah((x) => isi(x.hero, "title", v))} jalur="hero.title" salah={salah} />
          <Lokal
            id="hero-sub"
            label="Kalimat pendukung"
            panjang
            value={d.hero.subtitle}
            onChange={(v) => ubah((x) => isi(x.hero, "subtitle", v))}
            jalur="hero.subtitle"
            salah={salah}
          />
          <Lokal
            id="hero-cta"
            label="Teks tombol daftar"
            value={d.hero.primaryCta}
            onChange={(v) => ubah((x) => isi(x.hero, "primaryCta", v))}
            jalur="hero.primaryCta"
            salah={salah}
          />
        </div>
      </section>

      <section class="master" aria-label="Angka sorotan">
        <h2>Angka sorotan</h2>
        <p class="petunjuk">Deretan angka singkat, mis. jumlah pemain aktif. Isi hanya angka yang benar dan bisa dipertanggungjawabkan. Maksimal 8.</p>
        <Index each={d.stats}>
          {(_, i) => (
            <Butir
              judul={`Angka ${i + 1}`}
              i={i}
              jumlah={d.stats.length}
              geser={(a) => ubah((x) => geser(x.stats, i, a))}
              hapus={() => ubah((x) => void x.stats.splice(i, 1))}
            >
              <div class="form">
                <Field
                  id={`stat-${i}-nilai`}
                  label="Nilai"
                  value={d.stats[i]?.value ?? ""}
                  onInput={(v) => ubah((x) => ubahDi(x.stats, i, (b) => isi(b, "value", v)))}
                  error={salah(`stats.${i}.value`)}
                  maxlength={200}
                />
                <Lokal
                  id={`stat-${i}-label`}
                  label="Keterangan"
                  value={d.stats[i]?.label}
                  onChange={(v) => ubah((x) => ubahDi(x.stats, i, (b) => isi(b, "label", v)))}
                  jalur={`stats.${i}.label`}
                  salah={salah}
                />
              </div>
            </Butir>
          )}
        </Index>
        <Show when={d.stats.length < 8}>
          <button class="tombol" type="button" onClick={() => ubah((x) => void x.stats.push({ label: { id: "" }, value: "" }))}>
            Tambah angka
          </button>
        </Show>
      </section>
    </>
  );
}

export function SitusCerita(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Cerita">
      <h2>Cerita akademi</h2>
      <p class="petunjuk">Sejarah singkat atau latar belakang yayasan. Kosongkan kedua kolom Indonesia bila bagian ini tidak ingin ditampilkan.</p>
      <div class="form">
        <Lokal
          id="cerita-judul"
          label="Judul"
          value={d.story?.title}
          onChange={(v) => ubah((x) => isi(x, "story", { title: v, body: x.story?.body ?? { id: "" } }))}
          jalur="story.title"
          salah={salah}
        />
        <Lokal
          id="cerita-isi"
          label="Isi"
          panjang
          value={d.story?.body}
          onChange={(v) => ubah((x) => isi(x, "story", { title: x.story?.title ?? { id: "" }, body: v }))}
          jalur="story.body"
          salah={salah}
        />
      </div>
    </section>
  );
}

const MEDIA = [
  { kunci: "instagram", label: "Instagram" },
  { kunci: "youtube", label: "YouTube" },
  { kunci: "facebook", label: "Facebook" },
  { kunci: "tiktok", label: "TikTok" },
] as const;

export function SitusTautan(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Media sosial">
      <h2>Media sosial</h2>
      <p class="petunjuk">Alamat lengkap diawali https://. Yang kosong tidak ditampilkan.</p>
      <div class="form">
        {MEDIA.map((m) => (
          <Field
            id={`sosial-${m.kunci}`}
            label={m.label}
            type="url"
            inputmode="text"
            value={d.social?.[m.kunci] ?? ""}
            onInput={(v) =>
              ubah((x) => {
                x.social ??= {};
                x.social[m.kunci] = v;
              })
            }
            error={salah(`social.${m.kunci}`)}
            maxlength={500}
          />
        ))}
      </div>
    </section>
  );
}
