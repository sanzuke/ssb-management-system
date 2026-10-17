"use client";
import { useState } from "react";
import type { Player } from "./players";

export default function PlayerList({ players }: { players: Player[] }) {
  const [q, setQ] = useState("");
  const [present, setPresent] = useState<Set<number>>(new Set());
  const shown = players.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: number) =>
    setPresent((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <section>
      <input placeholder="Cari pemain" value={q} onChange={(e) => setQ(e.target.value)} />
      <p>
        Hadir: {present.size} / {players.length}
      </p>
      <ul>
        {shown.map((p) => (
          <li key={p.id}>
            <label>
              <input type="checkbox" checked={present.has(p.id)} onChange={() => toggle(p.id)} />
              {p.name} · {p.group} · {p.position}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
