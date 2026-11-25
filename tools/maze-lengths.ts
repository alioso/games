// Prints each maze's shortest way in and (after the shift) way out, in metres, and keeper gains.
import { MAZES, generate, shiftAfterRuby, type Layout } from '../maze/src/data/mazes';
const size = (i: number) => (i % 2 ? 2.3 : 0.8);
function path(L: Layout, from: number, to: number, blocked: Set<number>) {
  const { tw, th, wall } = L;
  const prev = new Int32Array(tw * th).fill(-2); prev[from] = -1;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % tw, y = (k - x) / tw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * tw + nx;
      if (nx < 0 || ny < 0 || nx >= tw || ny >= th || wall[n] || blocked.has(n) || prev[n] !== -2) continue;
      prev[n] = k; q.push(n);
    }
  }
  if (prev[to] === -2) return Infinity;
  let m = 0;
  for (let k = to; k !== -1; k = prev[k]) { const x = k % L.tw, y = Math.floor(k / L.tw); m += (x % 2 && y % 2) ? 2.3 : (x % 2 ? size(y) : size(x)); }
  return Math.round(m);
}
for (const [i, def] of MAZES.entries()) {
  const L = generate(def);
  const ent = L.entrance.gap[1] * L.tw + L.entrance.gap[0], rub = (L.ruby[1] * 2 + 1) * L.tw + L.ruby[0] * 2 + 1;
  const keepers = new Set(L.keepers.map((k) => k.tile[1] * L.tw + k.tile[0]));
  const inK = path(L, ent, rub, keepers), inOpen = path(L, ent, rub, new Set());
  const traps = new Set(L.traps.filter((t) => t.kind !== 'mud' && t.kind !== 'honey').map((t) => t.tile[1] * L.tw + t.tile[0]));
  const inSafe = path(L, ent, rub, new Set([...keepers, ...traps]));
  shiftAfterRuby(L);
  const outK = path(L, rub, ent, keepers), outOpen = path(L, rub, ent, new Set());
  const outSafe = path(L, rub, ent, new Set([...keepers, ...traps]));
  console.log(`${i} ${def.name}: in ${inK} m (riddle ${inOpen}, trap-free ${inSafe}) · out ${outK} m (riddle ${outOpen}, trap-free ${outSafe}) · total ${inK + outK} m ≈ ${Math.round((inK + outK) / 3.6 / 60 * 10) / 10} min at a run · gains ${L.gains} · traps ${L.traps.length}`);
}
