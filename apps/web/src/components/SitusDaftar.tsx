import { Index, Show } from "solid-js";
import { hariIni } from "~/lib/waktu";
import { angka, geser, idProgramBaru, isi, type Sunting, ubahDi } from "~/lib/situs";
import Field from "./Field";
import SelectField from "./SelectField";
import { Butir, FotoSitus, HeaderBagian, Lokal } from "./SitusKolom";

/** Tombol tambah dengan batas jumlah yang sama seperti skema di API. */
function Tambah(p: { teks: string; jumlah: number; maks: number; onClick: () => void }) {
  return (
    <Show when={p.jumlah < p.maks} fallback={<p class="petunjuk">Sudah mencapai batas {p.maks}.</p>}>
      <button class="tombol" type="button" onClick={p.onClick}>
        {p.teks}
      </button>
    </Show>
  );
}

export function SitusProgram(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Program">
      <h2>Program latihan</h2>
      <HeaderBagian s={p.s} kunci="programs" />
      <p class="petunjuk">
        Tiap program tampil sebagai tab di halaman. Biaya ditulis apa adanya, mis. "Rp 250.000 / bulan"; kosongkan bila tidak ingin dipajang.
      </p>
      <Index each={d.programs}>
        {(_, i) => {
          const j = `programs.${i}`;
          const ubahProgram = (fn: (b: (typeof d.programs)[number]) => void) => ubah((x) => ubahDi(x.programs, i, fn));
          return (
            <Butir
              judul={`Program ${i + 1}${d.programs[i]?.code ? `: ${d.programs[i]?.code}` : ""}`}
              i={i}
              jumlah={d.programs.length}
              geser={(a) => ubah((x) => geser(x.programs, i, a))}
              hapus={() => ubah((x) => void x.programs.splice(i, 1))}
            >
              <div class="form">
                <Field
                  id={`prog-${i}-id`}
                  label="Kode alamat"
                  value={d.programs[i]?.id ?? ""}
                  onInput={(v) => ubahProgram((b) => isi(b, "id", v))}
                  error={salah(`${j}.id`)}
                  hint="Huruf kecil, angka, tanda hubung, mis. u-12. Dipakai formulir trial; ganti hanya bila perlu."
                  maxlength={30}
                />
                <Field
                  id={`prog-${i}-kode`}
                  label="Kode program"
                  value={d.programs[i]?.code ?? ""}
                  onInput={(v) => ubahProgram((b) => isi(b, "code", v))}
                  error={salah(`${j}.code`)}
                  maxlength={20}
                />
                <Lokal
                  id={`prog-${i}-nama`}
                  label="Nama"
                  value={d.programs[i]?.name}
                  onChange={(v) => ubahProgram((b) => isi(b, "name", v))}
                  jalur={`${j}.name`}
                  salah={salah}
                />
                <Lokal
                  id={`prog-${i}-sub`}
                  label="Nama lain (opsional)"
                  value={d.programs[i]?.subname}
                  onChange={(v) => ubahProgram((b) => isi(b, "subname", v))}
                  jalur={`${j}.subname`}
                  salah={salah}
                />
                <Lokal
                  id={`prog-${i}-usia`}
                  label="Rentang usia"
                  value={d.programs[i]?.ageRange}
                  onChange={(v) => ubahProgram((b) => isi(b, "ageRange", v))}
                  jalur={`${j}.ageRange`}
                  salah={salah}
                />
                <Lokal
                  id={`prog-${i}-fokus`}
                  label="Fokus"
                  value={d.programs[i]?.focus}
                  onChange={(v) => ubahProgram((b) => isi(b, "focus", v))}
                  jalur={`${j}.focus`}
                  salah={salah}
                />
                <Lokal
                  id={`prog-${i}-jadwal`}
                  label="Jadwal"
                  value={d.programs[i]?.schedule}
                  onChange={(v) => ubahProgram((b) => isi(b, "schedule", v))}
                  jalur={`${j}.schedule`}
                  salah={salah}
                />
                <Field
                  id={`prog-${i}-kuota`}
                  label="Kuota per kelompok (opsional)"
                  type="number"
                  inputmode="numeric"
                  value={d.programs[i]?.maxSquadSize?.toString() ?? ""}
                  onInput={(v) =>
                    ubahProgram((b) => {
                      const n = angka(v);
                      if (n === undefined) delete b.maxSquadSize;
                      else b.maxSquadSize = n;
                    })
                  }
                  error={salah(`${j}.maxSquadSize`)}
                />
                <Field
                  id={`prog-${i}-biaya`}
                  label="Biaya (opsional)"
                  value={d.programs[i]?.fee ?? ""}
                  onInput={(v) => ubahProgram((b) => isi(b, "fee", v))}
                  error={salah(`${j}.fee`)}
                  maxlength={200}
                />
                <FotoSitus
                  id={`prog-${i}-foto`}
                  label="Foto program"
                  value={d.programs[i]?.image || undefined}
                  onChange={(u) =>
                    ubahProgram((b) => {
                      if (u) b.image = u;
                      else delete b.image;
                    })
                  }
                  error={salah(`${j}.image`)}
                  bawaan="Memakai foto latihan bawaan landing."
                />
                <label class="centang">
                  <input
                    type="checkbox"
                    checked={d.programs[i]?.hasScholarship ?? false}
                    onChange={(e) => ubahProgram((b) => isi(b, "hasScholarship", e.currentTarget.checked))}
                  />
                  <span>Ada jalur beasiswa</span>
                </label>

                <div class="sub-daftar">
                  <h3>Materi latihan</h3>
                  <Index each={d.programs[i]?.curriculum ?? []}>
                    {(_m, k) => (
                      <div class="baris-materi">
                        <Lokal
                          id={`prog-${i}-materi-${k}`}
                          label={`Materi ${k + 1}`}
                          value={d.programs[i]?.curriculum[k]}
                          onChange={(v) => ubahProgram((b) => isi(b.curriculum, k, v))}
                          jalur={`${j}.curriculum.${k}`}
                          salah={salah}
                        />
                        <button
                          class="tombol tipis"
                          type="button"
                          aria-label={`Hapus materi ${k + 1}`}
                          onClick={() => ubahProgram((b) => void b.curriculum.splice(k, 1))}
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </Index>
                  <Tambah
                    teks="Tambah materi"
                    jumlah={d.programs[i]?.curriculum.length ?? 0}
                    maks={12}
                    onClick={() => ubahProgram((b) => void b.curriculum.push({ id: "" }))}
                  />
                </div>
              </div>
            </Butir>
          );
        }}
      </Index>
      <Tambah
        teks="Tambah program"
        jumlah={d.programs.length}
        maks={12}
        onClick={() =>
          ubah((x) =>
            x.programs.push({
              id: idProgramBaru(x.programs.map((b) => b.id)),
              code: "",
              name: { id: "" },
              ageRange: { id: "" },
              focus: { id: "" },
              schedule: { id: "" },
              curriculum: [],
              hasScholarship: false,
            }),
          )
        }
      />
    </section>
  );
}

export function SitusPelatih(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Pelatih">
      <h2>Pelatih</h2>
      <HeaderBagian s={p.s} kunci="coaches" />
      <p class="petunjuk">Tampilkan hanya pelatih yang sudah setuju nama, lisensi, dan riwayatnya dipajang di situs publik.</p>
      <Index each={d.coaches}>
        {(_, i) => {
          const j = `coaches.${i}`;
          const ubahPelatih = (fn: (b: (typeof d.coaches)[number]) => void) => ubah((x) => ubahDi(x.coaches, i, fn));
          return (
            <Butir
              judul={`Pelatih ${i + 1}${d.coaches[i]?.name ? `: ${d.coaches[i]?.name}` : ""}`}
              i={i}
              jumlah={d.coaches.length}
              geser={(a) => ubah((x) => geser(x.coaches, i, a))}
              hapus={() => ubah((x) => void x.coaches.splice(i, 1))}
            >
              <div class="form">
                <Field
                  id={`pel-${i}-nama`}
                  label="Nama"
                  value={d.coaches[i]?.name ?? ""}
                  onInput={(v) => ubahPelatih((b) => isi(b, "name", v))}
                  error={salah(`${j}.name`)}
                  maxlength={200}
                />
                <Lokal
                  id={`pel-${i}-peran`}
                  label="Peran"
                  value={d.coaches[i]?.role}
                  onChange={(v) => ubahPelatih((b) => isi(b, "role", v))}
                  jalur={`${j}.role`}
                  salah={salah}
                />
                <Field
                  id={`pel-${i}-lisensi`}
                  label="Lisensi (opsional)"
                  value={d.coaches[i]?.license ?? ""}
                  onInput={(v) => ubahPelatih((b) => isi(b, "license", v))}
                  error={salah(`${j}.license`)}
                  maxlength={200}
                />
                <Field
                  id={`pel-${i}-pengalaman`}
                  label="Pengalaman (opsional)"
                  value={d.coaches[i]?.experience ?? ""}
                  onInput={(v) => ubahPelatih((b) => isi(b, "experience", v))}
                  error={salah(`${j}.experience`)}
                  maxlength={200}
                />
                <Lokal
                  id={`pel-${i}-bio`}
                  label="Profil singkat (opsional)"
                  panjang
                  value={d.coaches[i]?.bio}
                  onChange={(v) => ubahPelatih((b) => isi(b, "bio", v))}
                  jalur={`${j}.bio`}
                  salah={salah}
                />
              </div>
            </Butir>
          );
        }}
      </Index>
      <Tambah teks="Tambah pelatih" jumlah={d.coaches.length} maks={30} onClick={() => ubah((x) => x.coaches.push({ name: "", role: { id: "" } }))} />
    </section>
  );
}

