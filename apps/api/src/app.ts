import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { playerInputSchema, type Health } from "@ssb/shared";

export const app = new Hono()
  .get("/health", (c) => {
    const body: Health = { status: "ok", service: "ssb-api", time: new Date().toISOString() };
    return c.json(body);
  })
  // Contoh pola validasi; penyimpanan ke database menyusul.
  .post("/players", zValidator("json", playerInputSchema), (c) => {
    return c.json({ received: c.req.valid("json") }, 201);
  });

export type AppType = typeof app;
