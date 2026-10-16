import { expect, test } from "bun:test";
import { loadEnv } from "./env";

test("env tanpa DATABASE_URL ditolak dengan pesan jelas", () => {
  expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
});

test("env valid mendapat nilai bawaan", () => {
  const env = loadEnv({ DATABASE_URL: "postgres://x" });
  expect(env.PORT).toBe(3000);
  expect(env.NODE_ENV).toBe("development");
});

test("Google aktif wajib berpasangan dan butuh SESSION_SECRET", () => {
  expect(() => loadEnv({ DATABASE_URL: "x", GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
  expect(() => loadEnv({ DATABASE_URL: "x", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" })).toThrow(/SESSION_SECRET/);
  expect(loadEnv({ DATABASE_URL: "x", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", SESSION_SECRET: "y".repeat(32) }).GOOGLE_CLIENT_ID).toBe("id");
});
