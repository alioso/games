// Floor generator: a grid of rooms (some merged), doors along a spanning tree plus a few loops,
// furniture against the walls, and the key hidden in one searchable thing. Pure data, no meshes,
// so whole floors can be generated and checked quickly.
import { NavGrid } from '@engine/navgrid';
import { rng } from '@engine/math';
import { FURNITURE, type Find, type FurnitureKind } from '../data/furniture';
import { ROOMS, ROOM_POOL, type RoomType, type WallStyle } from '../data/rooms';
import { HEALS, JUNK } from '../data/lines';
import { HERO, HOUSE, gridFor } from '../data/tuning';

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Room {
  id: number;
  rect: Rect;
  type: RoomType;
  walls: WallStyle;
  cells: [number, number][];
}

/** A wall runs along x ('h', at a fixed z) or along z ('v', at a fixed x). */
export interface Wall {
  axis: 'h' | 'v';
  at: number;
  from: number;
  to: number;
  /** Room on the low side (smaller z or x) and the high side; -1 is outside. */
  lo: number;
  hi: number;
}

export interface Door {
  id: number;
  axis: 'h' | 'v';
  at: number;
  /** Centre along the wall. */
  c: number;
  lo: number;
  hi: number;
  kind: 'door' | 'exit' | 'arrival';
}

export interface Win {
  axis: 'h' | 'v';
  at: number;
  c: number;
  room: number;
  /** Which way is into the room (+1 or -1 along the other axis). */
  inward: number;
  open: boolean;
}

export interface Piece {
  id: number;
  kind: FurnitureKind;
  room: number;
  x: number;
  z: number;
  /** Yaw: 0 faces +z, PI/2 faces +x, PI faces -z, -PI/2 faces -x. */
  rot: number;
  /** Footprint on the ground. */
  box: Rect;
  find: Find;
}

export interface FloorPlan {
  seed: number;
  floor: number;
  bounds: Rect;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Win[];
  pieces: Piece[];
  start: { x: number; z: number };
  startRoom: number;
  exitRoom: number;
  exit: Door;
  arrival: Door;
  keyPiece: number;
}

type Rand = ReturnType<typeof rng>;

const T = HOUSE.wallThick / 2;

export function rectOverlap(a: Rect, b: Rect, pad = 0) {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
}

