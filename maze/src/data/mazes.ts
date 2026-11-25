// The three mazes. Each is made from a seed, so it's the same maze every time you play it (you can
// learn it): a grid of rooms ("cells") joined by passages, carved like a real maze, then with some
// extra openings knocked through so there's more than one way round (a trap or the monster can be
// avoided by choosing another path), a few clearings, the ruby's chamber far from the way in, and the
// way in itself (which is also the only way out).
//
// The maze is a grid of tiles: tile (2i+1, 2j+1) is cell (i, j); the tiles between cells are walls
// or passages; the even/even tiles are always wall (the hedge corners).

export type Theme = 'bushes' | 'city' | 'castle';

export interface MazeDef {
  name: string;
  theme: Theme;
  /** Cells across and down. */
  w: number;
  h: number;
  seed: number;
  /** Share of the walls left after carving that get knocked through (more loops). */
  loops: number;
  /** How many open clearings (2×2 cells) to carve. */
  clearings: number;
  /** How many passages close when the maze shifts after the ruby. */
  shifts: number;
}

export const MAZES: MazeDef[] = [
  { name: 'The Hedge Maze', theme: 'bushes', w: 17, h: 17, seed: 7151, loops: 0.05, clearings: 4, shifts: 4 },
  // (Tuned with tools/maze-seeds.ts: the shortest walk in and back out is about 1.3× and 1.5× the
  // hedge maze's, so each maze is a bit bigger and harder than the last without dragging on.)
  { name: 'The City Walls', theme: 'city', w: 21, h: 21, seed: 7771, loops: 0.05, clearings: 5, shifts: 3 },
  { name: 'The Castle', theme: 'castle', w: 23, h: 23, seed: 3212, loops: 0.045, clearings: 6, shifts: 3 },
];

/** A small seeded random number generator (the same numbers for the same seed). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TrapKind =
  | 'thorns' | 'wasps' | 'mud'
  | 'manhole' | 'flowerpot' | 'honey'
  | 'spikes' | 'fire' | 'trapdoor';

/**
 * What a trap does to you:
 * - step: walk into it and it hurts (thorns, an open manhole);
 * - timed: it hurts only when it goes off, and you can see it coming (flowerpots, spikes, fire);
 * - rush: hurry through and it gets you; creep and you're fine (wasps, a creaky trapdoor);
 * - slow: it just slows you right down (mud, spilt honey).
 */
export const TRAP_HOW: Record<TrapKind, 'step' | 'timed' | 'rush' | 'slow'> = {
  thorns: 'step', manhole: 'step',
  flowerpot: 'timed', spikes: 'timed', fire: 'timed',
  wasps: 'rush', trapdoor: 'rush',
  mud: 'slow', honey: 'slow',
};

/** Traps that sit across a gap between two cells (the rest fill a cell). */
export const IN_GAP: TrapKind[] = ['thorns', 'manhole', 'spikes'];

/** A trap on one tile of the maze. */
export interface Trap {
  kind: TrapKind;
  tile: [number, number];
}

/** How many of each trap a maze has. */
const TRAPS: Record<Theme, [TrapKind, number][]> = {
  bushes: [['thorns', 6], ['wasps', 3], ['mud', 3]],
  city: [['manhole', 6], ['flowerpot', 4], ['honey', 4]],
  castle: [['spikes', 6], ['fire', 5], ['trapdoor', 4]],
};

export interface Layout {
  def: MazeDef;
  /** Tiles across and down (2w+1, 2h+1). */
  tw: number;
  th: number;
  /** 1 = wall, 0 = open. Index ty * tw + tx. */
  wall: Uint8Array;
  /** The way in: the cell just inside, and the opening in the outer wall below it. */
  entrance: { cell: [number, number]; gap: [number, number] };
  /** The ruby's cell (in the middle of its chamber). */
  ruby: [number, number];
  /** Where the map's glow says the ruby is (roughly: near it, not on it). */
  rubyHint: [number, number];
  /** Cells that are clearings. */
  clearings: [number, number][];
  /** Riddle keepers, each standing in a gap that's a shortcut (a tile; solid until answered). */
  keepers: { tile: [number, number]; way: 'in' | 'out' }[];
  traps: Trap[];
  /** (Tools: how many tiles each keeper's shortcut saves.) */
  gains: number[];
}

