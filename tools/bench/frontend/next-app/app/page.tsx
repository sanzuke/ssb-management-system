import { Suspense } from "react";
import { connection } from "next/server";
import PlayerList from "./PlayerList";
import { makePlayers } from "./players";

async function Players() {
  await connection(); // paksa render per request (SSR dinamis)
  return <PlayerList players={makePlayers(200)} />;
}

export default function Home() {
  return (
    <main>
      <h1>Absensi Latihan</h1>
      <Suspense fallback={<p>Memuat…</p>}>
        <Players />
      </Suspense>
    </main>
  );
}
