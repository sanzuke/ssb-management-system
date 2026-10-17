import { spawn } from "node:child_process";
import { HttpError } from "../errors";

const SCRIPT = new URL("./render-pdf.mjs", import.meta.url).pathname;
const TIMEOUT_MS = 30_000;
const MAX_PARALLEL = 2;

let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Mengubah HTML menjadi PDF lewat proses Node + Chromium (Playwright). Dibatasi dua proses sekaligus dan 30 detik. */
export function renderPdf(html: string): Promise<Uint8Array> {
  return slot(
    () =>
      new Promise<Uint8Array>((resolve, reject) => {
        const child = spawn(process.env.NODE_BIN || "node", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
        child.stdout.on("data", (d) => out.push(d));
        child.stderr.on("data", (d) => err.push(d));
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          const buf = Buffer.concat(out);
          if (code === 0 && buf.subarray(0, 4).toString() === "%PDF") resolve(new Uint8Array(buf));
          else reject(new Error(`render PDF gagal (kode ${code}): ${Buffer.concat(err).toString().slice(0, 500)}`));
        });
        child.stdin.end(html);
      }),
  );
}

export const reportUnavailable = () => new HttpError(503, "report_unavailable", "Rapor belum bisa dibuat sekarang. Coba lagi sebentar lagi.");