export function generate(def: MazeDef): Layout {
  const r = rng(def.seed);
  const { w, h } = def;
  const tw = w * 2 + 1, th = h * 2 + 1;
  const wall = new Uint8Array(tw * th).fill(1);
  const T = (x: number, y: number) => y * tw + x;
  const open = (cx: number, cy: number) => { wall[T(cx * 2 + 1, cy * 2 + 1)] = 0; };
  const between = (ax: number, ay: number, bx: number, by: number) => T(ax + bx + 1, ay + by + 1);

  // Carve: a random walk that backs up when it's stuck (long winding passages, one way between any
  // two places).
  const seen = new Uint8Array(w * h);
  const entranceCell: [number, number] = [Math.floor(w / 2), h - 1];
  const stack: [number, number][] = [entranceCell];
  seen[entranceCell[1] * w + entranceCell[0]] = 1;
  open(...entranceCell);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dy]) => [cx + dx, cy + dy] as [number, number])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && !seen[y * w + x]);
    if (!next.length) { stack.pop(); continue; }
    const [nx, ny] = next[Math.floor(r() * next.length)];
    seen[ny * w + nx] = 1;
    open(nx, ny);
    wall[between(cx, cy, nx, ny)] = 0;
    stack.push([nx, ny]);
  }

  // Loops: knock through some of the walls left between cells (never the outer wall).
  const inner: number[] = [];
  for (let y = 1; y < th - 1; y++) for (let x = 1; x < tw - 1; x++) {
    if (!wall[T(x, y)] || (x % 2 === 0 && y % 2 === 0) || (x % 2 === 1 && y % 2 === 1)) continue;
    inner.push(T(x, y));
  }
  for (const k of inner) if (r() < def.loops) wall[k] = 0;

  // How far every cell is from the way in (walking).
  const dist = (from: [number, number]) => {
    const d = new Int32Array(w * h).fill(-1);
    const q: [number, number][] = [from];
    d[from[1] * w + from[0]] = 0;
    while (q.length) {
      const [cx, cy] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || d[ny * w + nx] >= 0) continue;
        if (wall[between(cx, cy, nx, ny)]) continue;
        d[ny * w + nx] = d[cy * w + cx] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  };

  const clearOut = (cx: number, cy: number, size: number) => {
    // Open every tile inside the block of cells (cx..cx+size-1, cy..cy+size-1).
    for (let y = cy * 2 + 1; y <= (cy + size - 1) * 2 + 1; y++) for (let x = cx * 2 + 1; x <= (cx + size - 1) * 2 + 1; x++) wall[T(x, y)] = 0;
  };

  // Clearings: open 2×2 blocks of cells, spread out, away from the entrance and the ruby.
  const clearings: [number, number][] = [];
  for (let tries = 0; clearings.length < def.clearings && tries < 200; tries++) {
    const cx = 1 + Math.floor(r() * (w - 3)), cy = 1 + Math.floor(r() * (h - 3));
    const far = (p: [number, number], m: number) => Math.abs(p[0] - cx) + Math.abs(p[1] - cy) > m;
    if (!far(entranceCell, 3) || !clearings.every((c) => far(c, 4))) continue;
    clearings.push([cx, cy]);
    clearOut(cx, cy, 2);
  }

  // The ruby: in the farthest part of the maze from the way in, in a chamber (a 3×3 clearing, with
  // just a couple of ways into it).
  const d0 = dist(entranceCell);
  let ruby: [number, number] = [0, 0], best = -1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    // (Not in a clearing: the ruby has its own chamber.)
    if (clearings.some(([cx, cy]) => x >= cx - 1 && x <= cx + 2 && y >= cy - 1 && y <= cy + 2)) continue;
    // (Scored by the nearest cell of its 3×3 chamber: opening the chamber joins all of them.)
    let near = Infinity;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) near = Math.min(near, d0[(y + j) * w + x + i]);
    const v = near + r() * 2;
    if (v > best) { best = v; ruby = [x, y]; }
  }
  clearOut(ruby[0] - 1, ruby[1] - 1, 3);

  // The way in: a gap in the bottom wall below the entrance cell.
  const gap: [number, number] = [entranceCell[0] * 2 + 1, th - 1];
  wall[T(...gap)] = 0;

  // The map's glow: a few cells off the ruby, the same each time.
  const a = r() * Math.PI * 2;
  const rubyHint: [number, number] = [ruby[0] + Math.cos(a) * 1.6, ruby[1] + Math.sin(a) * 1.6];
  const L: Layout = { def, tw, th, wall, entrance: { cell: entranceCell, gap }, ruby, rubyHint, clearings, keepers: [], traps: [], gains: [] };
  populate(L, r);
  return L;
}

/** Shortest walk (in tiles) between two tiles, not through walls or `blocked` tiles; Infinity if there's none. */
function walk(L: Layout, wall: Uint8Array, from: number, to: number, blocked: Set<number>) {
  const { tw, th } = L;
  const d = new Int32Array(tw * th).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === to) return d[k];
    const x = k % tw, y = (k - x) / tw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
      const n = ny * tw + nx;
      if (wall[n] || blocked.has(n) || d[n] >= 0) continue;
      d[n] = d[k] + 1;
      q.push(n);
    }
  }
  return Infinity;
}