export function SitusFasilitas(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Fasilitas">
      <h2>Fasilitas</h2>
      <HeaderBagian s={p.s} kunci="facilities" />
      <Index each={d.facilities}>
        {(_, i) => {
          const j = `facilities.${i}`;
          const ubahFasilitas = (fn: (b: (typeof d.facilities)[number]) => void) => ubah((x) => ubahDi(x.facilities, i, fn));
          return (
            <Butir
              judul={`Fasilitas ${i + 1}`}
              i={i}
              jumlah={d.facilities.length}
              geser={(a) => ubah((x) => geser(x.facilities, i, a))}
              hapus={() => ubah((x) => void x.facilities.splice(i, 1))}
            >
              <div class="form">
                <Lokal
                  id={`fas-${i}-judul`}
                  label="Nama"
                  value={d.facilities[i]?.title}
                  onChange={(v) => ubahFasilitas((b) => isi(b, "title", v))}
                  jalur={`${j}.title`}
                  salah={salah}
                />
                <Lokal
                  id={`fas-${i}-isi`}
                  label="Keterangan"
                  panjang
                  value={d.facilities[i]?.description}
                  onChange={(v) => ubahFasilitas((b) => isi(b, "description", v))}
                  jalur={`${j}.description`}
                  salah={salah}
                />
              </div>
            </Butir>
          );
        }}
      </Index>
      <Tambah
        teks="Tambah fasilitas"
        jumlah={d.facilities.length}
        maks={12}
        onClick={() => ubah((x) => x.facilities.push({ title: { id: "" }, description: { id: "" } }))}
      />
    </section>
  );
}

