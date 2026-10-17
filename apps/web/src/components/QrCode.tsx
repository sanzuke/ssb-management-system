import QRCode from "qrcode";
import { createMemo } from "solid-js";

/** QR sebagai SVG yang digambar sendiri dari matriks modul (tanpa innerHTML). Tenang 4 modul di sekeliling, sesuai standar. */
export default function QrCode(props: { value: string; label: string }) {
  const qr = createMemo(() => {
    const q = QRCode.create(props.value, { errorCorrectionLevel: "M" });
    const n = q.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.data[y * n + x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { n: n + 8, d };
  });
  return (
    <svg class="qr" viewBox={`0 0 ${qr().n} ${qr().n}`} role="img" aria-label={props.label} shape-rendering="crispEdges">
      <rect width={qr().n} height={qr().n} fill="#fff" />
      <path d={qr().d} fill="#14201A" />
    </svg>
  );
}
