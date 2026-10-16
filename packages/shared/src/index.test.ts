import { expect, test } from "bun:test";
import { playerInputSchema } from "./index";

test("input pemain valid", () => {
  expect(playerInputSchema.safeParse({ fullName: "Budi", birthDate: "2015-03-02" }).success).toBe(true);
});

test("input pemain tanpa nama ditolak", () => {
  expect(playerInputSchema.safeParse({ fullName: " ", birthDate: "2015-03-02" }).success).toBe(false);
});
