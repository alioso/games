// Search seeds/sizes for a maze theme whose total walk (in + shifted out) is near a target.
import { generate, shiftAfterRuby, type Layout, type MazeDef } from '../maze/src/data/mazes';
const [theme, w, shifts, target, loops, clearings] = process.argv.slice(2);
function len(L: Layout, from: number, to: number, blocked: Set<number>) {
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
  for (let k = to; k !== -1; k = prev[k]) { const x = k % tw, y = Math.floor(k / tw); m += (x % 2 && y % 2) ? 2.3 : 0.8; }
  return Math.round(m);
}
const out: string[] = [];
for (let seed = 1; seed < 400; seed++) {
  const def: MazeDef = { name: 't', theme: theme as any, w: +w, h: +w, seed: seed * 97 + 11, loops: +loops, clearings: +clearings, shifts: +shifts };
  const L = generate(def);
  const ent = L.entrance.gap[1] * L.tw + L.entrance.gap[0], rub = (L.ruby[1] * 2 + 1) * L.tw + L.ruby[0] * 2 + 1;
  const K = new Set(L.keepers.map((k) => k.tile[1] * L.tw + k.tile[0]));
  const a = len(L, ent, rub, K), ar = len(L, ent, rub, new Set());
  shiftAfterRuby(L);
  const b = len(L, rub, ent, K), br = len(L, rub, ent, new Set());
  const tot = a + b;
  if (Math.abs(tot - +target) < +target * 0.06 && L.keepers.length === 2 && b < a * 1.9 && b > a * 1.1) out.push(`seed ${def.seed}: in ${a} (r ${ar}) out ${b} (r ${br}) total ${tot} keepers ${L.keepers.length} traps ${L.traps.length}`);
}
console.log(out.slice(0, 12).join('\n') || 'none');
