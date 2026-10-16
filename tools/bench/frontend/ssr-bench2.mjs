// Jalankan: taskset -c 1 node ssr-bench.mjs  (server dipin core 0)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import autocannon from '../bench/node_modules/autocannon/autocannon.js';
const ROUNDS = +(process.env.ROUNDS ?? 3), DURATION = +(process.env.DURATION ?? 8), WARMUP = +(process.env.WARMUP ?? 4), CONNS = +(process.env.CONNS ?? 64), STARTUPS = +(process.env.STARTUPS ?? 3);
const PORT = 3410, URL_ = `http://127.0.0.1:${PORT}/`;
const root = process.cwd();
const cfgs = [
  { name: 'Next.js 16 (default: cacheComponents+PPR)', cwd: `${root}/next-app`, cmd: ['node', 'node_modules/next/dist/bin/next', 'start', '-p', String(PORT)] },
  { name: 'Next.js 16 (klasik: force-dynamic, tanpa cacheComponents)', cwd: `${root}/next-classic`, cmd: ['node', 'node_modules/next/dist/bin/next', 'start', '-p', String(PORT)] },
  { name: 'SolidStart 2', cwd: `${root}/solid-app`, cmd: ['node', '.output/server/index.mjs'] },
  { name: 'SolidStart 2 (kontrol ulang)', cwd: `${root}/solid-app`, cmd: ['node', '.output/server/index.mjs'] },
  { name: 'Next.js 16 (kontrol ulang)', cwd: `${root}/next-app`, cmd: ['node', 'node_modules/next/dist/bin/next', 'start', '-p', String(PORT)] },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// RSS seluruh pohon proses (Next menjalankan child)
const tree = (pid) => { const out = [pid]; try { for (const c of readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean)) out.push(...tree(+c)); } catch {} return out; };
const rss = (pid) => tree(pid).reduce((n, p) => { try { return n + +/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p}/status`, 'utf8'))[1] / 1024; } catch { return n; } }, 0);
function start(c) {
  const t0 = performance.now();
  const child = spawn('taskset', ['-c', '0', ...c.cmd], { cwd: c.cwd, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'ignore', detached: true });
  const ready = (async () => { for (;;) { try { const r = await fetch(URL_); if (r.ok) { await r.text(); return performance.now() - t0; } } catch {} await sleep(10); } })();
  const stop = async () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-child.pid, 'SIGKILL'); } catch {} await sleep(300); };
  return { child, ready, stop };
}
const load = async (s) => { const r = await autocannon({ url: URL_, connections: CONNS, duration: s, pipelining: 1 }); return { rps: r.requests.average, p50: r.latency.p50, p99: r.latency.p99, bad: r.errors + r.timeouts + r.non2xx }; };
async function ttfb(n = 30) { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); const r = await fetch(URL_); await r.text(); t.push(performance.now() - t0); } return median(t); }
const results = [];
for (const c of cfgs) {
  console.error('\n==', c.name);
  const row = { name: c.name };
  try {
    const st = [];
    for (let i = 0; i < STARTUPS; i++) { const s = start(c); st.push(await s.ready); await s.stop(); }
    row.startupMs = median(st);
    const s = start(c); await s.ready; await sleep(1000);
    const html = await (await fetch(URL_)).text();
    row.li = (html.match(/<li[ >]/g) || []).length; row.htmlBytes = Buffer.byteLength(html);
    row.idleRss = rss(s.child.pid);
    row.latencySingleMs = await ttfb();
    await load(WARMUP);
    const runs = []; for (let i = 0; i < ROUNDS; i++) runs.push(await load(DURATION));
    const rps = runs.map((r) => r.rps), mid = [...runs].sort((a, b) => a.rps - b.rps)[runs.length >> 1];
    Object.assign(row, { rps: median(rps), min: Math.min(...rps), max: Math.max(...rps), p50: mid.p50, p99: mid.p99, bad: runs.reduce((n, r) => n + r.bad, 0) });
    row.loadRss = rss(s.child.pid);
    console.error(JSON.stringify(row));
    await s.stop();
  } catch (e) { row.error = String(e); console.error(row.error); }
  results.push(row);
  writeFileSync('ssr-results2.json', JSON.stringify({ conns: CONNS, duration: DURATION, rounds: ROUNDS, results }, null, 2));
}
const f = (n) => Math.round(n).toLocaleString('en-US');
console.log('| Framework | Start (ms) | RSS idle (MB) | RSS beban (MB) | 1 req (ms) | req/s (min-max) | p50 ms | p99 ms | HTML (KB) | <li> | error |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of results) console.log(r.error ? `| ${r.name} | GAGAL ${r.error} |` : `| ${r.name} | ${f(r.startupMs)} | ${f(r.idleRss)} | ${f(r.loadRss)} | ${r.latencySingleMs.toFixed(1)} | ${f(r.rps)} (${f(r.min)}-${f(r.max)}) | ${r.p50} | ${r.p99} | ${(r.htmlBytes / 1024).toFixed(1)} | ${r.li} | ${r.bad} |`);
