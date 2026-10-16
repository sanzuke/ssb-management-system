/** Garis lapangan sebagai latar: pandangan dari atas, dipotong sesuai ukuran layar. */
export default function Pitch() {
  return (
    <svg class="pitch" viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
  );
}
