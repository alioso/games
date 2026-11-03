// Springy joints: each frame a pose says where every joint *wants* to be, and springs pull the
// joints there. Poses blend into each other, motion follows through and overshoots a touch, and
// floppy bits (heads, ears, tails) can be given softer springs so they lag behind.
import * as THREE from 'three';

const CH = 6; // rx ry rz px py pz

interface Joint {
  o: THREE.Object3D;
  rest: Float32Array;
  target: Float32Array;
  cur: Float32Array;
  vel: Float32Array;
  /** Stiffness (natural frequency, rad/s) and damping ratio for this joint. */
  omega: number;
  zeta: number;
}

export class Springs {
  private joints = new Map<string, Joint>();
  private first = true;

  /** Register a joint; its current rotation/position becomes its rest pose. */
  add(name: string, o: THREE.Object3D, omega = 22, zeta = 0.62) {
    const rest = new Float32Array([o.rotation.x, o.rotation.y, o.rotation.z, o.position.x, o.position.y, o.position.z]);
    this.joints.set(name, { o, rest, target: rest.slice(), cur: rest.slice(), vel: new Float32Array(CH), omega, zeta });
    return o;
  }

  /** Start a frame: every joint goes back to wanting its rest pose. */
  begin() {
    for (const j of this.joints.values()) j.target.set(j.rest);
  }

  /** Rotation target, relative to rest (undefined leaves an axis alone). */
  rot(name: string, x?: number, y?: number, z?: number) {
    const j = this.joints.get(name)!;
    if (x !== undefined) j.target[0] = j.rest[0] + x;
    if (y !== undefined) j.target[1] = j.rest[1] + y;
    if (z !== undefined) j.target[2] = j.rest[2] + z;
  }

  /** Absolute rotation target (undefined leaves an axis at rest). */
  set(name: string, x?: number, y?: number, z?: number) {
    const j = this.joints.get(name)!;
    if (x !== undefined) j.target[0] = x;
    if (y !== undefined) j.target[1] = y;
    if (z !== undefined) j.target[2] = z;
  }

  /** Add to the rotation target (for layering: walk + attack + lean). */
  addRot(name: string, x = 0, y = 0, z = 0) {
    const j = this.joints.get(name)!;
    j.target[0] += x;
    j.target[1] += y;
    j.target[2] += z;
  }

  /** Position offset target, relative to rest. */
  pos(name: string, x?: number, y?: number, z?: number) {
    const j = this.joints.get(name)!;
    if (x !== undefined) j.target[3] = j.rest[3] + x;
    if (y !== undefined) j.target[4] = j.rest[4] + y;
    if (z !== undefined) j.target[5] = j.rest[5] + z;
  }

  /** Move every joint toward its target. `snap` multiplies stiffness (attacks want snappier joints). */
  step(dt: number, snap = 1) {
    // Small fixed sub-steps keep stiff springs stable.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (const j of this.joints.values()) {
      if (this.first) { j.cur.set(j.target); j.vel.fill(0); }
      const w = j.omega * snap, k = w * w, c = 2 * j.zeta * w;
      for (let s = 0; s < n; s++)
        for (let i = 0; i < CH; i++) {
          const a = k * (j.target[i] - j.cur[i]) - c * j.vel[i];
          j.vel[i] += a * h;
          j.cur[i] += j.vel[i] * h;
        }
      j.o.rotation.set(j.cur[0], j.cur[1], j.cur[2]);
      j.o.position.set(j.cur[3], j.cur[4], j.cur[5]);
    }
    this.first = false;
  }

  /** Give a joint a sudden shove (a hit, a landing): it wobbles back by itself. */
  kick(name: string, rx = 0, ry = 0, rz = 0, py = 0) {
    const j = this.joints.get(name);
    if (!j) return;
    j.vel[0] += rx;
    j.vel[1] += ry;
    j.vel[2] += rz;
    j.vel[4] += py;
  }
}
