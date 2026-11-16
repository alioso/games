// The holes. Each is drawn in metres on the ground (x across, z along; the tee is near z = 0 and
// the cup further down -z): the outline of the playing surface (walls go all round it), solid
// islands inside it, the tee and the cup, how the ground rises and falls, sand, ponds, bridges,
// pipes, and things that move. The countryside course climbs from a gentle start to a farmyard
// finale; every hole can be finished (tools/golf-play.mjs plays them all to check).

export type P2 = [number, number];

/** Something that moves and gets in the way. */
export type ObstacleDef =
  /** Arms spinning round a post at ground level (a scarecrow): arm reach, radians per second. */
  | { kind: 'spinner'; at: P2; reach: number; speed: number; arms?: number }
  /** A hay bale rolling back and forth: travel either side of `at` along `angle`, seconds per trip. */
  | { kind: 'slider'; at: P2; travel: number; period: number; angle?: number; phase?: number }
  /** Windmill sails turning across the way in (facing along `angle`): sail length, radians per second. */
  | { kind: 'windmill'; at: P2; reach: number; speed: number; angle?: number }
  /** A barn door swinging on a hinge between shut (along `angle`) and open: length, seconds per swing. */
  | { kind: 'gate'; at: P2; length: number; period: number; angle: number; swing: number; phase?: number };

/** A pipe: the ball goes in one end and pops out of the other, heading `exit` (radians, 0 = -z). */
export interface PipeDef {
  from: P2;
  to: P2;
  exit: number;
  /** A green pipe arching over (default), or a rabbit burrow (underground: just the holes). */
  style?: 'pipe' | 'burrow';
}

/**
 * A loop-the-loop standing on the lane: roll in at `at` heading `angle` (0 = -z) fast enough and the
 * ball goes right round and out the other side (shifted sideways a little); too slow and it runs back.
 */
export interface LoopDef {
  at: P2;
  angle: number;
  radius: number;
  /** Sideways shift from the way in to the way out (to the right of the travel), metres. */
  shift?: number;
}

/** Something drawn over the lane that the ball rolls under (a hollow log, a hedge arch, a bridge). */
export interface CoverDef {
  kind: 'log' | 'hedge' | 'bridge';
  a: P2;
  b: P2;
  width: number;
}

/** A round post: [x, z, radius], optionally what it is (a stump by default; mushrooms are bouncy). */
export type Post = [number, number, number] | [number, number, number, 'stump' | 'mushroom' | 'rock'];

/** Scenery on or by a hole (drawn, not played): a windmill or a barn round an obstacle. */
export type Prop =
  | { kind: 'windmill'; at: P2; angle: number }
  | { kind: 'barn'; at: P2; angle: number; width: number }
  | { kind: 'scarecrow'; at: P2 };

export interface HoleDef {
  name: string;
  par: number;
  /** The playing surface's edge, all the way round (walls are built along it). */
  outline: P2[];
  /** Solid blocks inside the surface (walls all round them too): islands, fences, buildings. */
  blocks?: P2[][];
  /** Round posts to bounce off. */
  posts?: Post[];
  tee: P2;
  cup: P2;
  /** Height of the surface at a point (metres). Flat if not given. */
  height?: (x: number, z: number) => number;
  /** Areas of sand (slows the ball right down). */
  sand?: P2[][];
  /** Ponds: the ground dips under the water; a ball that goes in costs a stroke. */
  water?: P2[][];
  /** Wooden planks painted on the surface (bridges over water). */
  planks?: P2[][];
  pipes?: PipeDef[];
  loops?: LoopDef[];
  covers?: CoverDef[];
  obstacles?: ObstacleDef[];
  /** What the walls are made of. */
  walls?: 'wood' | 'stone' | 'log';
  props?: Prop[];
  /** How far ahead the aiming line shows the ball's path (metres): long on early holes, short later. */
  preview: number;
}

// ---------- helpers for drawing holes ----------

const bump = (x: number, z: number, cx: number, cz: number, r: number, h: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
const smooth = (a: number, b: number, t: number) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/** A lane along a path (the outline round it, corners mitred): one width, or a width at each point. */
function lane(path: P2[], width: number | number[]): P2[] {
  const hwAt = (i: number) => (typeof width === 'number' ? width : width[i]) / 2;
  const off = (side: number) => path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    // Direction in and out of this point, and the mitred offset.
    const d1 = norm([p[0] - a[0], p[1] - a[1]], [b[0] - p[0], b[1] - p[1]]);
    const d2 = norm([b[0] - p[0], b[1] - p[1]], d1);
    const n1: P2 = [-d1[1], d1[0]], n2: P2 = [-d2[1], d2[0]];
    const nx = n1[0] + n2[0], nz = n1[1] + n2[1], nl = Math.hypot(nx, nz) || 1;
    const m: P2 = [nx / nl, nz / nl];
    const k = hwAt(i) / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] + m[0] * k * side, p[1] + m[1] * k * side] as P2;
  });
  return [...off(1), ...off(-1).reverse()];
}

