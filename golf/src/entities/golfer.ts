// A golfer: one of the Floor Step heroes (in their clothes, without their weapon) holding a
// putter. Stands side-on to the line with the target on their left, swings like a pendulum, walks
// up to the ball between shots, and reacts.
import * as THREE from 'three';
import type { HeroLook } from '../data/heroes';
import { BALL } from '../data/tuning';
import { buildHero, type HeroRig, type Pose } from './heroModel';
import { toon } from '../world/toon';

export type GolferPose = 'putt' | 'watch' | 'joy' | 'pump' | 'sulk' | 'walk' | 'idle';

/** What the game needs from any golfer (a hero, or Youser). */
export interface GolferLike {
  readonly root: THREE.Object3D;
  yaw: number;
  /** Swing position: -1 full backswing … 0 at the ball … 1 follow-through. */
  swing: number;
  readonly walking: boolean;
  /** Where to stand to putt (`left`: from the other side of the ball, as a left-hander). */
  addressSpot(ballX: number, ballY: number, ballZ: number, dx: number, dz: number, left?: boolean): { x: number; y: number; z: number; yaw: number };
  /** Play left-handed (mirrored, standing the other side of the ball). */
  setLeft(left: boolean): void;
  /** See-through (when standing inside something). */
  setGhost(on: boolean): void;
  placeAt(x: number, y: number, z: number, yaw: number): void;
  /** Walk to a spot (through `via` points on the way, if given), then turn to face `yaw`. */
  walkTo(x: number, y: number, z: number, yaw: number, via?: P3[]): void;
  setPose(p: GolferPose): void;
  update(dt: number): void;
}

export interface P3 { x: number; y: number; z: number }

/**
 * A walk along a path of points (close together, each at the height to step at: on the ground, or up
 * on a wall's rail when stepping over one). Moves a position along it at a given pace.
 */
export class Walk {
  private i = 0;
  private from: P3;
  constructor(start: THREE.Vector3, readonly pts: P3[], readonly yaw: number) {
    this.from = { x: start.x, y: start.y, z: start.z };
  }

  /** How far is left to walk. */
  left(r: THREE.Vector3) {
    const t = this.pts[this.i];
    let d = Math.hypot(t.x - r.x, t.z - r.z);
    for (let k = this.i + 1; k < this.pts.length; k++) d += Math.hypot(this.pts[k].x - this.pts[k - 1].x, this.pts[k].z - this.pts[k - 1].z);
    return d;
  }

  /** Step along by up to `step` metres; returns the way it's heading and whether it's there. */
  advance(r: THREE.Vector3, step: number) {
    let rem = step, dx = 0, dz = 0;
    for (;;) {
      const t = this.pts[this.i];
      const ex = t.x - r.x, ez = t.z - r.z, d = Math.hypot(ex, ez);
      if (d > 1e-6) { dx = ex / d; dz = ez / d; }
      if (d <= rem) {
        r.set(t.x, t.y, t.z);
        rem -= d;
        if (this.i === this.pts.length - 1) return { dx, dz, arrived: true };
        this.from = t;
        this.i++;
        continue;
      }
      r.x += dx * rem;
      r.z += dz * rem;
      // Height: between the last point and the next, by how far along.
      const seg = Math.hypot(t.x - this.from.x, t.z - this.from.z) || 1;
      const u = Math.max(0, Math.min(1, 1 - (d - rem) / seg));
      r.y = this.from.y + (t.y - this.from.y) * u;
      return { dx, dz, arrived: false };
    }
  }
}

/** Make a golfer see-through, or solid again (their materials become their own the first time). */
export function ghostify(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.ink) { o.visible = !on; return; }
    if (!o.userData.ownMat) {
      o.material = (o.material as THREE.Material).clone();
      o.userData.ownMat = true;
    }
    const m = o.material as THREE.Material;
    m.transparent = on;
    m.opacity = on ? 0.32 : 1;
    m.depthWrite = !on;
    o.castShadow = !on;
  });
}

