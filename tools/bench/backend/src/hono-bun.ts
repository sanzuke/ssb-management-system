import { app } from "./hono-app.js";

declare const Bun: any;

Bun.serve({ port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1", fetch: app.fetch });
