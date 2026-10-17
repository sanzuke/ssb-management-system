/**
 * Garis lapangan sebagai latar: pandangan dari atas, dipotong sesuai ukuran layar.
 * Dua gambar: tegak untuk layar potret (HP) dan mendatar untuk layar lebar; CSS memilih salah satu.
 */
export default function Pitch() {
  return (
    <>
      <svg class="pitch pitch-tegak" viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect x="24" y="24" width="312" height="672" pathLength="1" />
        <line x1="24" y1="360" x2="336" y2="360" pathLength="1" />
        <circle cx="180" cy="360" r="52" pathLength="1" />
        <rect x="82" y="24" width="196" height="96" pathLength="1" />
        <rect x="130" y="24" width="100" height="36" pathLength="1" />
        <path d="M 138 120 A 52 52 0 0 0 222 120" pathLength="1" />
        <rect x="82" y="600" width="196" height="96" pathLength="1" />
        <rect x="130" y="660" width="100" height="36" pathLength="1" />
        <path d="M 138 600 A 52 52 0 0 1 222 600" pathLength="1" />
      </svg>
      <svg class="pitch pitch-mendatar" viewBox="0 0 720 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect x="24" y="24" width="672" height="312" pathLength="1" />
        <line x1="360" y1="24" x2="360" y2="336" pathLength="1" />
        <circle cx="360" cy="180" r="52" pathLength="1" />
        <rect x="24" y="82" width="96" height="196" pathLength="1" />
        <rect x="24" y="130" width="36" height="100" pathLength="1" />
        <path d="M 120 138 A 52 52 0 0 1 120 222" pathLength="1" />
        <rect x="600" y="82" width="96" height="196" pathLength="1" />
        <rect x="660" y="130" width="36" height="100" pathLength="1" />
        <path d="M 600 138 A 52 52 0 0 0 600 222" pathLength="1" />
      </svg>
    </>
  );
}
