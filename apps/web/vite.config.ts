import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";

// Browser hanya bicara ke origin web. Permintaan /api diteruskan ke API oleh
// src/routes/api/[...path].ts, sehingga cookie sesi satu origin dan redirect Google kembali ke web.
// Di server dev, Nitro menjawab 404 untuk permintaan gambar (Sec-Fetch-Dest: image) ke rute itu sehingga foto
// pemain tidak tampil; proxy Vite ini meneruskan /api lebih awal. Di produksi proxy ini tidak dipakai.
const API_URL = process.env.API_URL ?? "http://localhost:3000";
export default defineConfig({
  plugins: [solidStart(), nitro()],
  server: {
    port: 3001,
    proxy: { "/api": { target: API_URL, rewrite: (path) => path.replace(/^\/api/, "") } },
  },
});
