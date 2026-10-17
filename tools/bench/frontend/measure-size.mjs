import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync } from "node:zlib";
const [port, label] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const html = await (await fetch(base + "/")).text();
const urls = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) urls.add(m[1]);
let raw = 0,
  gz = 0,
  br = 0,
  js = 0,
  css = 0;
for (const u of urls) {
  const buf = Buffer.from(await (await fetch(base + u)).arrayBuffer());
  raw += buf.length;
  gz += gzipSync(buf).length;
  br += brotliCompressSync(buf).length;
  u.endsWith(".css") ? css++ : js++;
}
const h = Buffer.from(html);
console.log(
  JSON.stringify({ label, htmlRaw: h.length, htmlGzip: gzipSync(h).length, assets: urls.size, js, css, assetRaw: raw, assetGzip: gz, assetBrotli: br }),
);