export function SitusLaga(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Pertandingan">
      <h2>Pertandingan</h2>
      <HeaderBagian s={p.s} kunci="matches" />
      <FotoSitus
        id="laga-foto"
        label="Foto bagian pertandingan"
        value={d.images?.matches || undefined}
        onChange={(u) =>
          ubah((x) => {
            if (u) x.images = { ...x.images, matches: u };
            else if (x.images) delete x.images.matches;
          })
        }
        error={salah("images.matches")}
        bawaan="Memakai foto pertandingan bawaan landing."
      />
      <p class="petunjuk">Jadwal dan hasil laga. Skor hanya diisi untuk laga yang sudah selesai.</p>
      <Index each={d.matches}>
        {(_, i) => {
          const j = `matches.${i}`;
          const ubahLaga = (fn: (b: (typeof d.matches)[number]) => void) => ubah((x) => ubahDi(x.matches, i, fn));
          const skor = (kunci: "homeScore" | "awayScore") => (v: string) =>
            ubahLaga((b) => {
              const n = angka(v);
              if (n === undefined) delete b[kunci];
              else b[kunci] = n;
            });
          return (
            <Butir
              judul={`Laga ${i + 1}${d.matches[i] ? `: ${d.matches[i]?.homeTeam} vs ${d.matches[i]?.awayTeam}` : ""}`}
              i={i}
              jumlah={d.matches.length}
              geser={(a) => ubah((x) => geser(x.matches, i, a))}
              hapus={() => ubah((x) => void x.matches.splice(i, 1))}
            >
              <div class="form">
                <Field
                  id={`laga-${i}-turnamen`}
                  label="Turnamen atau kompetisi"
                  value={d.matches[i]?.tournament ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "tournament", v))}
                  error={salah(`${j}.tournament`)}
                  maxlength={200}
                />
                <Field
                  id={`laga-${i}-babak`}
                  label="Babak (opsional)"
                  value={d.matches[i]?.round ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "round", v))}
                  error={salah(`${j}.round`)}
                  maxlength={200}
                />
                <Field
                  id={`laga-${i}-tuan`}
                  label="Tuan rumah"
                  value={d.matches[i]?.homeTeam ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "homeTeam", v))}
                  error={salah(`${j}.homeTeam`)}
                  maxlength={200}
                />
                <Field
                  id={`laga-${i}-tamu`}
                  label="Tamu"
                  value={d.matches[i]?.awayTeam ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "awayTeam", v))}
                  error={salah(`${j}.awayTeam`)}
                  maxlength={200}
                />
                <SelectField
                  id={`laga-${i}-status`}
                  label="Status"
                  value={d.matches[i]?.status ?? "upcoming"}
                  onInput={(v) => ubahLaga((b) => isi(b, "status", v === "finished" ? "finished" : "upcoming"))}
                  options={[
                    { value: "upcoming", label: "Akan datang" },
                    { value: "finished", label: "Selesai" },
                  ]}
                />
                <Show when={d.matches[i]?.status === "finished"}>
                  <Field
                    id={`laga-${i}-skor-tuan`}
                    label="Skor tuan rumah"
                    type="number"
                    inputmode="numeric"
                    value={d.matches[i]?.homeScore?.toString() ?? ""}
                    onInput={skor("homeScore")}
                    error={salah(`${j}.homeScore`)}
                  />
                  <Field
                    id={`laga-${i}-skor-tamu`}
                    label="Skor tamu"
                    type="number"
                    inputmode="numeric"
                    value={d.matches[i]?.awayScore?.toString() ?? ""}
                    onInput={skor("awayScore")}
                    error={salah(`${j}.awayScore`)}
                  />
                </Show>
                <Field
                  id={`laga-${i}-tanggal`}
                  label="Tanggal"
                  type="date"
                  value={d.matches[i]?.date ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "date", v))}
                  error={salah(`${j}.date`)}
                />
                <Field
                  id={`laga-${i}-jam`}
                  label="Jam (opsional)"
                  type="time"
                  value={d.matches[i]?.time ?? ""}
                  onInput={(v) =>
                    ubahLaga((b) => {
                      if (v === "") delete b.time;
                      else b.time = v;
                    })
                  }
                  error={salah(`${j}.time`)}
                />
                <Field
                  id={`laga-${i}-tempat`}
                  label="Tempat (opsional)"
                  value={d.matches[i]?.venue ?? ""}
                  onInput={(v) => ubahLaga((b) => isi(b, "venue", v))}
                  error={salah(`${j}.venue`)}
                  maxlength={200}
                />
              </div>
            </Butir>
          );
        }}
      </Index>
      <Tambah
        teks="Tambah laga"
        jumlah={d.matches.length}
        maks={60}
        onClick={() =>
          ubah((x) =>
            x.matches.unshift({
              tournament: "",
              homeTeam: "",
              awayTeam: "",
              date: hariIni(),
              status: "upcoming",
            }),
          )
        }
      />
    </section>
  );
}

