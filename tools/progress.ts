// Menghitung kemajuan dari docs/checklist.md. Jalankan: bun run progress
const text = await Bun.file(new URL("../docs/checklist.md", import.meta.url)).text();
const rows: { name: string; done: number; total: number; blocked: number }[] = [];
let cur: (typeof rows)[number] | null = null;
for (const line of text.split("\n")) {
  const h = /^## (.+)/.exec(line);
  if (h) {
    cur = { name: h[1]!, done: 0, total: 0, blocked: 0 };
    rows.push(cur);
    continue;
  }
  const m = /^- \[( |x)\] (.+)/.exec(line);
  if (m && cur) {
    cur.total++;
    if (m[1] === "x") cur.done++;
    else if (m[2]!.includes("(butuh keputusan")) cur.blocked++;
  }
}
const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);
let D = 0,
  T = 0,
  B = 0;
for (const r of rows) {
  D += r.done;
  T += r.total;
  B += r.blocked;
  console.log(
    `${r.name.padEnd(34)} ${String(r.done).padStart(2)}/${String(r.total).padEnd(2)} ${String(pct(r.done, r.total)).padStart(3)}%  menunggu keputusan: ${r.blocked}`,
  );
}
console.log(`${"Total".padEnd(34)} ${String(D).padStart(2)}/${String(T).padEnd(2)} ${String(pct(D, T)).padStart(3)}%  menunggu keputusan: ${B}`);
