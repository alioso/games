// The monster's mind. It drifts from place to place through the maze. It notices you if it SEES you
// (in front of it, near enough, nothing in the way), HEARS you (walking anywhere near, even through a
// hedge, but creeping it only hears right up close), or SMELLS you (very close, whatever you do).
// Then it stops, rolls its ring (that tingle) and comes after you, a little slower than you can run.
// Lose it and it searches where it last saw you, then gives up and drifts off again. It can't pass a
// keeper's shut gate.
import * as THREE from 'three';
import { MonsterModel } from '../entities/monsterModel';
import type { MazeWorld } from '../world/maze';
import { tileMid, tileOf } from '../world/maze';

export type MonsterState = 'wander' | 'alert' | 'chase' | 'search' | 'gone';

export const MONSTER = {
  wander: 1.5,
  chase: 3.15,
  sight: 9,
  /** Half the width of what it sees ahead (radians). */
  cone: 1.2,
  hearWalk: 6,
  hearCreep: 1.5,
  smell: 2.1,
  /** Close enough to catch you. */
  reach: 0.75,
};

export interface Senses {
  x: number;
  z: number;
  /** Creeping (quiet). */
  creeping: boolean;
  /** Moving at all. */
  moving: boolean;
}

export class Monster {
  readonly model = new MonsterModel();
  state: MonsterState = 'wander';
  private stateT = 0;
  private path: [number, number][] = [];
  private repath = 0;
  private yaw = 0;
  private speed = 0;
  /** Where it last knew you were. */
  private lastSeen = new THREE.Vector3();
  /** How it noticed you (for the banner): seen, heard, smelt. */
  how: 'saw' | 'heard' | 'smelt' = 'saw';
  /** Set when it notices you (the level shows a banner and plays the tingle). */
  noticed = false;

  constructor(private world: MazeWorld, x: number, z: number, private clearLine: (ax: number, az: number, bx: number, bz: number) => boolean) {
    this.model.root.position.set(x, 0, z);
  }

  get pos() {
    return this.model.root.position;
  }

  private set(s: MonsterState) {
    this.state = s;
    this.stateT = 0;
  }

  /** Does it notice you right now? */
  private senses(you: Senses) {
    const p = this.pos, dx = you.x - p.x, dz = you.z - p.z, d = Math.hypot(dx, dz);
    if (d < MONSTER.smell) { this.how = 'smelt'; return true; }
    if (you.moving && d < (you.creeping ? MONSTER.hearCreep : MONSTER.hearWalk)) { this.how = 'heard'; return true; }
    let a = Math.atan2(dx, dz) - this.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (d < MONSTER.sight && Math.abs(a) < MONSTER.cone && this.clearLine(p.x, p.z, you.x, you.z)) { this.how = 'saw'; return true; }
    return false;
  }

  /** Can it still see where you are (or are you still close)? */
  private stillOnYou(you: Senses) {
    const p = this.pos, d = Math.hypot(you.x - p.x, you.z - p.z);
    return d < MONSTER.smell + 1 || (d < MONSTER.sight + 3 && this.clearLine(p.x, p.z, you.x, you.z)) || (you.moving && !you.creeping && d < MONSTER.hearWalk);
  }

