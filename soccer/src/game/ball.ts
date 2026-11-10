// The ball: gravity, bounces, rolling friction on grass, air drag, curl from spin, posts, crossbar
// and nets. It reports what happened (bounces, post hits, goals, going out) so the match can react.
import * as THREE from 'three';
import { BALL, PITCH } from '../data/tuning';
import { buildBall } from '../entities/playerModel';
import type { Player } from './player';

const R = BALL.radius;
const L = PITCH.length / 2, W = PITCH.width / 2, GW = PITCH.goalWidth / 2, GH = PITCH.goalHeight, GD = PITCH.goalDepth, POST = PITCH.post;

export type BallEvent =
  | { kind: 'bounce'; speed: number }
  | { kind: 'post'; speed: number }
  | { kind: 'net'; end: number; speed: number }
  | { kind: 'goal'; end: number }
  | { kind: 'out'; x: number; z: number; side: 'touch' | 'goal'; end: number };

/**
 * One small step of the ball in flight or rolling (no posts or nets): gravity, air drag, spin
 * curling it (strongly in the air, gently along the grass), bouncing and rolling friction.
 * Returns the impact speed if it bounced. Shared by the ball itself and by kicks, which simulate
 * their own path to aim a curling ball so it still ends up where it was meant to.
 */
export function flight(p: THREE.Vector3, v: THREE.Vector3, spin: THREE.Vector3, h: number) {
  const airborne = p.y > R + 0.005 || v.y > 0.01;
  if (airborne) v.y -= BALL.gravity * h;
  const s = v.length();
  if (s > 0.01) v.multiplyScalar(Math.max(0, 1 - BALL.drag * s * h));
  if (spin.lengthSq() > 0.01) {
    const k = BALL.magnus * h * (airborne ? 1 : BALL.rollCurl);
    const sx = spin.x, sy = spin.y, sz = spin.z;
    v.x += (sy * v.z - sz * v.y) * k;
    v.y += (sz * v.x - sx * v.z) * k * (airborne ? 1 : 0);
    v.z += (sx * v.y - sy * v.x) * k;
  }
  spin.multiplyScalar(Math.exp(-h * (airborne ? 0.4 : BALL.rollSpinDecay)));
  p.addScaledVector(v, h);
  let impact = 0;
  if (p.y < R) {
    p.y = R;
    if (v.y < -1.2) {
      impact = -v.y;
      v.y = impact * BALL.bounce;
      v.x *= BALL.bounceGrip;
      v.z *= BALL.bounceGrip;
    } else v.y = 0;
  }
  // Rolling on the grass slows it.
  if (p.y <= R + 0.005 && v.y === 0) {
    const gs = Math.hypot(v.x, v.z);
    if (gs > 0) {
      const k = Math.max(0, gs - BALL.roll * h) / gs;
      v.x *= k;
      v.z *= k;
    }
  }
  return impact;
}

export class Ball {
  readonly pos = new THREE.Vector3(0, R, 0);
  readonly vel = new THREE.Vector3();
  /** Spin (radians per second, as an axis): curls the ball in the air. */
  readonly spin = new THREE.Vector3();
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  /** A streak behind a hard-hit ball (fading copies of where it just was). */
  readonly trail = new THREE.Group();
  private trailPts: THREE.Vector3[] = [];
  /** The player dribbling it (at their feet). */
  owner: Player | null = null;
  /** A goalkeeper (or thrower) holding it in their hands. */
  holder: Player | null = null;
  /** Last player to touch it (for throw-ins, corners, goal kicks). */
  lastTouch: Player | null = null;
  /** Set once it's crossed a line, until it's put back into play. */
  dead = false;
  /** Inside a goal (so the nets hold it). */
  inGoal = 0;
  private events: BallEvent[] = [];

