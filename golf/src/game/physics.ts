// The ball's physics, on Rapier: the ball is a real rolling sphere on the hole's exact ground
// (a triangle mesh), bouncing off the walls and posts. On top of what Rapier does we add what a
// putting surface does: rolling resistance (more on sand), coming to rest on gentle ground, and the
// cup: slow enough over the hole and it drops, too fast and it hops over the lip.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BALL, CUP, PHYS, SURFACE, WALL } from '../data/tuning';
import type { LoopDef, ObstacleDef, PipeDef } from '../data/holes';
import { type Shape, inWater, onSand, postBounce } from '../world/geometry';

let ready: Promise<void> | null = null;
/** Load the physics engine (once). */
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

export type BallEvent =
  | { kind: 'wall'; speed: number; what: 'wall' | 'stump' | 'rock' }
  | { kind: 'bounce'; speed: number }
  | { kind: 'lip'; speed: number }
  | { kind: 'cup' }
  | { kind: 'stopped' }
  | { kind: 'lost' }
  | { kind: 'water' }
  | { kind: 'thud'; speed: number }
  | { kind: 'pipeIn' }
  | { kind: 'pipeOut' }
  | { kind: 'boing'; speed: number }
  | { kind: 'loopIn'; speed: number }
  | { kind: 'loopOut'; made: boolean };

/** A rolling ball's speed squared lost to climbing y metres (the rest of its energy is in its spin). */
const CLIMB = (10 / 7) * PHYS.gravity;

/** Slowest a ball can enter a loop of radius r and still make it right round (with a little to spare for the carpet). */
export function loopSpeed(r: number) {
  return Math.sqrt((27 / 7) * PHYS.gravity * r + 2 * SURFACE.green * Math.PI * 2 * r) + 0.05;
}

/** Where a ball is in a loop at angle θ (0 at the bottom going in, 2π coming out). */
export function loopPoint(l: LoopDef, theta: number, h: (x: number, z: number) => number) {
  const dx = Math.sin(l.angle), dz = -Math.cos(l.angle), nx = -dz, nz = dx;
  const shift = (l.shift ?? 0.3) * Math.max(0, Math.min(1, theta / (Math.PI * 2)));
  const along = l.radius * Math.sin(theta);
  const [ax, az] = l.at;
  const x = ax + dx * along + nx * shift, z = az + dz * along + nz * shift;
  return new THREE.Vector3(x, h(ax, az) + R + (l.radius - R) * (1 - Math.cos(theta)), z);
}

const R = BALL.radius;

/** How wide a pipe's mouth is (the ball drops in within this of its middle). */
export const PIPE_R = 0.15;

/**
 * Where a moving obstacle is at time t: its body's position and turn. Shared by the physics and the
 * drawing, so the sails, doors and bales you see are exactly where the ball meets them.
 */
export function obstaclePose(o: ObstacleDef, t: number, h: (x: number, z: number) => number) {
  const [x, z] = o.at, y = h(x, z);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  switch (o.kind) {
    case 'spinner':
      q.setFromAxisAngle(up, o.speed * t);
      return { x, y: y + 0.09, z, q };
    case 'slider': {
      const a = o.angle ?? Math.PI / 2, u = Math.sin(((t / o.period) + (o.phase ?? 0)) * Math.PI * 2) * o.travel;
      const px = x + Math.sin(a) * u, pz = z - Math.cos(a) * u;
      // The bale lies across its way of travel and rolls as it goes.
      q.setFromAxisAngle(up, -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), u / 0.28));
      return { x: px, y: h(px, pz) + 0.28, z: pz, q };
    }
    case 'windmill':
      q.setFromAxisAngle(up, -(o.angle ?? 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), o.speed * t));
      return { x, y: y + 0.68, z, q };
    case 'gate': {
      const open = 0.5 - 0.5 * Math.cos(((t / o.period) + (o.phase ?? 0)) * Math.PI * 2);
      const a = o.angle + o.swing * open;
      q.setFromAxisAngle(up, Math.PI / 2 - a);
      return { x, y, z, q };
    }
  }
}

