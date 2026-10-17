/**
 * Menjalankan API dan web untuk pengembangan lokal dalam satu perintah: `bun run dev`.
 * Keluaran kedua proses diberi awalan [api] dan [web]. Ctrl+C menghentikan keduanya,
 * dan bila salah satu berhenti sendiri, yang lain ikut dihentikan.
 */
const proses = [
  { nama: "api", perintah: ["bun", "run", "dev:api"] },
  { nama: "web", perintah: ["bun", "run", "dev:web"] },
] as const;

const anak = proses.map((p) => ({
  ...p,
  proc: Bun.spawn([...p.perintah], { stdout: "pipe", stderr: "pipe", stdin: "ignore" }),
}));

/** Teruskan keluaran per baris dengan awalan nama proses. */
const alirkan = async (nama: string, s: ReadableStream<Uint8Array>) => {
  const dec = new TextDecoder();
  let sisa = "";
  for await (const potong of s) {
    sisa += dec.decode(potong, { stream: true });
    const baris = sisa.split(/\r?\n/);
    sisa = baris.pop() ?? "";
    for (const b of baris) console.log(`[${nama}] ${b}`);
  }
  if (sisa) console.log(`[${nama}] ${sisa}`);
};

let berhenti = false;
const hentikan = () => {
  if (berhenti) return;
  berhenti = true;
  for (const a of anak) a.proc.kill();
};
process.on("SIGINT", hentikan);
process.on("SIGTERM", hentikan);

console.log("API http://localhost:3000  |  Web http://localhost:3001  |  Ctrl+C untuk berhenti");

const kode = await Promise.race(
  anak.map(async (a) => {
    await Promise.all([alirkan(a.nama, a.proc.stdout), alirkan(a.nama, a.proc.stderr)]);
    const k = await a.proc.exited;
    if (!berhenti) console.log(`[${a.nama}] berhenti (kode ${k}); menghentikan yang lain`);
    return k;
  }),
);
hentikan();
await Promise.all(anak.map((a) => a.proc.exited));
process.exit(berhenti && kode === 0 ? 0 : kode);