  constructor() {
    this.mesh = buildBall(R);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * (0.9 - i * 0.09), 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      this.trail.add(m);
      this.trailPts.push(new THREE.Vector3());
    }
  }

  get onGround() {
    return this.pos.y <= R + 0.02 && Math.abs(this.vel.y) < 0.6;
  }

  get speed() {
    return this.vel.length();
  }

  /** Put it somewhere, still. */
  place(x: number, z: number, y = R) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.owner = null;
    this.holder = null;
    this.dead = false;
    this.inGoal = 0;
  }

  /** Kick it: a new velocity (and spin), and who touched it last. */
  kick(by: Player, vel: THREE.Vector3, spin?: THREE.Vector3) {
    this.vel.copy(vel);
    this.spin.copy(spin ?? new THREE.Vector3());
    this.owner = null;
    this.holder = null;
    this.lastTouch = by;
    if (this.pos.y < R) this.pos.y = R;
  }

  /** Advance the physics; returns what happened. */
  step(dt: number): BallEvent[] {
    this.events.length = 0;
    if (this.holder) return this.events;
    const n = 4;
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h);
    return this.events;
  }

  private sub(h: number) {
    const v = this.vel, p = this.pos;
    const prevX = p.x, prevZ = p.z;
    const impact = flight(p, v, this.spin, h);
    if (impact > 0) this.events.push({ kind: 'bounce', speed: impact });

    for (const end of [-1, 1]) this.frame(end, h);

    // Goal, or out of play.
    if (!this.dead) {
      if (Math.abs(p.x) > L + R && Math.abs(p.z) < GW && p.y < GH && Math.abs(prevX) <= L + R + 0.3) {
        this.dead = true;
        this.inGoal = Math.sign(p.x);
        this.events.push({ kind: 'goal', end: Math.sign(p.x) });
      } else if (Math.abs(p.z) > W + R) {
        this.dead = true;
        this.events.push({ kind: 'out', x: p.x, z: Math.sign(p.z) * W, side: 'touch', end: Math.sign(p.x) });
      } else if (Math.abs(p.x) > L + R) {
        this.dead = true;
        this.events.push({ kind: 'out', x: Math.sign(p.x) * L, z: p.z, side: 'goal', end: Math.sign(p.x) });
      }
    }
    // Never wander off into the stands.
    if (Math.abs(p.x) > L + 6) { p.x = Math.sign(p.x) * (L + 6); v.x *= -0.3; }
    if (Math.abs(p.z) > W + 4) { p.z = Math.sign(p.z) * (W + 4); v.z *= -0.3; }
    void prevZ;
  }

  /** Posts, crossbar and net of the goal at one end. */
  private frame(end: number, h: number) {
    const p = this.pos, v = this.vel;
    const gx = end * L;
    // Posts: vertical cylinders.
    if (p.y < GH + POST) {
      for (const pz of [-GW, GW]) {
        const dx = p.x - gx, dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < R + POST && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= 1.65 * vn * nx;
            v.z -= 1.65 * vn * nz;
            this.events.push({ kind: 'post', speed: -vn });
          }
          p.x = gx + nx * (R + POST);
          p.z = pz + nz * (R + POST);
        }
      }
    }
    // Crossbar: horizontal cylinder along z.
    if (Math.abs(p.z) < GW) {
      const dx = p.x - gx, dy = p.y - GH;
      const d = Math.hypot(dx, dy);
      if (d < R + POST && d > 1e-4) {
        const nx = dx / d, ny = dy / d;
        const vn = v.x * nx + v.y * ny;
        if (vn < 0) {
          v.x -= 1.65 * vn * nx;
          v.y -= 1.65 * vn * ny;
          this.events.push({ kind: 'post', speed: -vn });
        }
        p.x = gx + nx * (R + POST);
        p.y = GH + ny * (R + POST);
      }
    }
    // The net: a box. Once inside, the back, sides and roof hold the ball.
    const behind = (p.x - gx) * end;
    if (behind > 0 && behind < GD + 0.5) {
      const inside = Math.abs(p.z) < GW && p.y < GH + 0.05;
      if (this.inGoal === end || inside) {
        let hit = 0;
        if (behind > GD - R) { p.x = gx + end * (GD - R); hit = Math.max(hit, Math.abs(v.x)); v.x *= -0.05; v.y *= 0.5; v.z *= 0.6; }
        if (Math.abs(p.z) > GW - R) { p.z = Math.sign(p.z) * (GW - R); hit = Math.max(hit, Math.abs(v.z)); v.z *= -0.15; v.x *= 0.7; }
        if (p.y > GH - R) { p.y = GH - R; hit = Math.max(hit, Math.abs(v.y)); v.y = -Math.abs(v.y) * 0.1; }
        if (hit > 2) this.events.push({ kind: 'net', end, speed: hit });
        // The net swallows the ball's pace.
        if (this.inGoal === end) { v.x *= Math.exp(-h * 4); v.z *= Math.exp(-h * 4); }
      } else if (Math.abs(Math.abs(p.z) - GW) < R && p.y < GH) {
        // Hitting the side netting from outside.
        const s = Math.sign(p.z);
        p.z = s * (GW + R);
        if (v.z * s < 0) { v.z *= -0.2; v.x *= 0.5; this.events.push({ kind: 'net', end, speed: 3 }); }
      } else if (Math.abs(p.z) < GW && p.y >= GH && p.y < GH + R + 0.01 && v.y <= 0) {
        // On the roof of the net: it sags, and the ball rolls off the back.
        p.y = GH + R;
        v.y = Math.abs(v.y) * 0.2;
        v.x = v.x * 0.8 + end * 4 * h;
      }
    }
  }

  /** Where it'll be in t seconds, if nobody touches it (rough, for planning runs). */
  predict(t: number, out = new THREE.Vector3()) {
    const p = this.pos, v = this.vel;
    if (this.holder || this.owner) return out.copy(p);
    // Flight time left (if airborne), then rolling.
    let x = p.x, y = p.y, z = p.z, vx = v.x, vy = v.y, vz = v.z;
    let left = t;
    const drag = Math.max(0.7, 1 - BALL.drag * Math.hypot(vx, vy, vz) * 0.6);
    if (y > R + 0.01 || vy > 0.01) {
      // Time until it lands.
      const a = 0.5 * BALL.gravity, b = vy, c = y - R;
      const land = (b + Math.sqrt(b * b + 4 * a * c)) / (2 * a);
      const ft = Math.min(left, land);
      x += vx * ft * drag;
      z += vz * ft * drag;
      y = Math.max(R, y + vy * ft - a * ft * ft);
      left -= ft;
      if (left <= 0) return out.set(x, y, z);
      vx *= BALL.bounceGrip;
      vz *= BALL.bounceGrip;
    }
    const gs = Math.hypot(vx, vz);
    if (gs < 0.01) return out.set(x, R, z);
    const stop = gs / BALL.roll;
    const tt = Math.min(left, stop);
    const d = gs * tt - 0.5 * BALL.roll * tt * tt;
    return out.set(x + (vx / gs) * d, R, z + (vz / gs) * d);
  }

  /** Move the mesh: roll it along the ground, spin it in the air. */
  render(dt: number) {
    this.mesh.position.copy(this.pos);
    const gs = Math.hypot(this.vel.x, this.vel.z);
    if (gs > 0.01) {
      const axis = new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize();
      this.mesh.rotateOnWorldAxis(axis, (gs / R) * dt);
    }
    if (this.spin.lengthSq() > 0.01) {
      const s = this.spin.length();
      this.mesh.rotateOnWorldAxis(this.spin.clone().divideScalar(s), s * dt);
    }
    // The streak: shows from a firm pass upward, stronger the faster it flies.
    this.trailPts.pop();
    this.trailPts.unshift(this.pos.clone());
    const sp = this.speed;
    const glow = this.owner || this.holder ? 0 : Math.max(0, Math.min(1, (sp - 9) / 8));
    this.trail.children.forEach((c, i) => {
      const m = c as THREE.Mesh;
      m.position.copy(this.trailPts[Math.min(this.trailPts.length - 1, i + 1)]);
      (m.material as THREE.MeshBasicMaterial).opacity = glow * 0.38 * (1 - i / 7);
      m.visible = glow > 0;
    });
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    const hgt = this.pos.y - R;
    this.shadow.scale.setScalar(1 + hgt * 0.25);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.35 - hgt * 0.06);
  }
}