  /** A way through the maze (tile middles) to a spot. */
  private route(tx: number, tz: number) {
    const L = this.world.layout, { tw, th } = L;
    const from = tileOf(this.pos.z) * tw + tileOf(this.pos.x), to = tileOf(tz) * tw + tileOf(tx);
    const prev = new Int32Array(tw * th).fill(-2);
    prev[from] = -1;
    const q = [from];
    for (let h = 0; h < q.length && prev[to] === -2; h++) {
      const k = q[h], x = k % tw, y = (k - x) / tw;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ddx, ny = y + ddy, n = ny * tw + nx;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th || prev[n] !== -2) continue;
        if (this.world.isWallTile(nx, ny) || this.world.blockers.has(n)) continue;
        prev[n] = k;
        q.push(n);
      }
    }
    const path: [number, number][] = [];
    if (prev[to] === -2) return path;
    for (let k = to; k !== from && k >= 0; k = prev[k]) path.unshift([tileMid(k % tw), tileMid(Math.floor(k / tw))]);
    // Finish on the exact spot.
    if (path.length) path[path.length - 1] = [tx, tz];
    return path;
  }

  /** A random open cell somewhere a fair way off, to drift to. */
  private somewhere() {
    const L = this.world.layout;
    for (let i = 0; i < 40; i++) {
      const cx = Math.floor(Math.random() * L.def.w), cy = Math.floor(Math.random() * L.def.h);
      const x = tileMid(cx * 2 + 1), z = tileMid(cy * 2 + 1);
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > 8) return [x, z] as [number, number];
    }
    return [this.pos.x, this.pos.z] as [number, number];
  }

  /** Follow the path; true when it's run out. */
  private follow(dt: number, speed: number) {
    while (this.path.length) {
      const [x, z] = this.path[0];
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { this.path.shift(); continue; }
      const step = Math.min(d, speed * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      let a = Math.atan2(dx, dz) - this.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      this.yaw += a * Math.min(1, dt * 6);
      this.speed = speed;
      return false;
    }
    this.speed = 0;
    return true;
  }

  /** Each step: think and move. Returns true when it catches you. */
  update(dt: number, you: Senses) {
    this.stateT += dt;
    this.repath -= dt;
    this.noticed = false;
    let lookX = 0;
    switch (this.state) {
      case 'wander':
        if (this.senses(you)) { this.set('alert'); this.noticed = true; this.lastSeen.set(you.x, 0, you.z); break; }
        if (!this.path.length) this.path = this.route(...this.somewhere());
        this.follow(dt, MONSTER.wander);
        break;
      case 'alert': {
        // Stops, turns to you, rolls its ring... then comes.
        const a0 = Math.atan2(you.x - this.pos.x, you.z - this.pos.z);
        let a = a0 - this.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        this.yaw += a * Math.min(1, dt * 5);
        this.speed = 0;
        if (this.stateT > 0.9) { this.set('chase'); this.repath = 0; }
        break;
      }
      case 'chase':
        if (this.stillOnYou(you)) { this.lastSeen.set(you.x, 0, you.z); this.stateT = 0; }
        if (this.repath <= 0) { this.path = this.route(this.lastSeen.x, this.lastSeen.z); this.repath = 0.35; }
        this.follow(dt, MONSTER.chase);
        lookX = 1;
        // Lost you for a while: go and look where you were.
        if (this.stateT > 2.5) this.set('search');
        break;
      case 'search':
        if (this.senses(you)) { this.set('alert'); this.noticed = true; this.lastSeen.set(you.x, 0, you.z); break; }
        if (!this.path.length && this.stateT < 1) this.path = this.route(this.lastSeen.x, this.lastSeen.z);
        if (this.follow(dt, MONSTER.wander * 1.4)) {
          // Looking about.
          this.yaw += dt * 1.8 * Math.sin(this.stateT * 0.8);
        }
        if (this.stateT > 7) { this.set('wander'); this.path = []; }
        break;
      case 'gone':
        break;
    }
    this.model.root.rotation.y = this.yaw;
    const tingling = this.state === 'alert' || this.state === 'chase';
    this.model.tingle += ((tingling ? 1 : 0) - this.model.tingle) * Math.min(1, dt * 4);
    this.model.update(dt, this.speed, lookX);
    return this.state === 'chase' && Math.hypot(you.x - this.pos.x, you.z - this.pos.z) < MONSTER.reach;
  }

  /** Vanish (in a puff) and come back somewhere far away a little later. */
  vanish(farFrom: THREE.Vector3) {
    this.set('gone');
    this.model.root.visible = false;
    this.path = [];
    const back = () => {
      const L = this.world.layout;
      let best: [number, number] = [this.pos.x, this.pos.z], bd = -1;
      for (let i = 0; i < 30; i++) {
        const x = tileMid(Math.floor(Math.random() * L.def.w) * 2 + 1), z = tileMid(Math.floor(Math.random() * L.def.h) * 2 + 1);
        const d = Math.hypot(x - farFrom.x, z - farFrom.z);
        if (d > bd) { bd = d; best = [x, z]; }
      }
      this.pos.set(best[0], 0, best[1]);
      this.model.root.visible = true;
      this.set('wander');
    };
    return back;
  }
}
