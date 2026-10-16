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
