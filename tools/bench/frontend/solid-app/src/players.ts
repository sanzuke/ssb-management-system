export type Player = { id: number; name: string; group: string; position: string };

const first = ["Budi", "Andi", "Rizky", "Dimas", "Fajar", "Gilang", "Hafiz", "Ilham", "Joko", "Kevin"];
const last = ["Santoso", "Pratama", "Wijaya", "Nugroho", "Saputra", "Hidayat", "Putra", "Ramadhan"];
const groups = ["KU-8", "KU-10", "KU-12", "KU-14", "KU-16"];
const positions = ["GK", "DF", "MF", "FW"];

export function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${first[i % first.length]} ${last[(i * 3) % last.length]} ${i + 1}`,
    group: groups[i % groups.length],
    position: positions[i % positions.length],
  }));
}