/** The obstacle's collision shapes, in its own frame. */
function obstacleColliders(o: ObstacleDef): RAPIER.ColliderDesc[] {
  const list: RAPIER.ColliderDesc[] = [];
  const rotY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
  const rotZ = (a: number) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
  switch (o.kind) {
    case 'spinner': {
      const n = o.arms ?? 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI;
        list.push(RAPIER.ColliderDesc.cuboid(o.reach, 0.07, 0.05).setRotation(rotY(a)));
      }
      list.push(RAPIER.ColliderDesc.cylinder(0.3, 0.1));
      break;
    }
    case 'slider':
      list.push(RAPIER.ColliderDesc.cylinder(0.42, 0.28).setRotation(rotZ(Math.PI / 2)));
      break;
    case 'windmill':
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        list.push(RAPIER.ColliderDesc.cuboid(0.06, o.reach / 2, 0.02).setTranslation(-Math.sin(a) * o.reach / 2, Math.cos(a) * o.reach / 2, 0).setRotation(rotZ(a)));
      }
      break;
    case 'gate':
      list.push(RAPIER.ColliderDesc.cuboid(o.length / 2, 0.2, 0.03).setTranslation(o.length / 2, 0.15, 0));
      break;
  }
  return list.map((d) => d.setRestitution(0.6).setFriction(0));
}

export class HolePhysics {
  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  /** Moving: false once it's come to rest (or dropped). */
  moving = false;
  /** In the cup (then the physics leaves it alone). */
  holed = false;
  /** Just bounced over the cup: don't hop it again until it's clear. */
  private lipped = false;
  private restT = 0;
  private rollT = 0;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  /** Touching the ground (for the rolling sound). */
  grounded = false;
  readonly cupY: number;
  /** Moving obstacles, and the time that drives them. */
  private obstacles: { def: ObstacleDef; body: RAPIER.RigidBody; colliders: Set<number> }[] = [];
  private obstacleHandles = new Set<number>();
  private t = 0;
  /** In a pipe: where it comes out, and when. */
  inPipe: { pipe: PipeDef; left: number; speed: number } | null = null;
  /** Going round a loop: which, how far round (radians), how fast, and which way. */
  inLoop: { loop: LoopDef; theta: number; v: number; dir: 1 | -1 } | null = null;
  /** Where the ball was along each loop's way in last step (to see it cross the entry). */
  private loopSide: number[] = [];
  /** For spotting a ball that's wedged somewhere and can't get out. */
  private stuck = { x: 0, z: 0, t: 0, run: 0 };
  /** Came to rest against something moving: it can't wake the ball until they've parted. */
  private restingOnObstacle = false;
  private ballShape = new RAPIER.Ball(R + 0.012);

