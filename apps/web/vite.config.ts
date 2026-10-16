import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";

// Browser hanya bicara ke origin web. Permintaan /api diteruskan ke API oleh
// src/routes/api/[...path].ts, sehingga cookie sesi satu origin dan redirect Google kembali ke web.
export default defineConfig({
  plugins: [solidStart(), nitro()],
  server: { port: 3001 },
});
