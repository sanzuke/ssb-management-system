import { expect, test } from "bun:test";
import { Hono } from "hono";
import { onError } from "./errors";
import { createLogger, type LogLevel, requestLogger } from "./logger";

function setup() {
  const lines: { line: Record<string, unknown>; level: LogLevel }[] = [];
  const logger = createLogger({ sink: (l, level) => lines.push({ line: JSON.parse(l), level }) });
  const app = new Hono();
  app.use(requestLogger(logger));
  app.onError(onError);
  app.get("/ok", (c) => c.json({ ok: true }));
  app.get("/boom", () => {
    throw new Error("rahasia internal");
  });
  return { app, lines };
}

test("setiap permintaan dicatat satu baris JSON dengan id, status, durasi; query tidak dicatat", async () => {
  const { app, lines } = setup();
  const res = await app.request("/ok?token=rahasia");
  expect(res.status).toBe(200);
  const id = res.headers.get("x-request-id");
  expect(id).toBeTruthy();
  expect(lines).toHaveLength(1);
  const { line, level } = lines[0] as (typeof lines)[number];
  expect(level).toBe("info");
  expect(line).toMatchObject({ msg: "request", reqId: id, method: "GET", path: "/ok", status: 200 });
  expect(typeof line.ms).toBe("number");
  expect(JSON.stringify(line)).not.toContain("rahasia");
});

test("X-Request-Id masuk yang aman dipakai ulang; yang tidak aman diganti", async () => {
  const { app } = setup();
  const ok = await app.request("/ok", { headers: { "x-request-id": "abc-123" } });
  expect(ok.headers.get("x-request-id")).toBe("abc-123");
  const bad = await app.request("/ok", { headers: { "x-request-id": "a b;{x}" } });
  expect(bad.headers.get("x-request-id")).not.toBe("a b;{x}");
});

test("error tak terduga: klien dapat pesan umum, log memuat detail dan id yang sama", async () => {
  const { app, lines } = setup();
  const res = await app.request("/boom");
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body).toEqual({ error: { code: "internal", message: "Terjadi kesalahan di server" } });
  const id = res.headers.get("x-request-id");
  const err = lines.find((l) => l.line.msg === "unhandled_error");
  expect(err?.level).toBe("error");
  expect(err?.line).toMatchObject({ reqId: id, err: "rahasia internal", path: "/boom" });
  const req = lines.find((l) => l.line.msg === "request");
  expect(req).toMatchObject({ level: "error", line: { status: 500, reqId: id } });
});