/** A smooth curve through points (every component, so a width can ride along), sampled every `step` metres. */
function curve(pts: number[][], step = 0.3): number[][] {
  const cr = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const out: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) out.push(p1.map((_, c) => cr(p0[c], p1[c], p2[c], p3[c], k / n)));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A smoothly curving lane through [x, z, width] points. */
function curvy(pts: [number, number, number][]): P2[] {
  const c = curve(pts);
  return lane(c.map((p) => [p[0], p[1]] as P2), c.map((p) => p[2]));
}

/** A rectangle with rounded corners. */
function roundRect(x0: number, z0: number, x1: number, z1: number, r: number, n = 5): P2[] {
  const pts: P2[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  };
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)], [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  corner(xb - r, zb - r, 0);
  corner(xa + r, zb - r, Math.PI / 2);
  corner(xa + r, za + r, Math.PI);
  corner(xb - r, za + r, Math.PI * 1.5);
  return pts;
}

/** Part of an oval, from angle a0 to a1 (radians; 0 = +x, π/2 = +z). */
const arc = (cx: number, cz: number, rx: number, rz: number, a0: number, a1: number, n = 12): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz] as P2; });

function norm(v: P2, fallback: P2): P2 {
  const l = Math.hypot(v[0], v[1]);
  if (l < 1e-6) { const f = Math.hypot(fallback[0], fallback[1]) || 1; return [fallback[0] / f, fallback[1] / f]; }
  return [v[0] / l, v[1] / l];
}

/** A rectangle from (x0, z0) to (x1, z1). */
const rect = (x0: number, z0: number, x1: number, z1: number): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** A straight lane from the tee end (z = zStart) opening into a round green (centre cz, radius r). */
function laneIntoCircle(hw: number, zStart: number, cx: number, cz: number, r: number, n = 22): P2[] {
  // Where the lane's sides meet the circle (on its near side), then all the way round the far side.
  const meet = Math.sqrt(r * r - hw * hw);
  const a0 = Math.atan2(hw, meet), a1 = Math.PI * 2 - a0;
  const pts: P2[] = [[cx - hw, zStart], [cx + hw, zStart]];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return pts;
}

// ---------- the countryside ----------

/** Ponds either side of a plank bridge (x from -w to w), between z0 and z1, reaching out to xl and xr. */
function bridgePonds(w: number, z0: number, z1: number, xl: number, xr: number): P2[][] {
  const zc = (z0 + z1) / 2, rz = Math.abs(z1 - z0) / 2;
  return [arc(-w, zc, -w - xl, rz, -Math.PI / 2, -Math.PI * 1.5, 16), arc(w, zc, xr - w, rz, -Math.PI / 2, Math.PI / 2, 16)];
}

