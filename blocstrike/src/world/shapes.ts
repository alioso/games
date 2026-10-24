// Shapes used to describe arenas: land outlines, ponds, rivers, lava pools.
// Everything is on the ground plane (x, z).

export type Shape =
  /** Wobbly ellipse. */
  | { type: 'blob'; x: number; z: number; rx: number; rz: number; seed: number; wobble?: number }
  /** A band along a line through `points` (rivers, lava streams). */
  | { type: 'path'; points: [number, number][]; width: number; seed: number }
  | { type: 'rect'; x: number; z: number; hw: number; hd: number };

export type Pt = [number, number];

/** Blob radius multiplier at an angle (1 = plain ellipse). */
export function blobEdge(s: { seed: number; wobble?: number }, angle: number) {
  const w = s.wobble ?? 1;
  return 1 + w * (0.07 * Math.sin(3 * angle + s.seed) + 0.045 * Math.sin(5 * angle + s.seed * 2.3));
}

/** Distance from p to the segment a→b, and how far along it (0..1). */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return [Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t];
}

/** Closest distance from p to a path's centre line, and the distance along the path there. */
export function pathDistance(points: Pt[], px: number, pz: number) {
  let best = Infinity, along = 0, acc = 0, bestAlong = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const [d, t] = segDist(px, pz, ax, az, bx, bz);
    const len = Math.hypot(bx - ax, bz - az);
    if (d < best) { best = d; bestAlong = acc + t * len; }
    acc += len;
  }
  along = bestAlong;
  return { d: best, along };
}

/**
 * How deep inside a shape a point is, in world units: > 0 inside, < 0 outside.
 * (Approximate for blobs, which is fine for gameplay margins.)
 */
export function depthIn(s: Shape, x: number, z: number): number {
  switch (s.type) {
    case 'rect':
      return Math.min(s.hw - Math.abs(x - s.x), s.hd - Math.abs(z - s.z));
    case 'blob': {
      const dx = (x - s.x) / s.rx, dz = (z - s.z) / s.rz;
      const k = Math.hypot(dx, dz) / blobEdge(s, Math.atan2(dz, dx));
      return (1 - k) * Math.min(s.rx, s.rz);
    }
    case 'path': {
      const { d, along } = pathDistance(s.points, x, z);
      const half = (s.width / 2) * (1 + 0.15 * Math.sin(along * 0.9 + s.seed) + 0.08 * Math.sin(along * 2.3 + s.seed * 3));
      return half - d;
    }
  }
}

/** Outline of a shape as a polygon (counter-clockwise when viewed from above), for drawing and walls. */
export function outline(s: Shape, segments = 160): Pt[] {
  switch (s.type) {
    case 'rect': {
      const pts: Pt[] = [];
      const corners: Pt[] = [[s.x - s.hw, s.z - s.hd], [s.x + s.hw, s.z - s.hd], [s.x + s.hw, s.z + s.hd], [s.x - s.hw, s.z + s.hd]];
      // Subdivide edges so decorations can be spaced along them.
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1);
        for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      return pts;
    }
    case 'blob':
      return Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * Math.PI * 2;
        const k = blobEdge(s, a);
        return [s.x + Math.cos(a) * s.rx * k, s.z + Math.sin(a) * s.rz * k] as Pt;
      });
    case 'path':
      return []; // paths are only drawn through the liquid mask
  }
}

export function pointInPolygon(poly: Pt[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Nearest point on a polygon's edges to p. */
export function nearestOnPolygon(poly: Pt[], px: number, pz: number) {
  let best = Infinity, bx = px, bz = pz;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [cx, cz] = poly[i];
    const dx = cx - ax, dz = cz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    const qx = ax + dx * t, qz = az + dz * t;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best) { best = d; bx = qx; bz = qz; }
  }
  return { x: bx, z: bz, d: best };
}

/** First t in [0,1] where segment a→b crosses a polygon edge, or null. */
export function segmentPolygon(poly: Pt[], ax: number, az: number, bx: number, bz: number): number | null {
  let best: number | null = null;
  const rx = bx - ax, rz = bz - az;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [px, pz] = poly[j], [qx, qz] = poly[i];
    const sx = qx - px, sz = qz - pz;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((px - ax) * sz - (pz - az) * sx) / den;
    const u = ((px - ax) * rz - (pz - az) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

/** An oriented box on the ground: centre, half-length along `angle`, half-thickness across it. */
export interface Box {
  x: number;
  z: number;
  hl: number;
  ht: number;
  angle: number;
}

/** Point in box-local coordinates (u along the length, v across). */
export function toBox(b: Box, x: number, z: number): [number, number] {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const dx = x - b.x, dz = z - b.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}

export function fromBox(b: Box, u: number, v: number): [number, number] {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  return [b.x + u * c - v * s, b.z + u * s + v * c];
}

export function inBox(b: Box, x: number, z: number, pad = 0) {
  const [u, v] = toBox(b, x, z);
  return Math.abs(u) <= b.hl + pad && Math.abs(v) <= b.ht + pad;
}

/** Push a circle out of a box. Returns the corrected centre and outward normal, or null if not touching. */
export function circleOutOfBox(b: Box, x: number, z: number, r: number) {
  const [u, v] = toBox(b, x, z);
  const out = (lu: number, lv: number, nu: number, nv: number) => {
    const [wx, wz] = fromBox(b, lu, lv);
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    return { x: wx, z: wz, nx: nu * c - nv * s, nz: nu * s + nv * c };
  };
  if (Math.abs(u) <= b.hl && Math.abs(v) <= b.ht) {
    // Centre inside the box: push out through the nearest side.
    const su = Math.sign(u) || 1, sv = Math.sign(v) || 1;
    return b.hl - Math.abs(u) < b.ht - Math.abs(v)
      ? out(su * (b.hl + r), v, su, 0)
      : out(u, sv * (b.ht + r), 0, sv);
  }
  const cu = Math.max(-b.hl, Math.min(b.hl, u)), cv = Math.max(-b.ht, Math.min(b.ht, v));
  const du = u - cu, dv = v - cv, d = Math.hypot(du, dv);
  if (d >= r) return null;
  return out(cu + (du / d) * r, cv + (dv / d) * r, du / d, dv / d);
}

/** First t in [0,1] where segment a→b enters a (padded) box, or null. Slab method. */
export function segmentBox(b: Box, ax: number, az: number, bx: number, bz: number, pad = 0): number | null {
  const [u0, v0] = toBox(b, ax, az);
  const [u1, v1] = toBox(b, bx, bz);
  let tmin = 0, tmax = 1;
  for (const [p0, p1, h] of [[u0, u1, b.hl + pad], [v0, v1, b.ht + pad]]) {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p0) > h) return null;
      continue;
    }
    let t1 = (-h - p0) / d, t2 = (h - p0) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
