import type { Metadata } from "next";

export const metadata: Metadata = { title: "Absensi Latihan" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