export const COUNTRYSIDE: HoleDef[] = [
  {
    // 1: a gentle start: an easy S down through the flowers.
    name: 'Daisy Lane', par: 2,
    outline: curvy([[0, 1.3, 2.6], [0, -2.5, 2.6], [1.4, -6, 2.6], [1.4, -9, 2.6], [0.2, -12.4, 2.6], [0.2, -14.2, 2.6]]),
    posts: [[2.3, -7.6, 0.2, 'rock']],
    tee: [0, 0], cup: [0.3, -12.4],
    height: (_x, z) => 0.7 + z * 0.022,
    preview: 14,
  },
  {
    // 2: straight through a hollow log, then round to the cup.
    name: 'Hollow Log', par: 2,
    outline: curvy([[0, 1.2, 2.4], [0, -2.4, 2.4], [0, -3.3, 1.0], [0, -6.5, 1.0], [0, -7.4, 2.4], [0.8, -10, 2.4], [1.2, -13, 2.4]]),
    covers: [{ kind: 'log', a: [0, -3.2], b: [0, -6.6], width: 1.3 }],
    tee: [0, 0], cup: [1.1, -11.7],
    height: (_x, z) => 0.5 + z * 0.01,
    preview: 13,
  },
  {
    // 3: up and over a grassy hill. Too soft and it rolls back to you.
    name: 'Pony Hill', par: 2,
    outline: curvy([[0, 1.2, 2.6], [0, -4, 2.6], [-0.8, -8, 2.6], [0, -11.6, 2.6], [0, -13.4, 2.6]]),
    walls: 'stone',
    tee: [0, 0], cup: [0, -11.8],
    height: (x, z) => 0.3 + 0.5 * smooth(-2.4, -5.2, z) * (1 - smooth(-6.6, -9.6, z)) - bump(x, z, 0, -11.8, 1.2, 0.06),
    preview: 11,
  },
  {
    // 4: toadstools! They spring the ball back: boing.
    name: 'Mushroom Patch', par: 2,
    outline: laneIntoCircle(1.2, 1.2, 0, -8.4, 3.6, 28),
    posts: [[-1.2, -6.5, 0.24, 'mushroom'], [1.2, -6.5, 0.24, 'mushroom'], [0, -8.2, 0.26, 'mushroom'], [-1.5, -9.7, 0.24, 'mushroom'], [1.5, -9.7, 0.24, 'mushroom']],
    tee: [0, 0], cup: [0, -11],
    height: (x, z) => 0.4 + z * 0.004 - bump(x, z, 0, -11, 1.6, 0.06),
    preview: 10,
  },
  {
    // 5: down the garden steps: three terraces, zig, then zag.
    name: 'Garden Steps', par: 3,
    outline: curvy([[0, 1.2, 2.6], [0, -3, 2.6], [3.2, -5.4, 2.6], [3.2, -8.4, 2.6], [0, -10.8, 2.6], [0, -14, 2.6]]),
    walls: 'stone',
    posts: [[1.6, -4.2, 0.16]],
    tee: [0, 0], cup: [0.3, -12.8],
    height: (_x, z) => 1.4 - 0.4 * smooth(-3.6, -4.8, z) - 0.4 * smooth(-9, -10.2, z) + z * 0.004,
    preview: 9,
  },
  {
    // 6: from the high tee down into the bowl: anything near enough runs down to the cup.
    name: 'The Bowl', par: 2,
    outline: laneIntoCircle(1.2, 1.2, 0, -9.4, 3.2, 26),
    tee: [0, 0], cup: [0, -9.4],
    height: (x, z) => {
      const d = Math.hypot(x, z + 9.4);
      return 0.95 - 0.45 * smooth(-1.5, -5.5, z) - 0.3 * Math.max(0, 1 - (d / 3.2) ** 2);
    },
    preview: 9,
  },
  {
    // 7: a hairpin. The bend is banked like a racetrack: ride it round.
    name: 'Hairpin', par: 3,
    outline: curvy([[0, 1.2, 2.3], [0, -6.6, 2.3], [0.4, -8.6, 2.3], [1.75, -9.6, 2.3], [3.1, -8.6, 2.3], [3.5, -6.6, 2.3], [3.5, -0.6, 2.3]]),
    tee: [0, 0], cup: [3.5, -1.8],
    height: (x, z) => {
      const r = Math.hypot(x - 1.75, Math.min(0, z + 6.8));
      return 0.5 + 0.38 * smooth(1.3, 2.9, r) * smooth(-5.6, -7.2, z) + (x > 2.4 ? (z + 6) * 0.006 : 0);
    },
    preview: 8,
  },
  {
    // 8: the duck pond. Straight over the plank bridge, or the long way round.
    name: 'Duck Pond', par: 3,
    outline: roundRect(-3.2, 1.2, 3.8, -14, 1.2),
    water: bridgePonds(0.32, -4.6, -9.6, -2.8, 2.5),
    planks: [[[-0.32, -4.4], [0.32, -4.4], [0.32, -9.8], [-0.32, -9.8]]],
    tee: [0, 0], cup: [0.6, -12.3],
    height: (_x, z) => 0.35 + z * 0.004,
    preview: 7,
  },
  {
    // 9: the loop-the-loop! Downhill at it, hit it hard enough and it goes right round.
    name: 'Loop the Loop', par: 3,
    outline: curvy([[0, 1.2, 2.2], [0, -2.4, 2.2], [0, -4.2, 0.82], [0, -5.6, 0.82], [0.15, -6.8, 1.4], [0.3, -8.6, 2.6], [0.3, -13.6, 2.6]]),
    loops: [{ at: [0, -5], angle: 0, radius: 0.42, shift: 0.3 }],
    tee: [0, 0], cup: [0.4, -11.6],
    height: (x, z) => 0.9 - 0.4 * smooth(-0.5, -4.6, z) + 0.3 * smooth(-6.5, -9.5, z) - bump(x, z, 0.4, -11.6, 1.4, 0.08) + 0.15 * smooth(-12.6, -13.5, z),
    preview: 7,
  },
  {
    // 10: the rabbits' warren. A hedge in the way: go round, or pick a burrow (one of them comes out
    // right by the cup... the other takes you back where you started).
    name: 'Rabbit Warren', par: 3,
    outline: roundRect(-3, 1.2, 3, -14, 1),
    blocks: [[[-1.4, -6.3], [3.2, -6.3], [3.2, -7.2], [-1.4, -7.2]]],
    pipes: [
      { from: [0.9, -4.4], to: [0.5, -10.4], exit: 0, style: 'burrow' },
      { from: [-0.9, -3.4], to: [2.1, -0.4], exit: Math.PI, style: 'burrow' },
    ],
    tee: [0, 0], cup: [1.2, -12.2],
    height: (_x, z) => 0.6 + z * 0.012,
    preview: 6,
  },
  {
    // 11: down to the creek, over a narrow bridge, and up the far side.
    name: 'Creek Crossing', par: 3,
    outline: roundRect(-1.7, 1.2, 1.7, -13, 0.7),
    walls: 'stone',
    water: [[[-1.7, -5.8], [-1.05, -5.8], [-1.05, -7.2], [-1.7, -7.2]], [[-0.45, -5.8], [0.5, -5.8], [0.5, -7.2], [-0.45, -7.2]], [[1.1, -5.8], [1.7, -5.8], [1.7, -7.2], [1.1, -7.2]]],
    planks: [[[-1.05, -5.6], [-0.45, -5.6], [-0.45, -7.4], [-1.05, -7.4]], [[0.5, -5.6], [1.1, -5.6], [1.1, -7.4], [0.5, -7.4]]],
    posts: [[1.05, -2.8, 0.2, 'rock'], [-1.1, -9.6, 0.2, 'rock']],
    tee: [0, 0], cup: [-0.3, -11.6],
    height: (_x, z) => 0.55 - 0.2 * smooth(-1, -5.6, z) + 0.15 * smooth(-7.4, -11, z),
    preview: 5,
  },
  {
    // 12: up the ramp and jump the stream, or the narrow path round the side under the hedge.
    name: 'Ramp Jump', par: 3,
    outline: rect(-1.7, 1.2, 1.7, -13),
    water: [rect(-1.7, -5.6, 0.85, -6.8)],
    covers: [{ kind: 'hedge', a: [1.28, -4.9], b: [1.28, -7.5], width: 0.86 }],
    tee: [-0.4, 0], cup: [-0.3, -11.4],
    height: (x, z) => {
      // A kicker: it gets steeper toward the lip, so the ball takes off.
      const u = Math.max(0, Math.min(1, (-2.5 - z) / 3));
      const ramp = x < 0.85 && z > -5.55 ? 0.3 * u * u : 0;
      const landing = z < -6.8 ? 0.12 * (1 - smooth(-6.8, -9, z)) : 0;
      // A bank before the far wall takes the sting out of a putt that's too hard.
      const backstop = 0.16 * smooth(-12, -12.9, z);
      return 0.2 + ramp + landing + backstop;
    },
    preview: 5,
  },
  {
    // 13: up the hill to the windmill. Time it between the sails and through the door.
    name: 'The Windmill', par: 3,
    outline: roundRect(-1.6, 1.2, 1.6, -13, 0.6),
    blocks: [rect(-1.6, -6.3, -0.32, -7.8), rect(0.32, -6.3, 1.6, -7.8)],
    obstacles: [{ kind: 'windmill', at: [0, -6.15], reach: 0.62, speed: 1.15 }],
    props: [{ kind: 'windmill', at: [0, -7.05], angle: 0 }],
    tee: [0, 0], cup: [0.5, -11.4],
    height: (_x, z) => 0.3 + 0.32 * smooth(-1.5, -5.4, z) - 0.25 * smooth(-8.2, -10.2, z),
    preview: 4,
  },
  {
    // 14: through the barn: the doors keep swinging shut.
    name: 'Barn Doors', par: 3,
    outline: curvy([[0, 1.2, 2.8], [0, -6, 2.8], [1.6, -8.6, 2.8], [3, -10.4, 2.8], [3, -14, 2.8]]),
    blocks: [rect(-1.45, -4.6, -0.75, -5.6), rect(0.75, -4.6, 1.45, -5.6)],
    obstacles: [
      { kind: 'gate', at: [-0.75, -4.6], length: 0.74, period: 3.6, angle: Math.PI / 2, swing: -Math.PI / 2 },
      { kind: 'gate', at: [0.75, -4.6], length: 0.74, period: 3.6, angle: -Math.PI / 2, swing: Math.PI / 2 },
    ],
    props: [{ kind: 'barn', at: [0, -5.1], angle: 0, width: 2.9 }],
    tee: [0, 0], cup: [3.1, -12.6],
    height: (x, z) => 0.35 + z * 0.008 + x * 0.004,
    preview: 4,
  },
  {
    // 15: the cup's on top of the haystack hill (in a little dip). Past the rolling bale, then up:
    // too soft rolls back down, too hard flies off the far side.
    name: 'Haystack Hill', par: 3,
    outline: laneIntoCircle(1.2, 1.2, 0, -9.6, 3.4, 28),
    walls: 'stone',
    obstacles: [{ kind: 'slider', at: [0, -3.6], travel: 0.65, period: 3.2, angle: Math.PI / 2 }],
    tee: [0, 0], cup: [0, -9.6],
    height: (x, z) => {
      const d = Math.hypot(x, z + 9.6);
      return 0.35 + 0.4 * Math.max(0, 1 - (d / 2.8) ** 2) - 0.11 * Math.max(0, 1 - d / 0.6);
    },
    preview: 3.5,
  },
  {
    // 16: the scarecrow spins its arms in the middle of the green; mushrooms round the back.
    name: 'Scarecrow Spin', par: 3,
    outline: laneIntoCircle(1.1, 1.2, 0, -9, 3.4, 26),
    obstacles: [{ kind: 'spinner', at: [0, -8.6], reach: 1.6, speed: 0.95, arms: 2 }],
    props: [{ kind: 'scarecrow', at: [0, -8.6] }],
    posts: [[-2.5, -10.9, 0.22, 'mushroom'], [2.5, -10.9, 0.22, 'mushroom'], [-1.3, -12.1, 0.2, 'mushroom'], [1.3, -12.1, 0.2, 'mushroom']],
    tee: [0, 0], cup: [0.2, -11.2],
    height: (x, z) => 0.3 + z * 0.006 - 0.04 * Math.max(0, 1 - Math.hypot(x - 0.2, z + 11.2) / 1.6),
    preview: 3.5,
  },
  {
    // 17: the chicken run: a long switchback down the hillside, two drops, sand on the bends and a
    // bale rolling across.
    name: 'Chicken Run', par: 4,
    outline: curvy([[0, 1.2, 2.6], [0, -4.5, 2.6], [4, -7.5, 2.6], [4, -12, 2.6], [0, -15, 2.6], [0, -19.6, 2.6]]),
    sand: [arc(-0.9, -6.2, 0.6, 0.9, 0, Math.PI * 2, 12), arc(5.1, -12.8, 0.55, 1.0, 0, Math.PI * 2, 12)],
    obstacles: [{ kind: 'slider', at: [4, -10], travel: 0.8, period: 3, angle: Math.PI / 2 }],
    tee: [0, 0], cup: [0, -18.4],
    height: (_x, z) => 1.5 - 0.42 * smooth(-4.4, -6.2, z) - 0.42 * smooth(-12.4, -14.2, z) + z * 0.01,
    preview: 3,
  },
  {
    // 18: the farmyard finale: over the duck pond bridge, round the loop, and up the ramp to the
    // round green on top (mind the mushrooms).
    name: 'The Farmyard', par: 4,
    outline: laneIntoCircle(1.4, 1.2, 0, -17, 3.2, 28),
    water: bridgePonds(0.36, -3.2, -5.6, -1.4, 1.4),
    planks: [[[-0.36, -3.0], [0.36, -3.0], [0.36, -5.8], [-0.36, -5.8]]],
    blocks: [[[-1.4, -6.8], [-0.41, -8.0], [-0.41, -9.0], [-1.4, -9.0]], [[1.4, -6.8], [0.75, -8.0], [0.75, -9.0], [1.4, -9.0]]],
    loops: [{ at: [0, -8.3], angle: 0, radius: 0.4, shift: 0.3 }],
    posts: [[-1.2, -16.2, 0.22, 'mushroom'], [1.2, -16.2, 0.22, 'mushroom']],
    tee: [0, 0], cup: [0, -17.8],
    height: (x, z) => {
      const up = 0.42 * smooth(-10.4, -13.4, z);
      const d = Math.hypot(x, z + 17);
      return 0.3 + up - 0.06 * Math.max(0, 1 - (d / 3) ** 2) * smooth(-13.6, -14.2, z);
    },
    preview: 3,
  },
];