/**
 * Riddle keepers and traps. A keeper stands in a gap knocked through a hedge where it makes the
 * biggest shortcut: one on the way in, one on the way out (as it is after the maze shifts). Traps go
 * mostly on the obvious route but only where there's still a way round them without one (going in,
 * and coming out after the shift), so you can always choose the long way instead of losing a heart.
 */
function populate(L: Layout, r: () => number) {
  const { tw, th, wall } = L;
  const T = (x: number, y: number) => y * tw + x;
  const ent = T(...L.entrance.gap), rub = T(L.ruby[0] * 2 + 1, L.ruby[1] * 2 + 1);
  const cellOf = (k: number): [number, number] => [Math.floor((k % tw) / 2), Math.floor(Math.floor(k / tw) / 2)];
  const special = (k: number) => {
    const [cx, cy] = cellOf(k);
    return (Math.abs(cx - L.ruby[0]) <= 2 && Math.abs(cy - L.ruby[1]) <= 2) || Math.abs(cx - L.entrance.cell[0]) + Math.abs(cy - L.entrance.cell[1]) < 3;
  };
  const passage = (k: number) => { const x = k % tw, y = Math.floor(k / tw); return (x % 2) !== (y % 2) && x > 0 && y > 0 && x < tw - 1 && y < th - 1; };
  const keeperTiles = new Set<number>();
  // The best shortcut: of the hedges between two cells, the one whose gap shortens a walk the most.
  const bestGap = (w: Uint8Array, from: number, to: number) => {
    const base = walk(L, w, from, to, keeperTiles);
    let best = -1, gain = 0;
    for (let k = 0; k < w.length; k++) {
      if (!w[k] || !passage(k) || special(k)) continue;
      // Keepers well apart.
      if ([...keeperTiles].some((t) => Math.abs((t % tw) - (k % tw)) + Math.abs(Math.floor(t / tw) - Math.floor(k / tw)) < 10)) continue;
      w[k] = 0;
      const d = walk(L, w, from, to, keeperTiles);
      w[k] = 1;
      if (base - d > gain) { gain = base - d; best = k; }
    }
      L.gains.push(gain);
    return gain > 6 ? best : -1;
  };
  const kin = bestGap(wall, ent, rub);
  if (kin >= 0) { wall[kin] = 0; keeperTiles.add(kin); L.keepers.push({ tile: [kin % tw, Math.floor(kin / tw)], way: 'in' }); }
  // The way out as it'll be after the shift.
  const after = () => {
    const copy: Layout = { ...L, wall: Uint8Array.from(wall) };
    shiftAfterRuby(copy, keeperTiles);
    return copy.wall;
  };
  const sim = after();
  const kout = bestGap(sim, rub, ent);
  if (kout >= 0 && wall[kout]) { wall[kout] = 0; sim[kout] = 0; keeperTiles.add(kout); L.keepers.push({ tile: [kout % tw, Math.floor(kout / tw)], way: 'out' }); }
  // Traps that hurt must leave a way round (mud and honey only slow you down).
  const shifted = after();
  const blocking = new Set<number>(keeperTiles);
  const ok = () => walk(L, wall, ent, rub, blocking) < Infinity && walk(L, shifted, rub, ent, blocking) < Infinity;
  const taken = new Set<number>(keeperTiles);
  const onRoute = () => {
    // The shortest way in, ignoring traps: that's where traps hurt.
    const d = new Int32Array(tw * th).fill(-1), prev = new Int32Array(tw * th).fill(-1);
    d[ent] = 0;
    const q = [ent];
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % tw, y = (k - x) / tw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * tw + nx;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th || wall[n] || keeperTiles.has(n) || d[n] >= 0) continue;
        d[n] = d[k] + 1; prev[n] = k; q.push(n);
      }
    }
    const way: number[] = [];
    for (let k = rub; k >= 0 && k !== ent; k = prev[k]) way.push(k);
    return way;
  };
  for (const [kind, n] of TRAPS[L.def.theme]) {
    for (let placed = 0, tries = 0; placed < n && tries < 400; tries++) {
      // Half on the obvious way in, the rest anywhere.
      let k: number;
      const route = onRoute();
      if (tries % 2 === 0 && route.length) k = route[Math.floor(r() * route.length)];
      else k = Math.floor(r() * tw * th);
      if (wall[k] || taken.has(k) || special(k)) continue;
      const x = k % tw, y = Math.floor(k / tw);
      // Thorns, manholes and spikes sit across a gap between cells; the rest fill a cell.
      if (IN_GAP.includes(kind) ? !passage(k) : !(x % 2 === 1 && y % 2 === 1)) continue;
      // Not right next to another trap.
      if ([...taken].some((t) => Math.abs((t % tw) - x) + Math.abs(Math.floor(t / tw) - y) < 3)) continue;
      if (TRAP_HOW[kind] !== 'slow') {
        blocking.add(k);
        if (!ok()) { blocking.delete(k); continue; }
      }
      taken.add(k);
      L.traps.push({ kind, tile: [x, y] });
      placed++;
    }
  }
}

