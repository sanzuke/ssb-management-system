// Dijalankan dengan Node (bukan Bun): membaca HTML dari stdin, menulis PDF ke stdout.
// Tanpa JavaScript dan tanpa akses jaringan; rapor adalah HTML statis yang berdiri sendiri.
import { chromium } from "playwright-core";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const html = Buffer.concat(chunks).toString("utf8");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-dev-shm-usage"],
});
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route("**/*", (route) => (/^(data|about):/.test(route.request().url()) ? route.continue() : route.abort()));
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  process.stdout.write(pdf);
} finally {
  await browser.close();
}