/** Where a golfer stands for a putt, given where their club head rests relative to their feet. */
export function addressFrom(head: THREE.Vector3, ballX: number, ballY: number, ballZ: number, dx: number, dz: number, back: number, left = false) {
  const yaw = Golfer.yawFor(dx, dz) + (left ? Math.PI : 0);
  const off = new THREE.Vector3(left ? -head.x : head.x, head.y, head.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const l = Math.hypot(dx, dz) || 1;
  return { x: ballX - off.x - (dx / l) * back, z: ballZ - off.z - (dz / l) * back, y: ballY - BALL.radius, yaw };
}

export class Golfer implements GolferLike {
  readonly rig: HeroRig;
  readonly root: THREE.Group;
  private club = new THREE.Group();
  private clubHead = new THREE.Object3D();
  /** Where the club head sits relative to the golfer's feet at address (in the golfer's own frame). */
  private headOffset = new THREE.Vector3();
  private t = 0;
  private pose: GolferPose = 'idle';
  /** Swing position for the putt pose: -1 full backswing … 0 at the ball … 1 follow-through. */
  swing = 0;
  /** Walking somewhere: target position and facing. */
  private walk: Walk | null = null;
  yaw = 0;

  constructor(readonly look: HeroLook, clubColor = 0xc8ccd4) {
    this.rig = buildHero(look, { noWeapon: true });
    this.root = this.rig.root;
    this.buildClub(0.62, clubColor);
    this.rig.hand.add(this.club);
    this.calibrate(clubColor);
  }

  /** A putter: a shaft down from the hands, a grip, and a flat-faced head. */
  private buildClub(len: number, color: number) {
    this.club.clear();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 6), toon(color));
    shaft.position.y = -len / 2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.14, 6), toon(0x1c1c22));
    grip.position.y = -0.05;
    // The head lies across the line of the swing, so its flat face meets the ball (a white sight line
    // on top points at the target).
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.15), toon(color));
    head.position.set(0, -len, 0.0);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.004, 0.008), toon(0xffffff));
    sight.position.set(0, -len + 0.021, 0);
    this.club.add(sight);
    this.clubHead.position.set(0, -len, 0);
    for (const m of [shaft, grip, head]) { m.castShadow = true; this.club.add(m); }
    this.club.add(this.clubHead);
  }

  /**
   * Stand at address for a moment (no one's watching), see where the club head ends up, and fit the
   * shaft so the head just touches the ground there.
   */
  private calibrate(color: number) {
    const measure = () => {
      this.root.position.set(0, 0, 0);
      this.root.rotation.set(0, 0, 0);
      for (let i = 0; i < 120; i++) this.rig.animate(1 / 60, 'putt', { speed: 0, stride: 0, turn: 0 }, i / 60, 0);
      this.root.updateMatrixWorld(true);
      const hand = this.rig.hand.getWorldPosition(new THREE.Vector3());
      const head = this.clubHead.getWorldPosition(new THREE.Vector3());
      return { hand, head };
    };
    let { hand, head } = measure();
    // Scale the shaft so the head comes down to the ground (head height ≈ its half-thickness).
    const want = 0.022;
    const len = 0.62 * (hand.y - want) / Math.max(0.05, hand.y - head.y);
    this.buildClub(Math.max(0.3, Math.min(1.1, len)), color);
    ({ hand, head } = measure());
    this.headOffset.copy(head);
  }

  /** Face the shot: the target (direction dx, dz) is on the golfer's left. */
  static yawFor(dx: number, dz: number) {
    return Math.atan2(dz, -dx);
  }

  /** Where to stand so the club head rests just behind the ball. */
  addressSpot(ballX: number, ballY: number, ballZ: number, dx: number, dz: number, left = false) {
    return addressFrom(this.headOffset, ballX, ballY, ballZ, dx, dz, BALL.radius + 0.06, left);
  }

  private left = false;
  private ghost = false;
  setLeft(left: boolean) {
    if (left === this.left) return;
    this.left = left;
    this.root.scale.x = left ? -1 : 1;
  }

  setGhost(on: boolean) {
    if (on === this.ghost) return;
    this.ghost = on;
    ghostify(this.root, on);
  }

  /** Stand right there. */
  placeAt(x: number, y: number, z: number, yaw: number) {
    this.walk = null;
    this.root.position.set(x, y, z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  /** Walk over to a spot (round things, along `via`), then turn to face. */
  walkTo(x: number, y: number, z: number, yaw: number, via: P3[] = []) {
    this.walk = new Walk(this.root.position, [...via, { x, y, z }], yaw);
  }

  get walking() {
    return !!this.walk;
  }

  setPose(p: GolferPose) {
    if (p !== this.pose) { this.pose = p; this.t = 0; }
  }

  update(dt: number) {
    this.t += dt;
    let motion = { speed: 0, stride: 0, turn: 0 };
    let pose: Pose = this.pose;
    const w = this.walk;
    if (w) {
      const r = this.root.position;
      const d = w.left(r);
      const speed = Math.min(2.6, 0.8 + d * 1.5);
      const step = speed * dt;
      const { dx, dz, arrived } = w.advance(r, step);
      if (arrived) this.walk = null;
      else { motion = { speed: speed / 2.6, stride: step, turn: 0 }; pose = 'walk'; }
      // Face where we're going, then turn to the shot when nearly there.
      const want = d > 0.4 ? Math.atan2(dx, dz) : w.yaw;
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 9);
      this.root.rotation.y = this.yaw;
    }
    this.rig.animate(dt, pose, motion, this.t, this.swing);
  }

  /** Swinging the club through the ball (for timing the hit): the club head's position. */
  headWorld(out = new THREE.Vector3()) {
    return this.clubHead.getWorldPosition(out);
  }
}
