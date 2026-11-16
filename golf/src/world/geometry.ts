// A hole's shape, worked out once and shared by the physics and the drawing (so the ball rolls on
// exactly the ground you see): the playing surface as a triangle mesh following the hole's
// heights, the wall segments round its edge and round any islands, and the posts.
import type { HoleDef, P2, Post } from '../data/holes';

export interface WallSeg {
  /** Ends of the wall's inner face (the side the ball hits), and which way the inside is. */
  a: P2;
  b: P2;
  /** Unit normal pointing into the playing area. */
  n: P2;
}

export interface Pond {
  poly: P2[];
  /** The water's surface height. */
  level: number;
}

export interface Shape {
  hole: HoleDef;
  ponds: Pond[];
  heightAt: (x: number, z: number) => number;
  surface: { positions: Float32Array; indices: Uint32Array; uvs: Float32Array };
  walls: WallSeg[];
  posts: Post[];
  /** Bounding box of the playing area. */
  min: P2;
  max: P2;
  /** The walls near a point (a grid of 1 m cells, each listing the walls within reach of it). */
  wallsNear: (x: number, z: number) => WallSeg[];
}

/** How bouncy a post is: mushrooms spring the ball back faster than it came. */
export function postBounce(p: Post, wall: number) {
  return p[3] === 'mushroom' ? 1.12 : wall;
}

const CELL = 0.2;

export function insidePoly(x: number, z: number, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed area (positive: counter-clockwise when x is right and z is down the screen... we only need the sign). */
function area(poly: P2[]) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return s / 2;
}

/** Distance from a point to a segment. */
export function segDist(x: number, z: number, a: P2, b: P2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** Walls along a polygon, each with its normal pointing into the playing area. */
function wallsOf(poly: P2[], island: boolean): WallSeg[] {
  // For the outline the inside is the polygon's interior; for an island it's the outside.
  const ccw = area(poly) > 0;
  const out: WallSeg[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    // Left-hand normal of a→b; it points inside a counter-clockwise polygon.
    let n: P2 = [-dz / l, dx / l];
    if (!ccw) n = [-n[0], -n[1]];
    if (island) n = [-n[0], -n[1]];
    out.push({ a, b, n });
  }
  return out;
}

/** How far a point is from a polygon's edge. */
export function depthInside(x: number, z: number, poly: P2[]) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

const POND_DEPTH = 0.32;

export function buildShape(hole: HoleDef): Shape {
  const base = hole.height ?? (() => 0);
  const water = hole.water ?? [];
  // Ponds: the ground slopes down under the water (a bank all round), so a ball rolls in.
  const heightAt = (x: number, z: number) => {
    let h = base(x, z);
    for (const w of water) {
      if (!insidePoly(x, z, w)) continue;
      const d = depthInside(x, z, w);
      // (The bank starts a little inside the edge, so a ball on a bridge right by the water stays up.)
      const u = Math.max(0, Math.min(1, (d - 0.06) / 0.3));
      h -= POND_DEPTH * u * u * (3 - 2 * u);
    }
    return h;
  };
  const ponds = water.map((poly) => ({ poly, level: Math.min(...poly.map(([x, z]) => base(x, z))) - 0.06 }));
  const walls = [...wallsOf(hole.outline, false), ...(hole.blocks ?? []).flatMap((b) => wallsOf(b, true))];
  const xs = hole.outline.map((p) => p[0]), zs = hole.outline.map((p) => p[1]);
  const min: P2 = [Math.min(...xs), Math.min(...zs)], max: P2 = [Math.max(...xs), Math.max(...zs)];

  // A grid over the hole; keep the triangles on the playing area (and a little under the walls).
  // Just enough to reach under the walls (every point inside is within a cell's reach), not out past them.
  const margin = 0.15;
  const x0 = min[0] - margin, z0 = min[1] - margin;
  const nx = Math.ceil((max[0] - min[0] + 2 * margin) / CELL) + 1, nz = Math.ceil((max[1] - min[1] + 2 * margin) / CELL) + 1;
  const near = (x: number, z: number) => {
    // On the surface: inside the outline (or just under its walls) and not inside an island.
    let onIt = insidePoly(x, z, hole.outline);
    if (!onIt) {
      for (let i = 0; i < hole.outline.length && !onIt; i++) {
        if (segDist(x, z, hole.outline[i], hole.outline[(i + 1) % hole.outline.length]) < margin) onIt = true;
      }
    }
    return onIt;
  };
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const idx = new Int32Array(nx * nz).fill(-1);
  const vert = (i: number, j: number) => {
    const k = j * nx + i;
    if (idx[k] < 0) {
      const x = x0 + i * CELL, z = z0 + j * CELL;
      idx[k] = positions.length / 3;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x, z);
    }
    return idx[k];
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const cx = x0 + (i + 0.5) * CELL, cz = z0 + (j + 0.5) * CELL;
      if (!near(cx, cz)) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      // Wound so the faces point up.
      indices.push(a, c, b, b, c, d);
    }
  }
  // Which walls are near each 1 m cell (anything within 0.6 m of it), for quick lookups.
  const G = 1, gx0 = Math.floor(min[0]) - 2, gz0 = Math.floor(min[1]) - 2;
  const gnx = Math.ceil(max[0] - gx0) + 3, gnz = Math.ceil(max[1] - gz0) + 3;
  const grid: WallSeg[][] = Array.from({ length: gnx * gnz }, () => []);
  for (const w of walls) {
    const lo = [Math.min(w.a[0], w.b[0]) - 0.6, Math.min(w.a[1], w.b[1]) - 0.6], hi = [Math.max(w.a[0], w.b[0]) + 0.6, Math.max(w.a[1], w.b[1]) + 0.6];
    for (let i = Math.floor((lo[0] - gx0) / G); i <= Math.floor((hi[0] - gx0) / G); i++) {
      for (let j = Math.floor((lo[1] - gz0) / G); j <= Math.floor((hi[1] - gz0) / G); j++) {
        if (i < 0 || j < 0 || i >= gnx || j >= gnz) continue;
        const cx = gx0 + (i + 0.5) * G, cz = gz0 + (j + 0.5) * G;
        if (segDist(cx, cz, w.a, w.b) < 0.6 + G * 0.71) grid[j * gnx + i].push(w);
      }
    }
  }
  const none: WallSeg[] = [];
  const wallsNear = (x: number, z: number) => {
    const i = Math.floor((x - gx0) / G), j = Math.floor((z - gz0) / G);
    return i < 0 || j < 0 || i >= gnx || j >= gnz ? none : grid[j * gnx + i];
  };
  return {
    hole,
    ponds,
    heightAt,
    surface: { positions: new Float32Array(positions), indices: new Uint32Array(indices), uvs: new Float32Array(uvs) },
    walls,
    posts: hole.posts ?? [],
    min,
    max,
    wallsNear,
  };
}

