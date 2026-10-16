import { expect, test } from "bun:test";
import { healthSchema } from "@ssb/shared";
import { app } from "./app";

test("GET /health", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(healthSchema.safeParse(await res.json()).success).toBe(true);
});

test("POST /players menolak input tidak valid", async () => {
  const res = await app.request("/players", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "", birthDate: "bukan-tanggal" }),
  });
  expect(res.status).toBe(400);
});

test("POST /players menerima input valid", async () => {
  const res = await app.request("/players", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Budi", birthDate: "2015-03-02", position: "FW" }),
  });
  expect(res.status).toBe(201);
});
