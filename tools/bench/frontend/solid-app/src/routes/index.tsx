import { Title } from "@solidjs/meta";
import { createSignal, For } from "solid-js";
import { makePlayers } from "~/players";

export default function Home() {
  const players = makePlayers(200);
  const [q, setQ] = createSignal("");
  const [present, setPresent] = createSignal<Set<number>>(new Set());
  const shown = () => players.filter((p) => p.name.toLowerCase().includes(q().toLowerCase()));
  const toggle = (id: number) =>
    setPresent((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <main>
      <Title>Absensi Latihan</Title>
      <h1>Absensi Latihan</h1>
      <section>
        <input placeholder="Cari pemain" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <p>
          Hadir: {present().size} / {players.length}
        </p>
        <ul>
          <For each={shown()}>
            {(p) => (
              <li>
                <label>
                  <input type="checkbox" checked={present().has(p.id)} onChange={() => toggle(p.id)} />
                  {p.name} · {p.group} · {p.position}
                </label>
              </li>
            )}
          </For>
        </ul>
      </section>
    </main>
  );
}