/** The ground's slope at a point: the downhill pull per unit gravity, [x, z]. */
export function slopeAt(shape: Shape, x: number, z: number): P2 {
  const e = 0.05, h = shape.heightAt;
  return [-(h(x + e, z) - h(x - e, z)) / (2 * e), -(h(x, z + e) - h(x, z - e)) / (2 * e)];
}

/** Is a ball here in the water: over a pond, more than a little way in from its edge (or sunk below its surface)? */
export function inWater(shape: Shape, x: number, z: number, ballY: number) {
  const p = pondAt(shape, x, z);
  if (!p) return false;
  // (A ball flying over it, off a ramp, isn't in it yet.)
  return ballY < p.level || (depthInside(x, z, p.poly) > 0.1 && ballY < p.level + 0.12);
}

/** Is this point over water (in which pond)? */
export function pondAt(shape: Shape, x: number, z: number) {
  return shape.ponds.find((p) => insidePoly(x, z, p.poly)) ?? null;
}

/** Is this point on sand? */
export function onSand(shape: Shape, x: number, z: number) {
  return (shape.hole.sand ?? []).some((p) => insidePoly(x, z, p));
}

/** The nearest point on the hole's outline to (x, z), and how far it is. */
export function nearestEdge(shape: Shape, x: number, z: number): { d: number; p: P2 } {
  const o = shape.hole.outline;
  let d = Infinity, p: P2 = o[0];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const px = a[0] + dx * t, pz = a[1] + dz * t, e = Math.hypot(x - px, z - pz);
    if (e < d) { d = e; p = [px, pz]; }
  }
  return { d, p };
}