  constructor(readonly shape: Shape) {
    this.world = new RAPIER.World({ x: 0, y: -PHYS.gravity, z: 0 });
    this.world.timestep = 1 / PHYS.hz;
    // The ground: the hole's own mesh, with the seams between triangles smoothed out.
    const s = shape.surface;
    const ground = RAPIER.ColliderDesc.trimesh(s.positions, s.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(BALL.friction)
      .setRestitution(BALL.groundBounce)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
    this.world.createCollider(ground);
    // Walls: a sloped block for each segment (its top follows the ground), posts at the corners.
    const h = shape.heightAt;
    const t = WALL.thickness;
    const wallDesc = (pts: number[]) => RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!
      .setFriction(0)
      .setRestitution(BALL.wallBounce)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    for (const w of shape.walls) {
      const [ax, az] = w.a, [bx, bz] = w.b, [nx, nz] = w.n;
      // Outer face is behind the inner one (away from the playing area).
      const ox = -nx * t, oz = -nz * t;
      const ya = h(ax, az), yb = h(bx, bz);
      const top = WALL.height + 0.6, bottom = -0.6;
      const pts = [
        ax, ya + bottom, az, bx, yb + bottom, bz, ax + ox, ya + bottom, az + oz, bx + ox, yb + bottom, bz + oz,
        ax, ya + top, az, bx, yb + top, bz, ax + ox, ya + top, az + oz, bx + ox, yb + top, bz + oz,
      ];
      this.world.createCollider(wallDesc(pts));
      // A round post at each corner so the ball never catches on the joins.
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.6, t / 2).setTranslation(ax - nx * t / 2, ya, az - nz * t / 2).setRestitution(BALL.wallBounce).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFriction(0));
    }
    for (const post of shape.posts) {
      const [px, pz, pr] = post;
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.6, pr).setTranslation(px, h(px, pz), pz).setRestitution(Math.min(1, postBounce(post, BALL.wallBounce))).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFriction(0));
    }
    // Moving obstacles: kinematic bodies that push the ball about.
    for (const def of shape.hole.obstacles ?? []) {
      const pose = obstaclePose(def, 0, h);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.x, pose.y, pose.z).setRotation(pose.q));
      const colliders = new Set<number>();
      for (const d of obstacleColliders(def)) {
        const c = this.world.createCollider(d, body);
        colliders.add(c.handle);
        this.obstacleHandles.add(c.handle);
      }
      this.obstacles.push({ def, body, colliders });
    }
    // The ball: continuous collision so a hard putt can't tunnel through a wall.
    const [tx, tz] = shape.hole.tee;
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(tx, h(tx, tz) + R, tz).setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.05));
    this.world.createCollider(RAPIER.ColliderDesc.ball(R).setMass(BALL.mass).setFriction(BALL.friction).setRestitution(BALL.groundBounce), this.body);
    const [cx, cz] = shape.hole.cup;
    this.cupY = h(cx, cz);
    this.sync();
  }

  /** Put the ball down somewhere (tee, back after the water), at rest. */
  place(x: number, z: number) {
    this.body.setTranslation({ x, y: this.shape.heightAt(x, z) + R + 0.002, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.moving = false;
    this.holed = false;
    this.lipped = false;
    this.inPipe = null;
    this.inLoop = null;
    this.loopSide = [];
    this.sync();
  }

  /** Hit it: along the ground in direction (dx, dz) at this speed, already rolling (no skid). */
  putt(dx: number, dz: number, speed: number) {
    const l = Math.hypot(dx, dz) || 1;
    const vx = (dx / l) * speed, vz = (dz / l) * speed;
    this.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    // Rolling without slipping: ω = v × up / r.
    this.body.setAngvel({ x: vz / R, y: 0, z: -vx / R }, true);
    this.moving = true;
    this.restT = 0;
    this.rollT = 0;
    this.stuck = { x: this.body.translation().x, z: this.body.translation().z, t: 0, run: 0 };
  }

  /** Where each moving obstacle is now (for drawing them). */
  obstaclePoses() {
    return this.obstacles.map((o) => obstaclePose(o.def, this.t, this.shape.heightAt));
  }

  /** Set the obstacles where they are at the current time (next = for the coming physics step). */
  private moveObstacles(next: boolean) {
    for (const o of this.obstacles) {
      const p = obstaclePose(o.def, this.t, this.shape.heightAt);
      if (next) {
        o.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        o.body.setNextKinematicRotation({ x: p.q.x, y: p.q.y, z: p.q.z, w: p.q.w });
      } else {
        o.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        o.body.setRotation({ x: p.q.x, y: p.q.y, z: p.q.z, w: p.q.w }, true);
      }
    }
  }

  /** Is the ball touching a moving obstacle? */
  private touchingObstacle() {
    if (!this.obstacles.length) return false;
    const p = this.body.translation();
    let hit = false;
    this.world.intersectionsWithShape({ x: p.x, y: p.y, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, this.ballShape, (c) => {
      if (this.obstacleHandles.has(c.handle)) { hit = true; return false; }
      return true;
    });
    return hit;
  }

  /** Advance by dt (split into small physics steps); returns what happened. */
  step(dt: number): BallEvent[] {
    const events: BallEvent[] = [];
    const n = Math.max(1, Math.round(dt * PHYS.hz)), h = 1 / PHYS.hz;
    // In a pipe: wait, then out it comes at the other end.
    if (this.inPipe) {
      this.t += dt;
      this.moveObstacles(false);
      this.inPipe.left -= dt;
      if (this.inPipe.left <= 0) {
        const { pipe, speed } = this.inPipe;
        this.inPipe = null;
        const dx = Math.sin(pipe.exit), dz = -Math.cos(pipe.exit);
        this.place(pipe.to[0] + dx * (PIPE_R + R + 0.03), pipe.to[1] + dz * (PIPE_R + R + 0.03));
        this.putt(dx, dz, speed);
        events.push({ kind: 'pipeOut' });
      }
      this.sync();
      return events;
    }
    // Round a loop: no physics, just the track (speed from how high it's climbed).
    if (this.inLoop) {
      this.t += dt;
      this.moveObstacles(false);
      this.loopStep(dt, events);
      return events;
    }
    // A sail or a bale catching a ball that's sitting still sets it going.
    if (!this.moving && !this.holed) {
      this.t += dt;
      this.moveObstacles(false);
      const touching = this.touchingObstacle();
      if (touching && !this.restingOnObstacle) { this.moving = true; this.restT = 0; this.rollT = 0; this.stuck.t = 0; }
      else {
        if (!touching) this.restingOnObstacle = false;
        return events;
      }
    }
    if (this.holed) { this.t += dt; this.moveObstacles(false); return events; }
    for (let i = 0; i < n && this.moving && !this.inLoop; i++) {
      this.t += h;
      this.moveObstacles(true);
      this.substep(h, events);
    }
    if (!this.moving) this.moveObstacles(false);
    this.sync();
    return events;
  }

  private substep(h: number, events: BallEvent[]) {
    const b = this.body;
    // (Copied: Rapier hands back the same vector object it then updates.)
    const lv = b.linvel(), v0 = { x: lv.x, y: lv.y, z: lv.z };
    this.world.step();
    const p = b.translation(), lv1 = b.linvel(), v = { x: lv1.x, y: lv1.y, z: lv1.z };
    // What changed sharply this step: a wall (sideways) or the ground (upward).
    const dvx = v.x - v0.x, dvz = v.z - v0.z, dvy = v.y - v0.y;
    const side = Math.hypot(dvx, dvz);
    if (side > 0.35 && this.touchingObstacle()) {
      // Knocked by something moving: Rapier's push stands; it just rolls the new way.
      b.setAngvel({ x: v.z / R, y: 0, z: -v.x / R }, true);
      events.push({ kind: 'thud', speed: side });
    } else if (side > 0.35 && this.wallNormal(p.x, p.z)) {
      // Off a wall: Rapier found the hit; we make the bounce clean and the same every time (back
      // off the wall at 72% of the speed into it, the sideways speed kept, nothing upward), and the
      // ball rolls the new way at once (no leftover spin dragging it back). Mushrooms spring it back.
      const { n, bounce, what } = this.wallNormal(p.x, p.z)!;
      const vn = v0.x * n[0] + v0.z * n[1];
      if (vn < 0) {
        const tx = (v0.x - vn * n[0]) * 0.97, tz = (v0.z - vn * n[1]) * 0.97;
        const ox = tx - bounce * vn * n[0], oz = tz - bounce * vn * n[1];
        b.setLinvel({ x: ox, y: Math.min(v.y, 0), z: oz }, true);
        b.setAngvel({ x: oz / R, y: 0, z: -ox / R }, true);
        events.push(bounce > 1 ? { kind: 'boing', speed: -vn } : { kind: 'wall', speed: -vn, what });
      } else events.push({ kind: 'wall', speed: side, what });
    }
    if (dvy > 0.6) events.push({ kind: 'bounce', speed: dvy });

    // Touching the ground? Then it rolls: slow it along the surface by the rolling resistance.
    this.ray.origin = { x: p.x, y: p.y, z: p.z };
    const vv = b.linvel();
    v.x = vv.x; v.y = vv.y; v.z = vv.z;
    const hit = this.world.castRayAndGetNormal(this.ray, R + 0.02, true, undefined, undefined, undefined, b);
    this.grounded = !!hit;
    let speed = Math.hypot(v.x, v.y, v.z);
    if (hit) {
      const nrm = hit.normal;
      const decel = onSand(this.shape, p.x, p.z) ? SURFACE.sand : SURFACE.green;
      // Velocity along the surface.
      const vn = v.x * nrm.x + v.y * nrm.y + v.z * nrm.z;
      const tx = v.x - vn * nrm.x, ty = v.y - vn * nrm.y, tz = v.z - vn * nrm.z;
      const ts = Math.hypot(tx, ty, tz);
      if (ts > 0) {
        const k = Math.max(0, ts - decel * h) / ts;
        b.setLinvel({ x: tx * k + vn * nrm.x, y: ty * k + vn * nrm.y, z: tz * k + vn * nrm.z }, true);
        const w = b.angvel();
        b.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
      }
      speed = ts;
      // At rest: slow, and the slope isn't steep enough to start it rolling again.
      // (Or it's been barely moving for a while: held against a wall on a slope, say.)
      const slope = Math.hypot(nrm.x, nrm.z);
      if (speed < PHYS.stopSpeed) {
        this.restT += h;
        if ((this.restT > 0.12 && (5 / 7) * slope * PHYS.gravity < decel * 1.15) || this.restT > 2.5) {
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
          b.setAngvel({ x: 0, y: 0, z: 0 }, true);
          this.rest(events);
          return;
        }
      } else this.restT = 0;
    }

    // The cup.
    const [cx, cz] = this.shape.hole.cup;
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d < CUP.radius && p.y - this.cupY < R + 0.05) {
      // The slower it is (and the nearer the middle), the surer it drops.
      const edge = d / CUP.radius;
      const vmax = CUP.capture * Math.sqrt(Math.max(0, 1 - edge * edge)) + 0.35;
      if (speed < vmax) {
        this.holed = true;
        this.moving = false;
        events.push({ kind: 'cup' });
        return;
      }
      if (!this.lipped && edge < 0.85) {
        // Too fast: it dips in, clips the far lip and hops on, slower and a bit off line.
        this.lipped = true;
        const lv = b.linvel();
        const turn = (Math.random() - 0.5) * 0.5 * (1 - edge * 0.5);
        const c = Math.cos(turn), s = Math.sin(turn);
        b.setLinvel({ x: (lv.x * c - lv.z * s) * 0.72, y: 0.55 + speed * 0.06, z: (lv.x * s + lv.z * c) * 0.72 }, true);
        events.push({ kind: 'lip', speed });
      }
    } else if (d > CUP.radius + R) this.lipped = false;

    // Into a pond: under the water line inside it.
    if (inWater(this.shape, p.x, p.z, p.y - R)) {
      this.moving = false;
      events.push({ kind: 'water' });
      return;
    }
    // Over a pipe's mouth (and on the ground): in it goes.
    for (const pipe of this.shape.hole.pipes ?? []) {
      if (Math.hypot(p.x - pipe.from[0], p.z - pipe.from[1]) < PIPE_R && this.grounded) {
        const sp = Math.hypot(v.x, v.z);
        const len = Math.hypot(pipe.to[0] - pipe.from[0], pipe.to[1] - pipe.from[1]);
        this.inPipe = { pipe, left: Math.max(0.5, Math.min(1.4, len / 5)), speed: Math.max(1.4, sp * 0.85) };
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.moving = false;
        events.push({ kind: 'pipeIn' });
        return;
      }
    }
    // Off the course somehow (over a wall on a jump): it's lost.
    if (p.y < this.cupY - 4) {
      this.moving = false;
      events.push({ kind: 'lost' });
      return;
    }
    // Into a loop: crossing its way in, heading the right way.
    const loops = this.shape.hole.loops ?? [];
    for (let i = 0; i < loops.length; i++) {
      const l = loops[i];
      const dx = Math.sin(l.angle), dz = -Math.cos(l.angle);
      const s = (p.x - l.at[0]) * dx + (p.z - l.at[1]) * dz, lat = (p.x - l.at[0]) * -dz + (p.z - l.at[1]) * dx;
      const before = this.loopSide[i];
      this.loopSide[i] = s;
      const fwd = v.x * dx + v.z * dz;
      if (before !== undefined && before < 0 && s >= 0 && Math.abs(lat) < 0.4 && fwd > 0.2 && this.grounded) {
        this.inLoop = { loop: l, theta: 0, v: Math.hypot(v.x, v.z), dir: 1 };
        events.push({ kind: 'loopIn', speed: Math.hypot(v.x, v.z) });
        return;
      }
    }
    // Never roll for ever, and don't sit wedged somewhere jiggling: if it's hardly moved in a second
    // and a half, that's where it stops.
    this.rollT += h;
    // (Measured along the way it rolled, so a ball that goes up a slope and comes back isn't "stuck".)
    this.stuck.t += h;
    this.stuck.run += Math.hypot(p.x - this.stuck.x, p.z - this.stuck.z);
    this.stuck.x = p.x;
    this.stuck.z = p.z;
    if (this.stuck.t > 1.5) {
      const rolled = this.stuck.run;
      this.stuck.t = 0;
      this.stuck.run = 0;
      if (rolled < 0.04) { this.rest(events); return; }
    }
    if (this.rollT > 15) this.rest(events);
  }

  /** It's stopped (remembering if something moving is leaning on it). */
  private rest(events: BallEvent[]) {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.moving = false;
    this.restingOnObstacle = this.touchingObstacle();
    events.push({ kind: 'stopped' });
  }

  /** Going round a loop: up (slowing as it climbs), over the top and down, or back if it's too slow. */
  private loopStep(dt: number, events: BallEvent[]) {
    const L = this.inLoop!, l = L.loop, r = l.radius - R;
    const n = Math.max(1, Math.round(dt * PHYS.hz)), h = dt / n;
    for (let i = 0; i < n; i++) {
      L.v = Math.max(0, L.v - SURFACE.green * h);
      const y = r * (1 - Math.cos(L.theta));
      // Speed here from the speed it came in with, less the climb.
      const v2 = L.v * L.v - CLIMB * y;
      // Up the far side, it needs enough speed to stay on the track (and anywhere, to keep going up).
      if (L.dir > 0 && (v2 <= 0 || v2 < -PHYS.gravity * r * Math.cos(L.theta))) L.dir = -1;
      const sp = Math.sqrt(Math.max(0.04, v2));
      L.theta += (L.dir * sp * h) / r;
      if (L.theta >= Math.PI * 2 || L.theta <= 0) break;
    }
    const dx = Math.sin(l.angle), dz = -Math.cos(l.angle);
    if (L.theta >= Math.PI * 2) {
      // Right round: out the far side.
      const p = loopPoint(l, Math.PI * 2, this.shape.heightAt);
      this.inLoop = null;
      this.place(p.x + dx * 0.05, p.z + dz * 0.05);
      this.putt(dx, dz, Math.max(0.3, L.v));
      events.push({ kind: 'loopOut', made: true });
      return;
    }
    if (L.theta <= 0) {
      // Not enough: back down and out the way it came.
      this.inLoop = null;
      this.place(l.at[0] - dx * 0.06, l.at[1] - dz * 0.06);
      this.putt(-dx, -dz, Math.max(0.3, L.v * 0.8));
      this.loopSide = [];
      events.push({ kind: 'loopOut', made: false });
      return;
    }
    const p = loopPoint(l, L.theta, this.shape.heightAt);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    // Spin it along the track.
    const q = this.body.rotation(), spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-dz, 0, dx), L.dir * L.v * dt / R);
    const nq = spin.multiply(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    this.body.setRotation({ x: nq.x, y: nq.y, z: nq.z, w: nq.w }, true);
    this.sync();
  }

  /** The normal (into the playing area) of the wall or post the ball is touching, if any, and how bouncy it is. */
  private wallNormal(x: number, z: number): { n: [number, number]; bounce: number; what: 'wall' | 'stump' | 'rock' } | null {
    let best = R + 0.04, n: [number, number] | null = null, bounce = BALL.wallBounce, what: 'wall' | 'stump' | 'rock' = 'wall';
    for (const w of this.shape.wallsNear(x, z)) {
      const [ax, az] = w.a, [bx, bz] = w.b;
      const ex = bx - ax, ez = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        // Along the face: its normal; round an end (a corner post): straight out from the corner.
        n = t > 0 && t < 1 ? [w.n[0], w.n[1]] : d > 1e-6 ? [(x - px) / d, (z - pz) / d] : [w.n[0], w.n[1]];
      }
    }
    for (const post of this.shape.posts) {
      const [px, pz, pr] = post;
      const d = Math.hypot(x - px, z - pz);
      if (d - pr < best) { best = d - pr; n = [(x - px) / d, (z - pz) / d]; bounce = postBounce(post, BALL.wallBounce); what = post[3] === 'rock' ? 'rock' : 'stump'; }
    }
    return n ? { n, bounce, what } : null;
  }

  private sync() {
    const p = this.body.translation(), v = this.body.linvel(), q = this.body.rotation();
    this.pos.set(p.x, p.y, p.z);
    this.vel.set(v.x, v.y, v.z);
    this.quat.set(q.x, q.y, q.z, q.w);
  }

  dispose() {
    this.world.free();
  }
}
