// Membuat docs/izin.md dari matriks izin di packages/shared. Jalankan: bun run docs:izin
import { renderPermissionTable } from "../packages/shared/src/index";

const text = `# Matriks izin

Dibuat dari \`packages/shared/src/index.ts\` (\`permissions\`) oleh \`bun run docs:izin\`; jangan diedit tangan, test akan gagal bila tidak sinkron.
Endpoint dijaga dengan \`requirePermission(<izin>)\`. Pembatasan data per baris (pelatih hanya KU yang ditugaskan, orang tua hanya anaknya) ditegakkan di query dan RLS, bukan di sini.

${renderPermissionTable()}`;
await Bun.write(new URL("../docs/izin.md", import.meta.url), text);
