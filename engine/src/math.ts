// Small 2D helpers. Games here live on the ground plane, so 2D points use x and z.

export interface V2 {
  x: number;
  z: number;
}

export const v2 = (x = 0, z = 0): V2 => ({ x, z });

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const len = (x: number, z: number) => Math.sqrt(x * x + z * z);
export const dist = (a: V2, b: V2) => len(a.x - b.x, a.z - b.z);

/** Frame-rate independent smoothing towards a target. */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** Yaw that turns a model facing +z towards direction (x, z). */
export const yawOf = (x: number, z: number) => Math.atan2(x, z);

export function normalize(p: V2): V2 {
  const l = len(p.x, p.z);
  return l > 1e-6 ? { x: p.x / l, z: p.z / l } : { x: 0, z: 0 };
}

/** First t in [0,1] where segment a→b enters circle (c, r); null if it never does. */
export function segmentCircle(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, r: number,
): number | null {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** Deterministic random numbers, so decorations land in the same place every match. */
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a: number, b: number) => a + (b - a) * next(),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
  };
}

export const rand = (a: number, b: number) => a + (b - a) * Math.random();
export const chance = (p: number) => Math.random() < p;