export function rectDist(r: Rect, x: number, z: number) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function inRect(r: Rect, x: number, z: number, pad = 0) {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

export function roomAt(plan: FloorPlan, x: number, z: number) {
  return plan.rooms.find((r) => inRect(r.rect, x, z)) ?? null;
}

/** Why the last attempt was thrown away (for debugging the generator). */
export let lastFail = '';

export function generateFloor(seed: number, floor: number): FloorPlan {
  // A floor that fails its checks is simply regenerated from the next seed.
  for (let attempt = 0; attempt < 40; attempt++) {
    const plan = tryGenerate(seed + attempt * 7919, floor);
    if (plan) return plan;
  }
  throw new Error('could not generate a floor');
}

function tryGenerate(seed: number, floor: number): FloorPlan | null {
  const R = rng(seed);
  const { cols, rows } = gridFor(floor);
  const snap = (v: number) => Math.round(v * 2) / 2;
  const colW = Array.from({ length: cols }, () => snap(R.range(...HOUSE.colWidth)));
  const rowD = Array.from({ length: rows }, () => snap(R.range(...HOUSE.rowDepth)));
  const X = [0];
  for (const w of colW) X.push(X[X.length - 1] + w);
  const Z = [0];
  for (const d of rowD) Z.push(Z[Z.length - 1] + d);
  // Centre the house on the origin.
  const ox = -X[cols] / 2, oz = -Z[rows] / 2;
  for (let i = 0; i < X.length; i++) X[i] += ox;
  for (let i = 0; i < Z.length; i++) Z[i] += oz;

  // Cells → rooms, merging a few horizontal pairs into big rooms (never in the bottom row: that's where you arrive).
  const cellRoom: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const groups: [number, number][][] = [];
  const merges = R.next() < 0.5 ? 1 : 2;
  for (let m = 0; m < merges; m++) {
    const r = Math.floor(R.next() * (rows - 1));
    const c = Math.floor(R.next() * (cols - 1));
    if (cellRoom[r][c] >= 0 || cellRoom[r][c + 1] >= 0) continue;
    cellRoom[r][c] = cellRoom[r][c + 1] = groups.length;
    groups.push([[c, r], [c + 1, r]]);
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (cellRoom[r][c] < 0) {
        cellRoom[r][c] = groups.length;
        groups.push([[c, r]]);
      }

  const rooms: Room[] = groups.map((cells, id) => {
    const cs = cells.map((p) => p[0]), rs = cells.map((p) => p[1]);
    const rect = { x0: X[Math.min(...cs)], x1: X[Math.max(...cs) + 1], z0: Z[Math.min(...rs)], z1: Z[Math.max(...rs) + 1] };
    return { id, rect, cells, type: 'landing' as RoomType, walls: ROOMS.landing.walls[0] };
  });
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? -1 : cellRoom[r][c]);

  // Shared wall pieces between neighbouring rooms, cell by cell.
  type Edge = { axis: 'h' | 'v'; at: number; from: number; to: number; lo: number; hi: number };
  const edges: Edge[] = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c < cols; c++) {
      const lo = at(c, r - 1), hi = at(c, r);
      if (lo !== hi) edges.push({ axis: 'h', at: Z[r], from: X[c], to: X[c + 1], lo, hi });
    }
  for (let c = 0; c <= cols; c++)
    for (let r = 0; r < rows; r++) {
      const lo = at(c - 1, r), hi = at(c, r);
      if (lo !== hi) edges.push({ axis: 'v', at: X[c], from: Z[r], to: Z[r + 1], lo, hi });
    }

  // Doors: a random spanning tree, plus a few extra loops so chases can go round in circles.
  const inner = edges.filter((e) => e.lo >= 0 && e.hi >= 0);
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const pairs = new Map<string, Edge[]>();
  for (const e of inner) {
    const k = pairKey(e.lo, e.hi);
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(e);
  }
  const keys = [...pairs.keys()];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(R.next() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const doorPairs: string[] = [];
  for (const k of keys) {
    const [a, b] = k.split(':').map(Number);
    if (find(a) !== find(b)) {
      parent[find(a)] = find(b);
      doorPairs.push(k);
    } else if (R.next() < 0.3) doorPairs.push(k);
  }

  const doors: Door[] = [];
  const adj = rooms.map(() => [] as number[]);
  for (const k of doorPairs) {
    const e = R.pick(pairs.get(k)!);
    const span = e.to - e.from;
    const slack = Math.max(0, span / 2 - HOUSE.doorWidth / 2 - 0.6);
    doors.push({ id: doors.length, axis: e.axis, at: e.at, c: (e.from + e.to) / 2 + R.range(-slack, slack) * 0.7, lo: e.lo, hi: e.hi, kind: 'door' });
    adj[e.lo].push(e.hi);
    adj[e.hi].push(e.lo);
  }

  // Arrive in the bottom row; the exit is in the top row, as far away (in doors) as possible.
  const bottom = rooms.filter((r) => r.cells.some(([, rr]) => rr === rows - 1));
  const startRoom = R.pick(bottom).id;
  const depth = bfs(adj, startRoom);
  const top = rooms.filter((r) => r.cells.some(([, rr]) => rr === 0));
  const maxD = Math.max(...top.map((r) => depth[r.id]));
  const exitRoom = R.pick(top.filter((r) => depth[r.id] === maxD)).id;

  const sr = rooms[startRoom].rect, er = rooms[exitRoom].rect;
  const arrival: Door = { id: doors.length, axis: 'h', at: sr.z1, c: snap((sr.x0 + sr.x1) / 2 + R.range(-1, 1)), lo: startRoom, hi: -1, kind: 'arrival' };
  doors.push(arrival);
  const exit: Door = { id: doors.length, axis: 'h', at: er.z0, c: snap((er.x0 + er.x1) / 2 + R.range(-1.2, 1.2)), lo: -1, hi: exitRoom, kind: 'exit' };
  doors.push(exit);

  // Room types: a landing where you arrive, then a shuffled mix (big rooms for merged cells).
  rooms[startRoom].type = 'landing';
  const pool: RoomType[] = [];
  for (const room of rooms) {
    if (room.id === startRoom) continue;
    if (!pool.length) {
      pool.push(...ROOM_POOL);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(R.next() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    const i = room.cells.length > 1 ? Math.max(0, pool.findIndex((t) => ROOMS[t].big)) : 0;
    room.type = pool.splice(i, 1)[0];
  }
  for (const room of rooms) room.walls = R.pick(ROOMS[room.type].walls);

  // Walls: the edges merged along each line, cut around the doors.
  const walls: Wall[] = [];
  for (const e of edges) {
    const prev = walls[walls.length - 1];
    if (prev && prev.axis === e.axis && prev.at === e.at && prev.to === e.from && prev.lo === e.lo && prev.hi === e.hi) prev.to = e.to;
    else walls.push({ ...e });
  }

  // Windows on outside walls (never where a door is), some flung open with the wind blowing in.
  const windows: Win[] = [];
  for (const w of walls) {
    if (w.lo >= 0 && w.hi >= 0) continue;
    const room = w.lo >= 0 ? w.lo : w.hi;
    const inward = w.lo >= 0 ? -1 : 1;
    // No windows in south walls: the camera looks over them.
    if (w.axis === 'h' && inward === -1) continue;
    const len = w.to - w.from;
    const count = len > 6 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (R.next() < 0.35) continue;
      const c = w.from + (len * (i + 0.5)) / count + R.range(-0.5, 0.5);
      const clash = doors.some((d) => d.axis === w.axis && d.at === w.at && Math.abs(d.c - c) < HOUSE.doorWidth / 2 + 1.0);
      if (!clash) windows.push({ axis: w.axis, at: w.at, c, room, inward, open: R.next() < 0.4 });
    }
  }

  const bounds = { x0: X[0], z0: Z[0], x1: X[cols], z1: Z[rows] };
  const start = { x: arrival.c, z: arrival.at - 1.0 };
  const pieces = furnish(R, rooms, doors, windows, start);
  const plan: FloorPlan = { seed, floor, bounds, rooms, walls, doors, windows, pieces, start, startRoom, exitRoom, exit, arrival, keyPiece: -1 };
  if (!settle(plan)) return null;
  hideKey(R, plan);
  if (plan.keyPiece < 0) lastFail = 'no place for the key';
  return plan.keyPiece >= 0 ? plan : null;
}

function bfs(adj: number[][], from: number) {
  const d = adj.map(() => Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const a = q.shift()!;
    for (const b of adj[a]) if (d[b] === Infinity) { d[b] = d[a] + 1; q.push(b); }
  }
  return d;
}

/** Keep-out zones in front of every doorway, in a room's own coordinates. */
function doorZones(room: Room, doors: Door[]) {
  const zones: Rect[] = [];
  const hw = HOUSE.doorWidth / 2 + 0.15, dc = HOUSE.doorClear;
  for (const d of doors) {
    if (d.lo !== room.id && d.hi !== room.id) continue;
    if (d.axis === 'h') zones.push({ x0: d.c - hw, x1: d.c + hw, z0: d.at - dc, z1: d.at + dc });
    else zones.push({ x0: d.at - dc, x1: d.at + dc, z0: d.c - hw, z1: d.c + hw });
  }
  return zones;
}

/** Showpieces: one per floor is plenty. */
const ONE_PER_FLOOR: FurnitureKind[] = ['piano', 'clock'];
/** Knick-knacks: no more than two per room, so rooms look like what they are. */
const DECOR: FurnitureKind[] = ['painting', 'plant', 'lamp', 'vase', 'clock', 'candles'];

function furnish(R: Rand, rooms: Room[], doors: Door[], windows: Win[], start: { x: number; z: number }): Piece[] {
  const pieces: Piece[] = [];
  for (const room of rooms) {
    const style = ROOMS[room.type];
    const r = room.rect;
    const inner = { x0: r.x0 + T, x1: r.x1 - T, z0: r.z0 + T, z1: r.z1 - T };
    const zones = doorZones(room, doors);
    if (inRect(r, start.x, start.z)) zones.push({ x0: start.x - 1, x1: start.x + 1, z0: start.z - 1, z1: start.z + 1.2 });
    const mine: Piece[] = [];
    const wins = windows.filter((w) => w.room === room.id);

    const fits = (box: Rect, kind: FurnitureKind, wall: 'n' | 's' | 'e' | 'w' | null) => {
      const def = FURNITURE[kind];
      if (def.flat) return !mine.some((p) => FURNITURE[p.kind].flat && rectOverlap(p.box, box));
      if (zones.some((z) => rectOverlap(z, box))) return false;
      if (def.place === 'hung') {
        // Paintings: not over doors, windows or anything tall.
        return !mine.some((p) => (FURNITURE[p.kind].size[2] > 1.25 || FURNITURE[p.kind].place === 'hung') && rectOverlap(p.box, box, 0.1)) && !wins.some((w) => winBox(w, 0.5) && rectOverlap(winBox(w, 0.5), box));
      }
      if (mine.some((p) => !FURNITURE[p.kind].flat && FURNITURE[p.kind].place !== 'hung' && rectOverlap(p.box, box, 0.12))) return false;
      if (def.size[2] > 1.25 && wins.some((w) => rectOverlap(winBox(w, 0.6), box))) return false;
      if (def.size[2] > 1.25 && mine.some((p) => FURNITURE[p.kind].place === 'hung' && rectOverlap(p.box, box))) return false;
      // Tall things never stand against the south wall: the camera looks over it.
      if (wall === 's' && def.size[2] > 1.1) return false;
      return true;
    };

    const tryPlace = (kind: FurnitureKind) => {
      const def = FURNITURE[kind];
      const [w, d] = def.size;
      if (def.place === 'center') {
        const cw = inner.x1 - inner.x0, cd = inner.z1 - inner.z0;
        const along = cw >= cd;
        const fw = along ? w : d, fd = along ? d : w;
        const margin = def.flat ? 0.9 : 1.5;
        if (cw < fw + margin * 2 || cd < fd + margin * 2) return;
        for (let i = 0; i < 12; i++) {
          const x = (inner.x0 + inner.x1) / 2 + R.range(-0.6, 0.6);
          const z = (inner.z0 + inner.z1) / 2 + R.range(-0.4, 0.4);
          const box = { x0: x - fw / 2, x1: x + fw / 2, z0: z - fd / 2, z1: z + fd / 2 };
          if (!fits(box, kind, null)) continue;
          mine.push({ id: -1, kind, room: room.id, x, z, rot: along ? 0 : Math.PI / 2, box, find: { kind: 'empty' } });
          return;
        }
        return;
      }
      for (let i = 0; i < 24; i++) {
        const side = R.pick(['n', 'n', 'e', 'w', 's'] as const);
        const hung = def.place === 'hung';
        const depth = hung ? 0.1 : d;
        let x: number, z: number, rot: number, box: Rect;
        if (side === 'n' || side === 's') {
          if (inner.x1 - inner.x0 < w + 0.2) continue;
          x = R.range(inner.x0 + w / 2 + 0.05, inner.x1 - w / 2 - 0.05);
          z = side === 'n' ? inner.z0 + depth / 2 : inner.z1 - depth / 2;
          rot = side === 'n' ? 0 : Math.PI;
          box = { x0: x - w / 2, x1: x + w / 2, z0: z - depth / 2, z1: z + depth / 2 };
        } else {
          if (inner.z1 - inner.z0 < w + 0.2) continue;
          z = R.range(inner.z0 + w / 2 + 0.05, inner.z1 - w / 2 - 0.05);
          x = side === 'w' ? inner.x0 + depth / 2 : inner.x1 - depth / 2;
          rot = side === 'w' ? Math.PI / 2 : -Math.PI / 2;
          box = { x0: x - depth / 2, x1: x + depth / 2, z0: z - w / 2, z1: z + w / 2 };
        }
        if (hung && side === 's') continue;
        if (!fits(box, kind, side)) continue;
        mine.push({ id: -1, kind, room: room.id, x, z, rot, box, find: { kind: 'empty' } });
        return;
      }
    };

    for (const k of style.must) tryPlace(k);
    for (const k of style.center ?? []) tryPlace(k);
    const area = (inner.x1 - inner.x0) * (inner.z1 - inner.z0);
    const extra = Math.round(area / 10) + Math.floor(R.next() * 2);
    // Extras come out of a bag, so nothing doubles up unless the room says it can.
    const bag = [...style.maybe];
    for (let i = 0; i < extra && bag.length; i++) {
      const k = bag.splice(Math.floor(R.next() * bag.length), 1)[0];
      if (style.repeat?.includes(k)) bag.push(k);
      if (ONE_PER_FLOOR.includes(k) && pieces.some((p) => p.kind === k)) continue;
      if (DECOR.includes(k) && mine.filter((p) => DECOR.includes(p.kind)).length >= 2) continue;
      tryPlace(k);
    }
    // Every room gets something to see by.
    if (!mine.some((p) => FURNITURE[p.kind].light)) tryPlace(R.next() < 0.5 ? 'lamp' : 'candles');
    // Tables come with chairs.
    for (const t of mine.filter((p) => p.kind === 'table')) addChairs(t, mine, room);
    for (const p of mine) { p.id = pieces.length; pieces.push(p); }
  }
  return pieces;
}

function winBox(w: Win, depth: number): Rect {
  const hw = 0.75;
  if (w.axis === 'h') return { x0: w.c - hw, x1: w.c + hw, z0: w.at + Math.min(0, w.inward * depth), z1: w.at + Math.max(0, w.inward * depth) };
  return { x0: w.at + Math.min(0, w.inward * depth), x1: w.at + Math.max(0, w.inward * depth), z0: w.c - hw, z1: w.c + hw };
}

function addChairs(t: Piece, mine: Piece[], room: Room) {
  const along = t.rot === 0;
  const [w, d] = FURNITURE.table.size;
  const spots: [number, number, number][] = along
    ? [[-0.5, -d / 2 - 0.3, 0], [0.5, -d / 2 - 0.3, 0], [-0.5, d / 2 + 0.3, Math.PI], [0.5, d / 2 + 0.3, Math.PI]]
    : [[-d / 2 - 0.3, -0.5, Math.PI / 2], [-d / 2 - 0.3, 0.5, Math.PI / 2], [d / 2 + 0.3, -0.5, -Math.PI / 2], [d / 2 + 0.3, 0.5, -Math.PI / 2]];
  void w;
  for (const [dx, dz, face] of spots) {
    const x = t.x + dx, z = t.z + dz;
    const box = { x0: x - 0.22, x1: x + 0.22, z0: z - 0.22, z1: z + 0.22 };
    if (mine.some((p) => !FURNITURE[p.kind].flat && rectOverlap(p.box, box, 0.05))) continue;
    // Chairs face the table: rot points their front at it, so their back is away.
    mine.push({ id: -1, kind: 'chair', room: room.id, x, z, rot: face + Math.PI, box, find: { kind: 'empty' } });
  }
}

/** Build the walkability grid for a plan (walls, furniture), inflated by the hero's size. */
export function buildNav(plan: FloorPlan, skip?: Set<number>) {
  const b = plan.bounds;
  const pad = 1.6;
  const nav = new NavGrid(b.x0 - pad, b.z0 - pad, b.x1 - b.x0 + pad * 2, b.z1 - b.z0 + pad * 2, 0.25);
  const boxes = solidBoxes(plan, skip);
  const r = HERO.radius;
  nav.mark((x, z) => {
    if (!inRect(b, x, z, -0.05)) {
      // Only the stair landings outside the house are walkable.
      return !stairRects(plan).some((s) => x > s.x0 + r && x < s.x1 - r && z > s.z0 && z < s.z1);
    }
    return boxes.some((q) => inRect(q, x, z, r));
  });
  return nav;
}

/** Everything solid: walls (minus doorways) and furniture footprints. */
export function solidBoxes(plan: FloorPlan, skip?: Set<number>): Rect[] {
  const out: Rect[] = [];
  const hw = HOUSE.doorWidth / 2;
  for (const w of plan.walls) {
    const cuts = plan.doors.filter((d) => d.axis === w.axis && d.at === w.at && d.c > w.from && d.c < w.to).map((d) => d.c).sort((a, b) => a - b);
    let from = w.from - T;
    for (const c of cuts) {
      if (c - hw > from) out.push(wallRect(w, from, c - hw));
      from = c + hw;
    }
    if (w.to + T > from) out.push(wallRect(w, from, w.to + T));
  }
  for (const p of plan.pieces) if (!FURNITURE[p.kind].flat && FURNITURE[p.kind].place !== 'hung' && !skip?.has(p.id)) out.push(p.box);
  // Stairwell side walls.
  const [down, up] = stairRects(plan);
  for (const s of [down, up]) {
    out.push({ x0: s.x0 - 0.2, x1: s.x0, z0: s.z0, z1: s.z1 });
    out.push({ x0: s.x1, x1: s.x1 + 0.2, z0: s.z0, z1: s.z1 });
  }
  out.push({ x0: down.x0, x1: down.x1, z0: down.z1, z1: down.z1 + 0.2 });
  out.push({ x0: up.x0, x1: up.x1, z0: up.z0 - 0.2, z1: up.z0 });
  return out;
}

function wallRect(w: Wall, from: number, to: number): Rect {
  return w.axis === 'h' ? { x0: from, x1: to, z0: w.at - T, z1: w.at + T } : { x0: w.at - T, x1: w.at + T, z0: from, z1: to };
}

/** The two stairwells outside the house: down (arrival, south) and up (exit, north). */
export function stairRects(plan: FloorPlan): [Rect, Rect] {
  const hw = HOUSE.doorWidth / 2;
  const a = plan.arrival, e = plan.exit;
  return [
    { x0: a.c - hw, x1: a.c + hw, z0: a.at - T, z1: a.at + 2.6 },
    { x0: e.c - hw, x1: e.c + hw, z0: e.at - 2.6, z1: e.at + T },
  ];
}

/**
 * Make sure every doorway, the exit, and every searchable thing can be reached from the start.
 * Blocking furniture is removed; unreachable searchables too. Returns false if the floor is hopeless.
 */
function settle(plan: FloorPlan) {
  for (let pass = 0; pass < 12; pass++) {
    const nav = buildNav(plan);
    const reach = flood(nav, plan.start.x, plan.start.z);
    const ok = (x: number, z: number) => {
      const [c, r] = nav.cellOf(x, z);
      return reach[r * nav.cols + c] === 1;
    };
    const stuck = plan.doors.find((d) => !doorSides(d).every(([x, z]) => ok(x, z)));
    if (!stuck) {
      // Drop searchables nobody can get to; keep the rest.
      plan.pieces = plan.pieces.filter((p) => {
        const def = FURNITURE[p.kind];
        if (def.search === 'none') return true;
        return nearReachable(nav, reach, p.box, HERO.reach, plan.rooms[p.room].rect);
      });
      plan.pieces.forEach((p, i) => (p.id = i));
      return true;
    }
    // Remove the non-flat piece nearest the stuck doorway and try again.
    const [dx, dz] = [stuck.axis === 'h' ? stuck.c : stuck.at, stuck.axis === 'h' ? stuck.at : stuck.c];
    let best = -1, bestD = Infinity;
    plan.pieces.forEach((p, i) => {
      if (FURNITURE[p.kind].flat || FURNITURE[p.kind].place === 'hung') return;
      const d = rectDist(p.box, dx, dz);
      if (d < bestD) { bestD = d; best = i; }
    });
    lastFail = `door ${stuck.id} (${stuck.kind}) unreachable`;
    if (best < 0) return false;
    plan.pieces.splice(best, 1);
    plan.pieces.forEach((p, i) => (p.id = i));
  }
  return false;
}

/** True if every doorway (and the exit) can still be walked to from (x, z). */
export function doorsReachable(plan: FloorPlan, x: number, z: number, skip?: Set<number>) {
  const nav = buildNav(plan, skip);
  const reach = flood(nav, x, z);
  return plan.doors.every((d) => doorSides(d).every(([dx, dz]) => {
    const [c, r] = nav.cellOf(dx, dz);
    return reach[r * nav.cols + c] === 1;
  }));
}

function doorSides(d: Door): [number, number][] {
  const o = 0.6;
  return d.axis === 'h' ? [[d.c, d.at - o], [d.c, d.at + o]] : [[d.at - o, d.c], [d.at + o, d.c]];
}

function flood(nav: NavGrid, x: number, z: number) {
  const seen = new Uint8Array(nav.cols * nav.rows);
  const [c0, r0] = nav.cellOf(x, z);
  const q = [r0 * nav.cols + c0];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const c = i % nav.cols, r = (i / nav.cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
      const j = rr * nav.cols + cc;
      if (seen[j] || nav.blocked[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

function nearReachable(nav: NavGrid, reach: Uint8Array, box: Rect, dist: number, room: Rect) {
  const [c0, r0] = nav.cellOf(box.x0 - dist - HERO.radius, box.z0 - dist - HERO.radius);
  const [c1, r1] = nav.cellOf(box.x1 + dist + HERO.radius, box.z1 + dist + HERO.radius);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (!reach[r * nav.cols + c]) continue;
      const [x, z] = nav.center(c, r);
      // From inside the same room: no searching through walls.
      if (inRect(room, x, z, -0.1) && rectDist(box, x, z) <= dist + HERO.radius - 0.05) return true;
    }
  return false;
}

/** Choose where the key is, and what everything else holds. */
function hideKey(R: Rand, plan: FloorPlan) {
  const searchable = plan.pieces.filter((p) => FURNITURE[p.kind].search !== 'none');
  const candidates = searchable.filter((p) => p.room !== plan.startRoom);
  if (!candidates.length) return;
  const keyP = R.pick(candidates);
  plan.keyPiece = keyP.id;
  keyP.find = { kind: 'key' };
  for (const p of searchable) {
    if (p === keyP) continue;
    const def = FURNITURE[p.kind];
    const roll = R.next();
    if (roll < 0.14 && def.critter) p.find = { kind: 'critter', critter: def.critter };
    else if (roll < 0.28) { const h = R.pick(HEALS); p.find = { kind: 'heal', ...h }; }
    else if (roll < 0.5) { const j = R.pick(JUNK); p.find = { kind: 'junk', ...j }; }
    else p.find = { kind: 'empty' };
  }
}
