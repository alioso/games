// Where a putt will go, roughly: a quick 2-D roll over the hole's slopes, slowing on the grass
// (more on sand) and bouncing off walls and posts. Used for the aiming line (which shows only the
// first part of it, less on harder holes) and by the tools that test the holes.
import { BALL, CUP, PHYS, SURFACE } from '../data/tuning';
import { PIPE_R, loopSpeed } from './physics';
import { type Shape, inWater, onSand, postBounce, slopeAt } from '../world/geometry';

const R = BALL.radius;
const ROLL = 5 / 7;

export interface Prediction {
  /** Points along the path [x, z], every few centimetres. */
  path: [number, number][];
  /** Would it drop? */
  holed: boolean;
  /** Where it stops (or drops). */
  end: [number, number];
  /** Ends up in a pond. */
  water?: boolean;
}

export function predict(shape: Shape, x: number, z: number, dx: number, dz: number, speed: number, maxLen = 60): Prediction {
  const l = Math.hypot(dx, dz) || 1;
  let vx = (dx / l) * speed, vz = (dz / l) * speed;
  const h = 1 / 120;
  const path: [number, number][] = [[x, z]];
  let len = 0, lastX = x, lastZ = z;
  const [cx, cz] = shape.hole.cup;
  const loops = shape.hole.loops ?? [];
  const loopSide: number[] = [];
  for (let i = 0; i < 120 * 20; i++) {
    // A rolling ball feels 5/7 of the slope (the rest goes into spinning it up).
    const [gx, gz] = slopeAt(shape, x, z);
    vx += gx * PHYS.gravity * ROLL * h;
    vz += gz * PHYS.gravity * ROLL * h;
    const sp = Math.hypot(vx, vz);
    const decel = onSand(shape, x, z) ? SURFACE.sand : SURFACE.green;
    if (sp > 0) {
      const k = Math.max(0, sp - decel * h) / sp;
      vx *= k; vz *= k;
    }
    let nx = x + vx * h, nz = z + vz * h;
    // Walls: if the ball would end up touching one, bounce off it.
    for (const w of shape.wallsNear(nx, nz)) {
      const [ax, az] = w.a, [bx, bz] = w.b;
      const ex = bx - ax, ez = bz - az, el2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, ((nx - ax) * ex + (nz - az) * ez) / el2));
      const px = ax + ex * t, pz = az + ez * t;
      const ddx = nx - px, ddz = nz - pz, d = Math.hypot(ddx, ddz);
      // Only from the inside, moving into it.
      const side = (nx - ax) * w.n[0] + (nz - az) * w.n[1];
      if (d < R && side > -R) {
        const n0 = d > 1e-6 ? ddx / d : w.n[0], n1 = d > 1e-6 ? ddz / d : w.n[1];
        const vn = vx * n0 + vz * n1;
        if (vn < 0) {
          vx -= (1 + BALL.wallBounce) * vn * n0;
          vz -= (1 + BALL.wallBounce) * vn * n1;
          vx *= 0.97; vz *= 0.97;
        }
        nx = px + n0 * R;
        nz = pz + n1 * R;
      }
    }
    for (const post of shape.posts) {
      const [px, pz, pr] = post;
      const ddx = nx - px, ddz = nz - pz, d = Math.hypot(ddx, ddz);
      if (d < pr + R) {
        const n0 = ddx / d, n1 = ddz / d, vn = vx * n0 + vz * n1, e = postBounce(post, BALL.wallBounce);
        if (vn < 0) { vx -= (1 + e) * vn * n0; vz -= (1 + e) * vn * n1; }
        nx = px + n0 * (pr + R);
        nz = pz + n1 * (pr + R);
      }
    }
    x = nx; z = nz;
    // In the pond: that's where it ends.
    if (inWater(shape, x, z, shape.heightAt(x, z))) { path.push([x, z]); return { path, holed: false, end: [x, z], water: true }; }
    // Into a pipe: out at the other end.
    for (const pipe of shape.hole.pipes ?? []) {
      if (Math.hypot(x - pipe.from[0], z - pipe.from[1]) < PIPE_R) {
        const sp = Math.max(1.4, Math.hypot(vx, vz) * 0.85);
        const ex = Math.sin(pipe.exit), ez = -Math.cos(pipe.exit);
        x = pipe.to[0] + ex * (PIPE_R + R + 0.03); z = pipe.to[1] + ez * (PIPE_R + R + 0.03);
        vx = ex * sp; vz = ez * sp;
        path.push([NaN, NaN], [x, z]);
        lastX = x; lastZ = z;
      }
    }
    // A loop: right round and out the far side if it's quick enough, otherwise back it comes.
    for (let k = 0; k < loops.length; k++) {
      const lp = loops[k], ldx = Math.sin(lp.angle), ldz = -Math.cos(lp.angle);
      const s = (x - lp.at[0]) * ldx + (z - lp.at[1]) * ldz, lat = (x - lp.at[0]) * -ldz + (z - lp.at[1]) * ldx;
      const before = loopSide[k];
      loopSide[k] = s;
      const v = Math.hypot(vx, vz);
      if (before !== undefined && before < 0 && s >= 0 && Math.abs(lat) < 0.4 && vx * ldx + vz * ldz > 0.2) {
        const round = Math.PI * 2 * (lp.radius - R);
        if (v >= loopSpeed(lp.radius)) {
          const out = Math.sqrt(Math.max(0.09, v * v - 2 * SURFACE.green * round - 0.2));
          const sh = lp.shift ?? 0.3;
          x = lp.at[0] + ldx * 0.05 - ldz * sh; z = lp.at[1] + ldz * 0.05 + ldx * sh;
          vx = ldx * out; vz = ldz * out;
          path.push([NaN, NaN], [x, z]);
        } else {
          x = lp.at[0] - ldx * 0.06; z = lp.at[1] - ldz * 0.06;
          vx = -ldx * Math.max(0.3, v * 0.7); vz = -ldz * Math.max(0.3, v * 0.7);
          loopSide.length = 0;
        }
        lastX = x; lastZ = z;
      }
    }
    const s2 = Math.hypot(vx, vz);
    // Dropping in the cup?
    const dc = Math.hypot(x - cx, z - cz);
    if (dc < CUP.radius) {
      const edge = dc / CUP.radius;
      if (s2 < CUP.capture * Math.sqrt(Math.max(0, 1 - edge * edge)) + 0.35) { path.push([cx, cz]); return { path, holed: true, end: [cx, cz] }; }
    }
    if (Math.hypot(x - lastX, z - lastZ) > 0.05) {
      len += Math.hypot(x - lastX, z - lastZ);
      path.push([x, z]);
      lastX = x; lastZ = z;
      if (len > maxLen) break;
    }
    const [sx, sz] = slopeAt(shape, x, z);
    if (s2 < PHYS.stopSpeed && ROLL * Math.hypot(sx, sz) * PHYS.gravity < decel * 1.15) break;
  }
  path.push([x, z]);
  return { path, holed: false, end: [x, z] };
}