/**
 * When the ruby's taken the maze shifts: hedges grow across a few passages on the shortest way back
 * out, and others open up until there's a way out again (always the same for a maze, so it can still
 * be learned). Changes the layout; returns the tiles that closed and opened.
 */
export function shiftAfterRuby(L: Layout, blocked: Set<number> = new Set(L.keepers.map((k) => k.tile[1] * L.tw + k.tile[0]))): { closed: number[]; opened: number[] } {
  const r = rng(L.def.seed * 7 + 13);
  const { tw, th, wall } = L;
  const T = (x: number, y: number) => y * tw + x;
  const from = T(L.ruby[0] * 2 + 1, L.ruby[1] * 2 + 1), to = T(...L.entrance.gap);
  const bfs = () => {
    const prev = new Int32Array(tw * th).fill(-2);
    prev[from] = -1;
    const q = [from];
    while (q.length) {
      const k = q.shift()!;
      const x = k % tw, y = Math.floor(k / tw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const n = T(nx, ny);
        if (wall[n] || blocked.has(n) || prev[n] !== -2) continue;
        prev[n] = k;
        q.push(n);
      }
    }
    return prev;
  };
  let prev: Int32Array;
  const cellOf = (k: number): [number, number] => [Math.floor((k % tw) / 2), Math.floor(Math.floor(k / tw) / 2)];
  const inOpenArea = (cx: number, cy: number) =>
    Math.abs(cx - L.ruby[0]) <= 2 && Math.abs(cy - L.ruby[1]) <= 2 ||
    L.clearings.some(([x, y]) => cx >= x - 1 && cx <= x + 2 && cy >= y - 1 && cy <= y + 2) ||
    Math.abs(cx - L.entrance.cell[0]) + Math.abs(cy - L.entrance.cell[1]) < 3;
  // A passage between two cells (an odd/even tile), away from the chamber, clearings and the way in.
  const closable = (k: number) => {
    const x = k % tw, y = Math.floor(k / tw);
    if ((x % 2) === (y % 2) || x === 0 || y === 0 || x === tw - 1 || y === th - 1) return false;
    const [cx, cy] = cellOf(k);
    return !inOpenArea(cx, cy);
  };
  // Four times: of the passages on the way out as it is now, close the one that makes the way out
  // longest (a real detour, not a step round it). If every one cuts the way out completely, close one
  // anyway and open another way (below).
  const lengthOut = () => {
    const p = bfs();
    if (p[to] === -2) return Infinity;
    let n = 0;
    for (let k = to; k !== -1; k = p[k]) n++;
    return n;
  };
  const closed: number[] = [];
  for (let round = 0; round < L.def.shifts; round++) {
    const p = bfs();
    // (Already cut off by the last one: the opening below makes a way again.)
    if (p[to] === -2) break;
    const way: number[] = [];
    for (let k = to; k !== -1; k = p[k]) way.push(k);
    let best = -1, bestLen = -1, cut = -1;
    for (const k of way) {
      if (!closable(k)) continue;
      wall[k] = 1;
      const l = lengthOut();
      wall[k] = 0;
      if (l === Infinity) { if (cut < 0 || r() < 0.3) cut = k; continue; }
      if (l > bestLen) { bestLen = l; best = k; }
    }
    const k = best >= 0 ? best : cut;
    if (k < 0) break;
    wall[k] = 1;
    closed.push(k);
  }
  // Open walls between the part you can reach and the rest until the way out is back.
  const opened: number[] = [];
  for (let guard = 0; guard < 50; guard++) {
    prev = bfs();
    if (prev[to] !== -2) break;
    const options: number[] = [];
    for (let y = 1; y < th - 1; y++) for (let x = 1; x < tw - 1; x++) {
      const k = T(x, y);
      if (!wall[k] || (x % 2) === (y % 2) || closed.includes(k)) continue;
      const a = x % 2 ? T(x, y - 1) : T(x - 1, y), b = x % 2 ? T(x, y + 1) : T(x + 1, y);
      if ((prev[a] !== -2) !== (prev[b] !== -2)) options.push(k);
    }
    if (!options.length) break;
    const k = options[Math.floor(r() * options.length)];
    wall[k] = 0;
    opened.push(k);
  }
  return { closed, opened };
}
