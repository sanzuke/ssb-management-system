// Runner benchmark. Jalankan: taskset -c 1 node bench.mjs
// Server dipin ke core 0, runner/autocannon dipin ke core 1.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import autocannon from "autocannon";

const BUN = "/root/.bun/bin/bun";
const PORT = 3200;
const URL = `http://127.0.0.1:${PORT}`;
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const DURATION = Number(process.env.DURATION ?? 5);
const WARMUP = Number(process.env.WARMUP ?? 3);
const CONNS = Number(process.env.CONNS ?? 64);
const STARTUPS = Number(process.env.STARTUPS ?? 3);

const configs = [
  { name: "Hono", rt: "Node", cmd: "node", file: "dist/hono-node.js" },
  { name: "Hono", rt: "Bun", cmd: BUN, file: "dist/hono-bun.js" },
  { name: "Nest + Fastify", rt: "Node", cmd: "node", file: "dist/nest-fastify.js" },
  { name: "Nest + Fastify", rt: "Bun", cmd: BUN, file: "dist/nest-fastify.js" },
  { name: "Nest + Express", rt: "Node", cmd: "node", file: "dist/nest-express.js" },
  { name: "Nest + Express", rt: "Bun", cmd: BUN, file: "dist/nest-express.js" },
  { name: "Mentah (tanpa framework)", rt: "Node", cmd: "node", file: "dist/raw-node.js" },
  { name: "Mentah (tanpa framework)", rt: "Bun", cmd: BUN, file: "dist/raw-bun.js" },
  { name: "Hono (kontrol ulang)", rt: "Node", cmd: "node", file: "dist/hono-node.js", control: true },
];
const only = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;

const body = JSON.stringify({ name: "Budi", age: 10 });
const endpoints = [
  { key: "ping", opts: { url: `${URL}/ping`, method: "GET" } },
  { key: "echo", opts: { url: `${URL}/echo`, method: "POST", headers: { "content-type": "application/json" }, body } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const rssMb = (pid) => {
  try {
    return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))[1]) / 1024;
  } catch {
    return NaN;
  }
};

function start(cfg) {
  const t0 = performance.now();
  const child = spawn("taskset", ["-c", "0", cfg.cmd, cfg.file], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  let exited = false;
  child.on("exit", () => (exited = true));
  const ready = (async () => {
    for (;;) {
      if (exited) throw new Error(`server berhenti: ${err.slice(0, 300)}`);
      try {
        const r = await fetch(`${URL}/ping`);
        if (r.ok) return performance.now() - t0;
      } catch {}
      await sleep(10);
    }
  })();
  const stop = async () => {
    if (exited) return;
    child.kill("SIGTERM");
    for (let i = 0; i < 100 && !exited; i++) await sleep(50);
    if (!exited) child.kill("SIGKILL");
    await sleep(200);
  };
  return { child, ready, stop };
}

async function verify() {
  const a = await fetch(`${URL}/ping`);
  const b = await fetch(`${URL}/echo`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const bad = await fetch(`${URL}/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", age: -1 }),
  });
  const ok = a.status === 200 && (await a.text()) === '{"ok":true}' && b.status === 200 && JSON.stringify(await b.json()) === body;
  return { ok, invalidStatus: bad.status };
}

async function load(opts, seconds) {
  const r = await autocannon({ ...opts, connections: CONNS, duration: seconds, pipelining: 1 });
  return {
    rps: r.requests.average,
    p50: r.latency.p50,
    p99: r.latency.p99,
    errors: r.errors + r.timeouts,
    non2xx: r.non2xx,
  };
}

const results = [];
const list = configs.map((c, i) => ({ c, i })).filter(({ i }) => !only || only.includes(i));

for (const { c: cfg } of list) {
  const label = `${cfg.name} / ${cfg.rt}`;
  console.error(`\n== ${label}`);
  const row = { name: cfg.name, rt: cfg.rt, control: !!cfg.control };
  try {
    const startups = [];
    for (let i = 0; i < STARTUPS; i++) {
      const s = start(cfg);
      startups.push(await s.ready);
      await s.stop();
    }
    row.startupMs = median(startups);

    const s = start(cfg);
    await s.ready;
    await sleep(1000);
    row.idleRss = rssMb(s.child.pid);
    const v = await verify();
    row.verifyOk = v.ok;
    row.invalidStatus = v.invalidStatus;
    if (!v.ok) throw new Error("respons tidak sesuai");

    for (const ep of endpoints) {
      await load(ep.opts, WARMUP);
      const runs = [];
      for (let i = 0; i < ROUNDS; i++) runs.push(await load(ep.opts, DURATION));
      const rps = runs.map((r) => r.rps);
      const mid = [...runs].sort((x, y) => x.rps - y.rps)[runs.length >> 1];
      row[ep.key] = {
        rps: median(rps),
        min: Math.min(...rps),
        max: Math.max(...rps),
        p50: mid.p50,
        p99: mid.p99,
        errors: runs.reduce((n, r) => n + r.errors, 0),
        non2xx: runs.reduce((n, r) => n + r.non2xx, 0),
      };
      console.error(
        `   ${ep.key}: ${Math.round(row[ep.key].rps)} req/s (min ${Math.round(row[ep.key].min)}, max ${Math.round(row[ep.key].max)}), p99 ${row[ep.key].p99} ms`,
      );
    }
    row.loadRss = rssMb(s.child.pid);
    await s.stop();
  } catch (e) {
    row.error = String(e.message ?? e);
    console.error(`   GAGAL: ${row.error}`);
  }
  results.push(row);
  writeFileSync("results.json", JSON.stringify({ conns: CONNS, duration: DURATION, rounds: ROUNDS, results }, null, 2));
}

const f0 = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "-");
console.log("\n| Konfigurasi | Runtime | Start (ms) | RSS idle (MB) | RSS setelah beban (MB) | /ping req/s | p99 ms | /echo req/s | p99 ms |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of results) {
  if (r.error) {
    console.log(`| ${r.name} | ${r.rt} | GAGAL: ${r.error} | | | | | | |`);
    continue;
  }
  console.log(
    `| ${r.name} | ${r.rt} | ${f0(r.startupMs)} | ${f0(r.idleRss)} | ${f0(r.loadRss)} | ${f0(r.ping.rps)} (${f0(r.ping.min)}-${f0(r.ping.max)}) | ${r.ping.p99} | ${f0(r.echo.rps)} (${f0(r.echo.min)}-${f0(r.echo.max)}) | ${r.echo.p99} |`,
  );
}