export function SitusTestimoni(p: { s: Sunting }) {
  const { d, ubah, salah } = p.s;
  return (
    <section class="master" aria-label="Testimoni">
      <h2>Testimoni</h2>
      <HeaderBagian s={p.s} kunci="testimonials" />
      <p class="petunjuk">Cantumkan hanya kutipan nyata yang sudah diizinkan oleh orang yang bersangkutan.</p>
      <Index each={d.testimonials}>
        {(_, i) => {
          const j = `testimonials.${i}`;
          const ubahTesti = (fn: (b: (typeof d.testimonials)[number]) => void) => ubah((x) => ubahDi(x.testimonials, i, fn));
          return (
            <Butir
              judul={`Testimoni ${i + 1}${d.testimonials[i]?.name ? `: ${d.testimonials[i]?.name}` : ""}`}
              i={i}
              jumlah={d.testimonials.length}
              geser={(a) => ubah((x) => geser(x.testimonials, i, a))}
              hapus={() => ubah((x) => void x.testimonials.splice(i, 1))}
            >
              <div class="form">
                <Field
                  id={`testi-${i}-nama`}
                  label="Nama"
                  value={d.testimonials[i]?.name ?? ""}
                  onInput={(v) => ubahTesti((b) => isi(b, "name", v))}
                  error={salah(`${j}.name`)}
                  maxlength={200}
                />
                <Lokal
                  id={`testi-${i}-peran`}
                  label="Keterangan, mis. orang tua U-12 (opsional)"
                  value={d.testimonials[i]?.role}
                  onChange={(v) => ubahTesti((b) => isi(b, "role", v))}
                  jalur={`${j}.role`}
                  salah={salah}
                />
                <Lokal
                  id={`testi-${i}-kutipan`}
                  label="Kutipan"
                  panjang
                  value={d.testimonials[i]?.quote}
                  onChange={(v) => ubahTesti((b) => isi(b, "quote", v))}
                  jalur={`${j}.quote`}
                  salah={salah}
                />
              </div>
            </Butir>
          );
        }}
      </Index>
      <Tambah
        teks="Tambah testimoni"
        jumlah={d.testimonials.length}
        maks={12}
        onClick={() => ubah((x) => x.testimonials.push({ name: "", quote: { id: "" } }))}
      />
    </section>
  );
}
