// Playing one hole: the flyover, then for each player in turn (the whole hole each) aim, fill the
// power gauge, swing, watch it roll, walk up and go again until it drops (or ten strokes, or a
// skip). Owns the hole's physics, its scenery, the golfer, the ball and the aiming line, and says
// where the camera should be.
import * as THREE from 'three';
import { Particles } from '@engine/particles';
import type { HoleDef } from '../data/holes';
import { BALL, CUP, PHYS, PUTT, WALL } from '../data/tuning';
import type { GolferLike, P3 } from '../entities/golfer';
import { type Shape, buildShape, insidePoly, onSand, segDist } from '../world/geometry';
import { type CpuLevel, CPU_SKILL, ShotSearch, gauss, speedFor } from './ai';
import { Course } from '../world/course';
import type { PadInput } from './controls';
import { HolePhysics } from './physics';
import { predict } from './predict';
import { SFX } from './sounds';

export interface PlayerSlot {
  name: string;
  /** Ball and marker colour. */
  color: number;
  golfer: GolferLike;
  /** Voice pitch for reactions. */
  voice: number;
  /** Played by the computer (how well), or by a person. */
  cpu?: CpuLevel;
}

export type HolePhase = 'flyover' | 'aim' | 'charge' | 'swing' | 'roll' | 'sunk' | 'next' | 'done';

export interface HoleEvent {
  kind: 'banner';
  text: string;
  sub?: string;
  color?: string;
  time?: number;
}

/** What a score is called, relative to par. */
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  return d <= -3 ? 'ALBATROSS!' : d === -2 ? 'EAGLE!' : d === -1 ? 'BIRDIE!' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE BOGEY' : `+${d}`;
}

export class HolePlay {
  readonly group = new THREE.Group();
  readonly shape: Shape;
  readonly course: Course;
  readonly physics: HolePhysics;
  private ballMesh: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  private arrow: THREE.Mesh;
  phase: HolePhase = 'flyover';
  private phaseT = 0;
  /** Whose turn (index into players). */
  turn = 0;
  /** Strokes per player on this hole (null: not played yet). */
  readonly strokes: (number | null)[];
  /** Aim direction (radians: 0 = -z, down the hole). */
  aim = 0;
  power = 0;
  lastPower: number | null = null;
  private swingFrom = 0;
  private hit = false;
  /** Where the ball was before the last putt (for penalties). */
  private lastSpot: [number, number] = [0, 0];
  /** Looking at the whole hole from above (the view button). */
  overview = false;
  private skipHeld = 0;
  readonly events: HoleEvent[] = [];
  /** The aiming path being shown (for the mini-map too). */
  aimPath: [number, number][] | null = null;
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  private dropT = 0;
  /** Confetti for good scores. */
  private confetti = new Particles(500);
  private confettiT = 0;
  /** The computer's turn: its search, how long it's been thinking, and the putt it settled on. */
  private cpu: { search: ShotSearch; t: number; target: { aim: number; power: number } | null; ready: number } | null = null;
  /** Tools: hold the golfer at this point of the swing. */
  freezeSwing: number | null = null;
  /** Tools: put the camera here instead. */
  camOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** Is someone standing here inside something solid (a hedge, a building, a tunnel, the loop)? */
  private insideSolid(x: number, z: number) {
    const def = this.def;
    const along = (a: [number, number], ang: number, half: number, wide: number) => {
      const dx = Math.sin(ang), dz = -Math.cos(ang);
      return segDist(x, z, [a[0] - dx * half, a[1] - dz * half], [a[0] + dx * half, a[1] + dz * half]) < wide;
    };
    for (const b of def.blocks ?? []) {
      if (insidePoly(x, z, b)) return true;
      for (let i = 0; i < b.length; i++) if (segDist(x, z, b[i], b[(i + 1) % b.length]) < 0.12) return true;
    }
    for (const p of def.props ?? []) {
      if (p.kind === 'windmill' && along(p.at, p.angle + Math.PI / 2, 1.6, 0.8)) return true;
      if (p.kind === 'barn' && along(p.at, p.angle + Math.PI / 2, p.width / 2, 0.55)) return true;
    }
    for (const c of def.covers ?? []) if (segDist(x, z, c.a, c.b) < c.width / 2 + 0.2) return true;
    for (const l of def.loops ?? []) if (Math.hypot(x - l.at[0], z - l.at[1]) < l.radius + 0.25) return true;
    return false;
  }

  /**
   * Is a moving obstacle passing through someone standing here right now (a sail, a scarecrow's arm,
   * a rolling bale, a swinging door)?
   */
  private sweptNow(x: number, z: number) {
    const defs = this.def.obstacles ?? [];
    if (!defs.length) return false;
    const poses = this.physics.obstaclePoses();
    const body = 0.3;
    const v = new THREE.Vector3();
    for (let i = 0; i < defs.length; i++) {
      const o = defs[i], q = poses[i];
      const seg = (len0: number, len1: number, k = 0) => {
        v.set(1, 0, 0);
        if (k) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), k);
        v.applyQuaternion(q.q);
        const l = Math.hypot(v.x, v.z) || 1, ux = v.x / l, uz = v.z / l;
        return segDist(x, z, [q.x + ux * len0, q.z + uz * len0], [q.x + ux * len1, q.z + uz * len1]);
      };
      switch (o.kind) {
        case 'spinner':
          for (let k = 0; k < (o.arms ?? 2); k++) if (seg(-o.reach, o.reach, (k / (o.arms ?? 2)) * Math.PI) < body) return true;
          break;
        case 'windmill': {
          // The sails turn upright across the way: only the lower ones reach a golfer.
          const a = -(o.angle ?? 0), ux = Math.cos(a), uz = -Math.sin(a);
          if (segDist(x, z, [q.x - ux * o.reach, q.z - uz * o.reach], [q.x + ux * o.reach, q.z + uz * o.reach]) < body) return true;
          break;
        }
        case 'slider':
          if (seg(-0.42, 0.42) < body + 0.28) return true;
          break;
        case 'gate':
          if (seg(0, o.length) < body) return true;
          break;
      }
    }
    return false;
  }

  /** Which side of the ball the golfer is on (+1: to the right of the line, -1: to the left). */
  private golferSide = 1;

  constructor(readonly def: HoleDef, readonly number: number, readonly players: PlayerSlot[]) {
    this.shape = buildShape(def);
    this.course = new Course(this.shape, number);
    this.group.add(this.course.group);
    this.physics = new HolePhysics(this.shape);
    this.strokes = players.map(() => null);
    for (const p of players) {
      p.golfer.root.visible = false;
      this.group.add(p.golfer.root);
    }
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 18, 12), new THREE.MeshToonMaterial({ color: 0xffffff }));
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);
    // The aiming line: white dots along the path, and a chevron at the ball.
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.025, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), 200);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    const chev = new THREE.Shape();
    chev.moveTo(0, 0.22); chev.lineTo(0.1, 0.1); chev.lineTo(0.05, 0.1); chev.lineTo(0.05, 0); chev.lineTo(-0.05, 0); chev.lineTo(-0.05, 0.1); chev.lineTo(-0.1, 0.1); chev.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.group.add(this.arrow);
    this.group.add(this.confetti.mesh);
    this.startTurn(0, true);
    this.phase = 'flyover';
  }

  get player() {
    return this.players[this.turn];
  }

  get dir(): [number, number] {
    return [Math.sin(this.aim), -Math.cos(this.aim)];
  }

  private setPhase(p: HolePhase) {
    this.phase = p;
    this.phaseT = 0;
  }

  /** A player's go: their ball on the tee, their golfer beside it, aiming at the cup. */
  private startTurn(i: number, first = false) {
    this.players.forEach((p) => (p.golfer.root.visible = true));
    this.standAside(i);
    this.turn = i;
    this.strokes[i] = 0;
    const [tx, tz] = this.def.tee;
    this.physics.place(tx, tz);
    (this.ballMesh.material as THREE.MeshToonMaterial).color.setHex(this.players[i].color);
    this.aimAtCup();
    const g = this.player.golfer;
    const a = this.address();
    g.placeAt(a.x, a.y, a.z, a.yaw);
    g.setPose('putt');
    this.lastPower = null;
    this.cpu = null;
    if (!first) this.events.push({ kind: 'banner', text: `${this.player.name}'s turn`, sub: `Hole ${this.number} · Par ${this.def.par}`, time: 1.8 });
    this.setPhase('aim');
  }

  /** Everyone else waits behind the tee, side by side, watching. */
  private standAside(current: number) {
    const [tx, tz] = this.def.tee, [cx, cz] = this.def.cup;
    const l = Math.hypot(cx - tx, cz - tz) || 1;
    const ux = (cx - tx) / l, uz = (cz - tz) / l;
    const others = this.players.filter((_, j) => j !== current);
    others.forEach((p, k) => {
      const side = (k - (others.length - 1) / 2) * 0.8;
      const x = tx - ux * 2.1 - uz * side, z = tz - uz * 2.1 + ux * side;
      p.golfer.setLeft(false);
      p.golfer.placeAt(x, this.groundAt(x, z), z, Math.atan2(ux, uz));
      p.golfer.setPose('idle');
    });
  }

  private aimAtCup() {
    const p = this.physics.pos, [cx, cz] = this.def.cup;
    this.aim = Math.atan2(cx - p.x, -(cz - p.z));
  }

  /** The ground where someone stands: the hole's surface, or the bank round it. */
  private groundAt(x: number, z: number) {
    const inside = insidePoly(x, z, this.def.outline) && !(this.def.blocks ?? []).some((b) => insidePoly(x, z, b));
    return inside ? this.shape.heightAt(x, z) : this.course.groundAt(x, z);
  }

  /**
   * Is something in the way of standing here (a hedge, a post, a building, a pond, or where a sail,
   * a bale or a door sweeps)? Checks round the golfer's feet and body.
   */
  private blocked(x: number, z: number, moving = true) {
    const def = this.def;
    const near = (px: number, pz: number, r: number) => Math.hypot(x - px, z - pz) < r;
    const along = (a: [number, number], ang: number, half: number, wide: number) => {
      const dx = Math.sin(ang), dz = -Math.cos(ang);
      return segDist(x, z, [a[0] - dx * half, a[1] - dz * half], [a[0] + dx * half, a[1] + dz * half]) < wide;
    };
    for (const b of def.blocks ?? []) {
      if (insidePoly(x, z, b)) return true;
      for (let i = 0; i < b.length; i++) if (segDist(x, z, b[i], b[(i + 1) % b.length]) < 0.16) return true;
    }
    for (const w of def.water ?? []) if (insidePoly(x, z, w)) return true;
    for (const [px, pz, pr] of this.shape.posts) if (near(px, pz, pr + 0.2)) return true;
    for (const o of moving ? def.obstacles ?? [] : []) {
      switch (o.kind) {
        case 'spinner': if (near(o.at[0], o.at[1], o.reach + 0.3)) return true; break;
        case 'windmill': if (along(o.at, (o.angle ?? 0) + Math.PI / 2, o.reach + 0.1, 0.35)) return true; break;
        case 'slider': if (along(o.at, o.angle ?? Math.PI / 2, o.travel + 0.5, 0.5)) return true; break;
        case 'gate': if (near(o.at[0], o.at[1], o.length + 0.2)) return true; break;
      }
    }
    for (const p of def.props ?? []) {
      if (p.kind === 'windmill' && along(p.at, p.angle + Math.PI / 2, 1.7, 0.9)) return true;
      if (p.kind === 'barn' && along(p.at, p.angle + Math.PI / 2, p.width / 2 + 0.1, 0.65)) return true;
    }
    for (const c of def.covers ?? []) if (segDist(x, z, c.a, c.b) < c.width / 2 + 0.25) return true;
    for (const l of def.loops ?? []) if (near(l.at[0], l.at[1], l.radius + 0.35)) return true;
    for (const pipe of def.pipes ?? []) if (near(pipe.from[0], pipe.from[1], 0.35) || near(pipe.to[0], pipe.to[1], 0.35)) return true;
    return false;
  }

  /** Where you can't walk (built once per hole): a grid over the hole and its bank, 20 cm cells. */
  private walkGrid: { x0: number; z0: number; nx: number; nz: number; C: number; solid: Uint8Array } | null = null;

  private grid() {
    if (this.walkGrid) return this.walkGrid;
    const C = 0.2, M = 2.5, s = this.shape;
    const x0 = s.min[0] - M, z0 = s.min[1] - M;
    const nx = Math.ceil((s.max[0] - s.min[0] + 2 * M) / C), nz = Math.ceil((s.max[1] - s.min[1] + 2 * M) / C);
    const solid = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) solid[j * nx + i] = this.blocked(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C) ? 1 : 0;
    this.walkGrid = { x0, z0, nx, nz, C, solid };
    return this.walkGrid;
  }

  /** The height to step at here: the ground, or the top rail when stepping over a wall. */
  private stepY(x: number, z: number) {
    let y = this.groundAt(x, z);
    const outside = !insidePoly(x, z, this.def.outline);
    for (const w of this.shape.wallsNear(x, z)) {
      const d = segDist(x, z, w.a, w.b);
      if (d < 0.3 && (outside || d < 0.06)) {
        const [ax, az] = w.a, [bx, bz] = w.b, ex = bx - ax, ez = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
        y = Math.max(y, this.shape.heightAt(ax + ex * t, az + ez * t) + WALL.height + 0.035);
      }
    }
    return y;
  }

  /**
   * A way to walk from one spot to another that goes round hedges, ponds, buildings and things that
   * move (a search over the grid), steps up onto walls and over them, and follows the ground: points
   * every 15 cm, each at the height to step at.
   */
  private planWalk(fx: number, fz: number, tx: number, tz: number) {
    const G = this.grid(), { x0, z0, nx, nz, C, solid } = G;
    const cell = (x: number, z: number) => {
      const i = Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / C))), j = Math.max(0, Math.min(nz - 1, Math.floor((z - z0) / C)));
      return j * nx + i;
    };
    const start = cell(fx, fz), goal = cell(tx, tz);
    const open = (k: number) => !solid[k] || k === start || k === goal;
    const cx = (k: number) => x0 + ((k % nx) + 0.5) * C, cz = (k: number) => z0 + (Math.floor(k / nx) + 0.5) * C;
    // A* (8 ways), with a small binary heap.
    const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1);
    const heap: [number, number][] = [];
    const push = (f: number, k: number) => {
      heap.push([f, k]);
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const hDist = (k: number) => Math.hypot(cx(k) - tx, cz(k) - tz);
    g[start] = 0;
    push(hDist(start), start);
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (k === goal) { found = true; break; }
      const i = k % nx, j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = jj * nx + ii;
        // Through something solid only if there's no other way (starting inside a hedge, say), and no
        // cutting corners past it.
        const cost = !open(n) || (di && dj && (!open(j * nx + ii) || !open(jj * nx + i))) ? 30 : 1;
        const ng = g[k] + (di && dj ? 1.414 : 1) * C * cost;
        if (ng < g[n]) { g[n] = ng; came[n] = k; push(ng + hDist(n), n); }
      }
    }
    // The corners of the way (straight there if there's no way round).
    let corners: [number, number][] = [[fx, fz], [tx, tz]];
    if (found) {
      const cells: number[] = [];
      for (let k = goal; k !== -1; k = came[k]) cells.unshift(k);
      const pts: [number, number][] = [[fx, fz], ...cells.slice(1, -1).map((k) => [cx(k), cz(k)] as [number, number]), [tx, tz]];
      // Pull the string tight: skip ahead to the furthest point in clear sight.
      const clear = (a: [number, number], b: [number, number]) => {
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08);
        for (let s = 1; s < n; s++) { const k = cell(a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n); if (!open(k)) return false; }
        return true;
      };
      corners = [pts[0]];
      for (let i = 0; i < pts.length - 1;) {
        let j = pts.length - 1;
        while (j > i + 1 && !clear(pts[i], pts[j])) j--;
        corners.push(pts[j]);
        i = j;
      }
    }
    // Points along it every 15 cm, at stepping height (the last one's the address spot itself).
    const out: P3[] = [];
    for (let c = 0; c < corners.length - 1; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[c + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.15));
      for (let s = 1; s <= n; s++) {
        if (c === corners.length - 2 && s === n) break;
        const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
        out.push({ x, y: this.stepY(x, z), z });
      }
    }
    return out;
  }

  /**
   * Where the golfer stands to putt: on their usual side if there's room, otherwise round the other
   * side (left-handed); if neither is clear, see-through so they don't hide in a hedge.
   */
  private address() {
    const p = this.physics.pos, [dx, dz] = this.dir;
    const g = this.player.golfer;
    const spot = (left: boolean, moving: boolean) => {
      const a = g.addressSpot(p.x, p.y, p.z, dx, dz, left);
      // The body's middle is a little behind the feet spot; check both.
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      const clear = !this.blocked(a.x, a.z, moving) && !this.blocked(a.x - fx * 0.12, a.z - fz * 0.12, moving);
      return { a, clear, left };
    };
    // Best: a side clear of everything, even where things sweep past; then a side clear of anything
    // solid that stays put (sails and bales then pass through now and then: see-through just then).
    const prefer = this.golferSide < 0;
    const tries = [spot(prefer, true), spot(!prefer, true), spot(prefer, false), spot(!prefer, false)];
    const pick = tries.find((t) => t.clear) ?? tries[2];
    const left = pick.left;
    g.setLeft(left);
    this.golferSide = left ? -1 : 1;
    const a = pick.a;
    return { ...a, y: Math.max(this.groundAt(a.x, a.z), p.y - BALL.radius - 0.4) };
  }

  /** One fixed step of play. */
  update(dt: number, input: PadInput) {
    this.phaseT += dt;
    const g = this.player.golfer;
    const b = input.b;
    const anyPress = b.swing.pressed || b.view.pressed;
    switch (this.phase) {
      case 'flyover':
        if (this.phaseT > 4 || (anyPress && this.phaseT > 0.3)) {
          this.setPhase('aim');
          this.events.push({ kind: 'banner', text: `HOLE ${this.number}`, sub: `${this.def.name} · Par ${this.def.par}`, time: 2 });
        }
        break;
      case 'aim': {
        if (this.player.cpu) { if (!g.walking) this.cpuAim(dt); g.swing = 0; g.setPose('putt'); break; }
        if (b.view.pressed) this.overview = !this.overview;
        if (g.walking) break;
        // Turn the aim (slowly with the fine-aim button held).
        const rate = b.fine.down ? PUTT.turnFine : PUTT.turn;
        if (Math.abs(input.moveX) > 0.05) {
          this.aim += input.moveX * rate * dt * (0.4 + 0.6 * Math.abs(input.moveX));
          const a = this.address();
          g.placeAt(a.x, a.y, a.z, a.yaw);
        }
        // Skip (hold): it counts as ten.
        this.skipHeld = b.skip.down ? this.skipHeld + dt : 0;
        if (this.skipHeld > 0.8) { this.giveUp('SKIPPED'); break; }
        if (b.swing.pressed) { this.overview = false; this.setPhase('charge'); this.power = 0; }
        g.swing = 0;
        g.setPose('putt');
        break;
      }
      case 'charge': {
        // The gauge fills, then drops back while you keep holding (so you can't overcook it by waiting).
        const u = (this.phaseT / PUTT.fill) % 2;
        this.power = u < 1 ? u : 2 - u;
        g.swing = -Math.max(0.05, this.power);
        if (Math.abs(input.moveX) > 0.05 && !this.player.cpu) {
          this.aim += input.moveX * PUTT.turnFine * dt;
          const a = this.address();
          g.placeAt(a.x, a.y, a.z, a.yaw);
        }
        const release = this.player.cpu ? !!this.cpu?.target && (this.power >= this.cpu.target.power - 0.002 || this.phaseT >= PUTT.fill) : !b.swing.down;
        if (release) {
          this.swingFrom = g.swing;
          this.hit = false;
          SFX.swoosh(this.power);
          this.setPhase('swing');
        }
        break;
      }
      case 'swing': {
        // Down through the ball quickly (quicker for harder putts), then hold the follow-through.
        const dur = 0.16 + 0.1 * (1 - this.power);
        const u = Math.min(1, this.phaseT / dur);
        g.swing = this.swingFrom + (Math.max(0.15, this.power) * 0.9 - this.swingFrom) * (u * u * (3 - 2 * u));
        if (!this.hit && g.swing >= 0) {
          this.hit = true;
          const speed = speedFor(this.power);
          const [dx, dz] = this.dir;
          this.lastSpot = [this.physics.pos.x, this.physics.pos.z];
          this.physics.putt(dx, dz, speed);
          this.strokes[this.turn]! += 1;
          this.lastPower = this.power;
          SFX.putt(this.power);
        }
        if (this.hit) this.roll(dt);
        if (this.phaseT > dur + 0.45 && this.phase === 'swing') { g.setPose('watch'); this.setPhase('roll'); }
        break;
      }
      case 'roll':
        this.roll(dt);
        break;
      case 'sunk': {
        // The ball drops into the cup.
        this.dropT += dt;
        if (this.phaseT > 3.4) this.nextPlayer();
        break;
      }
      case 'next':
        if (this.phaseT > 1.6) this.nextPlayer();
        break;
      case 'done':
        break;
    }
    // The world keeps going whatever we're doing: sails turn, bales roll (and may knock a ball that's
    // sitting still).
    if (!(this.phase === 'roll' || (this.phase === 'swing' && this.hit))) this.roll(dt);
    if (this.freezeSwing !== null) { g.swing = this.freezeSwing; g.setPose('putt'); }
    for (const p of this.players) {
      p.golfer.update(dt);
      // See-through only while inside something, or while something's passing through them.
      const r = p.golfer.root.position;
      p.golfer.setGhost(this.insideSolid(r.x, r.z) || this.sweptNow(r.x, r.z));
    }
  }

  /**
   * The computer lines up: thinks (searching for the best putt a slice at a time), turns to it (with
   * a little wobble, more for an easy computer), settles, then holds the button to the power it wants.
   */
  private cpuAim(dt: number) {
    const p = this.physics.pos;
    this.cpu ??= { search: new ShotSearch(this.shape, p.x, p.z), t: 0, target: null, ready: 0 };
    const c = this.cpu;
    c.t += dt;
    if (!c.search.done) { c.search.step(8); return; }
    if (!c.target) {
      const best = c.search.result(), skill = CPU_SKILL[this.player.cpu!];
      c.target = { aim: best.aim + gauss() * skill.aim, power: Math.max(0.03, Math.min(1, best.power * (1 + gauss() * skill.power))) };
    }
    if (c.t < 0.9) return;
    // Turn toward it.
    let d = c.target.aim - this.aim;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const step = Math.sign(d) * Math.min(Math.abs(d), PUTT.turn * 0.8 * dt);
    if (Math.abs(d) > 1e-4) {
      this.aim += step;
      const a = this.address();
      this.player.golfer.placeAt(a.x, a.y, a.z, a.yaw);
      c.ready = 0;
      return;
    }
    c.ready += dt;
    if (c.ready > 0.45) { this.setPhase('charge'); this.power = 0; }
  }

  /** Tools: take a putt now with this aim and power (as if the gauge had been let go there). */
  autoShot(aim: number, power: number) {
    if (this.phase !== 'aim' || this.player.golfer.walking) return false;
    this.aim = aim;
    const a = this.address();
    this.player.golfer.placeAt(a.x, a.y, a.z, a.yaw);
    this.power = power;
    this.swingFrom = -power;
    this.player.golfer.swing = -power;
    this.hit = false;
    this.setPhase('swing');
    return true;
  }

  /**
   * The best putt from where the ball is, found by trying aims and powers through the prediction:
   * one that drops if there is one, otherwise the one that finishes nearest the cup.
   */
  bestShot(): { aim: number; power: number; holed: boolean } {
    const p = this.physics.pos;
    return new ShotSearch(this.shape, p.x, p.z).result();
  }

  /** Step the physics and react to what the ball does. */
  private roll(dt: number) {
    const events = this.physics.step(dt);
    // Knocked while we were lining up: watch where it goes.
    if (events.length && (this.phase === 'aim' || this.phase === 'charge') && this.physics.moving) {
      this.player.golfer.setPose('watch');
      this.setPhase('roll');
    }
    for (const e of events) {
      switch (e.kind) {
        case 'wall': SFX.wall(e.speed, e.what === 'rock' || (e.what === 'wall' && this.def.walls === 'stone') ? 'stone' : 'wood'); break;
        case 'thud': SFX.thud(e.speed); break;
        case 'pipeIn': SFX.pipe(true); break;
        case 'pipeOut': SFX.pipe(false); break;
        case 'water':
          // Splash: one stroke penalty, back where it was hit from.
          this.strokes[this.turn]! += 1;
          this.events.push({ kind: 'banner', text: 'SPLASH!', sub: '+1 stroke · back you go', time: 1.8, color: '#7ac8f0' });
          SFX.splash();
          this.splashAt(this.physics.pos.x, this.physics.pos.z);
          this.physics.place(...this.lastSpot);
          this.afterStop();
          return;
        case 'bounce': SFX.bounce(e.speed); break;
        case 'boing': SFX.boing(e.speed); break;
        case 'loopIn': SFX.loopTrack(); break;
        case 'loopOut': SFX.loopTrack(e.made); if (e.made) this.events.push({ kind: 'banner', text: 'LOOP!', time: 1.1, color: '#8ae0ff' }); break;
        case 'lip': SFX.lip(); break;
        case 'cup': this.holed(); return;
        case 'lost':
          // Off the course: back where it was, one stroke penalty.
          this.strokes[this.turn]! += 1;
          this.events.push({ kind: 'banner', text: 'OUT!', sub: '+1 stroke', time: 1.6, color: '#ffd040' });
          this.physics.place(...this.lastSpot);
          this.afterStop();
          return;
        case 'stopped':
          this.afterStop();
          return;
      }
    }
  }

  /** It's stopped: out of strokes, or walk up for the next one. */
  private afterStop() {
    this.cpu = null;
    if (this.strokes[this.turn]! >= PHYS.maxStrokes) { this.giveUp('PICKED UP'); return; }
    this.aimAtCup();
    const a = this.address();
    const g = this.player.golfer;
    const r = g.root.position;
    g.walkTo(a.x, a.y, a.z, a.yaw, this.planWalk(r.x, r.z, a.x, a.z));
    g.setPose('idle');
    this.setPhase('aim');
  }

  private holed() {
    const s = this.strokes[this.turn]!, par = this.def.par;
    const name = scoreName(s, par);
    const good = s <= par;
    this.events.push({ kind: 'banner', text: name, sub: `${this.player.name} · ${s} ${s === 1 ? 'stroke' : 'strokes'}`, time: 3, color: s === 1 ? '#ffd040' : undefined });
    // Every ball that drops gets a cheer: a big one (jump, confetti, fanfare) for par or better,
    // a light one (fist pump, a happy "ding-ding") otherwise.
    SFX.cup(s === 1 ? 'ace' : good ? 'good' : 'ok');
    SFX.voice(this.player.voice, true);
    this.player.golfer.setPose(good ? 'joy' : 'pump');
    this.confettiT = good ? (s === 1 ? 2.2 : 0.9) : 0;
    this.dropT = 0;
    this.setPhase('sunk');
  }

  private giveUp(text: string) {
    this.strokes[this.turn] = PHYS.maxStrokes;
    this.events.push({ kind: 'banner', text, sub: `${this.player.name} · ${PHYS.maxStrokes} strokes`, time: 2, color: '#ffd040' });
    SFX.aww();
    this.player.golfer.setPose('sulk');
    this.physics.moving = false;
    this.setPhase('next');
  }

  private nextPlayer() {
    const next = this.strokes.findIndex((s) => s === null);
    if (next < 0) { this.setPhase('done'); return; }
    this.startTurn(next);
  }

  /** Each frame: ball, aiming line, flag, and where the camera wants to be. */
  render(dt: number, camera: THREE.PerspectiveCamera) {
    const p = this.physics.pos;
    this.ballMesh.visible = !this.physics.inPipe;
    this.course.setObstacles(this.physics.obstaclePoses());
    this.ballMesh.position.copy(p);
    this.ballMesh.quaternion.copy(this.physics.quat);
    if (this.phase === 'sunk') {
      // Drop it in.
      const [cx, cz] = this.def.cup;
      const k = Math.min(1, this.dropT / 0.25);
      this.ballMesh.position.set(p.x + (cx - p.x) * k, this.physics.cupY + BALL.radius - k * 0.2, p.z + (cz - p.z) * k);
    }
    this.course.update(dt);
    // Confetti bursting out of the cup (lots for a hole-in-one).
    if (this.confettiT > 0) {
      this.confettiT -= dt;
      const [cx, cz] = this.def.cup;
      const colors = [0xf04040, 0xf0c020, 0x40b0f0, 0x60d060, 0xf080c0, 0xffffff];
      this.confetti.burst({ x: cx, y: this.physics.cupY + 0.1, z: cz, count: 6, color: colors[Math.floor(Math.random() * colors.length)], speed: 2.5, up: 4.5, size: 0.05, life: 2.2, gravity: 5 });
    }
    this.confetti.update(dt);
    // The flag comes out when someone's putting close to the hole.
    const [cx, cz] = this.def.cup;
    const near = Math.hypot(p.x - cx, p.z - cz) < 2.2 && (this.phase === 'roll' || this.phase === 'swing');
    this.course.flagPole.visible = !near;
    this.drawAim();
    this.updateCamera(dt, camera);
    // What the ball's rolling on, for the sound: the carpet's nearly silent; planks rumble and click.
    const ph = this.physics;
    const on = ph.inLoop ? 'loop' : (this.def.planks ?? []).some((pl) => insidePoly(p.x, p.z, pl)) ? 'wood' : onSand(this.shape, p.x, p.z) ? 'sand' : 'carpet';
    SFX.update(dt, ph.inLoop ? ph.inLoop.v : ph.moving && ph.grounded ? ph.vel.length() : 0, on);
  }

  /** Water flying up where the ball went in. */
  private splashAt(x: number, z: number) {
    const y = this.shape.heightAt(x, z) + 0.2;
    this.confetti.burst({ x, y, z, count: 26, color: 0x9ad8ff, speed: 1.6, up: 2.6, size: 0.04, life: 0.8, gravity: 9 });
  }

  /** The dotted path (as far as this hole allows) while aiming. */
  private drawAim() {
    const aiming = this.phase === 'aim' || this.phase === 'charge';
    const g = this.player.golfer;
    if (!aiming || g.walking || this.overview) {
      this.dots.count = 0;
      this.arrow.visible = false;
      this.aimPath = null;
      return;
    }
    const p = this.physics.pos, [dx, dz] = this.dir;
    const pw = this.phase === 'charge' ? this.power : this.lastPower ?? 0.35;
    const speed = speedFor(pw);
    const pred = predict(this.shape, p.x, p.z, dx, dz, speed, this.def.preview);
    this.aimPath = pred.path;
    const m = new THREE.Matrix4();
    let n = 0, acc = 0;
    const h = this.shape.heightAt;
    for (let i = 1; i < pred.path.length && n < 200; i++) {
      const [ax, az] = pred.path[i - 1], [bx, bz] = pred.path[i];
      // (A gap in the path: through a pipe.)
      if (Number.isNaN(ax) || Number.isNaN(bx)) continue;
      acc += Math.hypot(bx - ax, bz - az);
      if (acc >= 0.18) {
        acc = 0;
        m.makeTranslation(bx, h(bx, bz) + 0.012, bz);
        this.dots.setMatrixAt(n++, m);
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    this.arrow.visible = true;
    this.arrow.position.set(p.x + dx * 0.12, p.y - BALL.radius + 0.01, p.z + dz * 0.12);
    this.arrow.rotation.y = -this.aim;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    this.arrow.scale.setScalar(pulse * (1 + pw * 0.6));
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera) {
    const s = this.shape, p = this.physics.pos;
    const [dx, dz] = this.dir;
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
    const mid = new THREE.Vector3((s.min[0] + s.max[0]) / 2, p.y, (s.min[1] + s.max[1]) / 2);
    const span = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1]);
    const [tx, tz] = this.def.tee, [cx, cz] = this.def.cup;
    const tc = new THREE.Vector3(cx - tx, 0, cz - tz).normalize();
    let rate = 3;
    if (this.phase === 'flyover') {
      // From high over the cup, down the hole to behind the tee.
      const u = Math.min(1, this.phaseT / 3.6), e = u * u * (3 - 2 * u);
      const from = new THREE.Vector3(cx, this.physics.cupY + 7, cz).addScaledVector(tc, 3);
      const to = new THREE.Vector3(tx, this.shape.heightAt(tx, tz) + 2, tz).addScaledVector(tc, -3.2);
      wantPos.lerpVectors(from, to, e);
      wantLook.lerpVectors(new THREE.Vector3(cx, this.physics.cupY, cz), new THREE.Vector3(tx, 0, tz).addScaledVector(tc, 4), e);
      wantLook.y = this.shape.heightAt(wantLook.x, wantLook.z);
      rate = 20;
    } else if (this.overview) {
      // The whole hole from above, tee at the bottom.
      wantPos.copy(mid).addScaledVector(tc, -span * 0.45).add(new THREE.Vector3(0, span * 0.95 + 3, 0));
      wantLook.copy(mid);
    } else if ((this.phase === 'sunk' && this.phaseT > 1.1) || this.phase === 'next') {
      // The reaction: round in front of the golfer (jumping for joy, or sulking).
      const g = this.player.golfer.root.position;
      const f = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.golfer.yaw);
      wantPos.set(g.x + f.x * 2.4 + dx * 0.6, g.y + 1.1, g.z + f.z * 2.4 + dz * 0.6);
      wantLook.set(g.x, g.y + 0.65, g.z);
      rate = 2.5;
    } else if (this.physics.inLoop) {
      // Round the loop: watch it from the side.
      const l = this.physics.inLoop.loop, ldx = Math.sin(l.angle), ldz = -Math.cos(l.angle);
      const gy = this.shape.heightAt(l.at[0], l.at[1]);
      const mx = l.at[0] - ldz * 0.15, mz = l.at[1] + ldx * 0.15;
      wantPos.set(mx - ldz * 2.4 - ldx * 0.8, gy + l.radius + 0.5, mz + ldx * 2.4 - ldz * 0.8);
      wantLook.set(mx, gy + l.radius, mz);
      rate = 4;
    } else if (this.phase === 'roll' || this.phase === 'sunk' || (this.phase === 'swing' && this.phaseT > 0.5)) {
      // Follow the ball (from behind the line it was hit along).
      wantPos.set(p.x - dx * 3.4, p.y + 2.1, p.z - dz * 3.4);
      wantLook.set(p.x + dx * 1.2, p.y, p.z + dz * 1.2);
      rate = 2.2;
    } else {
      // Behind the ball, down the line, off to the side away from the golfer: the way ahead is clear,
      // and you see the golfer side-on over the ball. Holding for power, it swings round a little more
      // to the side so you see the swing.
      const rx = -dz, rz = dx, side = -this.golferSide;
      const swinging = this.phase === 'charge' || this.phase === 'swing';
      const back = swinging ? 2.3 : 2.9, lat = swinging ? 1.25 : 0.8, up = swinging ? 1.2 : 1.45;
      wantPos.set(p.x - dx * back + rx * lat * side, p.y + up, p.z - dz * back + rz * lat * side);
      wantLook.set(p.x + dx * 2.4, p.y, p.z + dz * 2.4);
      rate = swinging ? 2.5 : 5;
    }
    if (this.camOverride) { wantPos.copy(this.camOverride.pos); wantLook.copy(this.camOverride.look); rate = 100; }
    const c = this.cam;
    if (!c.init) { c.pos.copy(wantPos); c.look.copy(wantLook); c.init = true; }
    const k = 1 - Math.exp(-dt * rate);
    c.pos.lerp(wantPos, k);
    c.look.lerp(wantLook, k);
    camera.position.copy(c.pos);
    camera.lookAt(c.look);
  }

  /** The balls for the mini-map. */
  mapBalls() {
    const p = this.physics.pos;
    return [{ x: p.x, z: p.z, color: `#${this.player.color.toString(16).padStart(6, '0')}`, current: true }];
  }

  get cupRadius() {
    return CUP.radius;
  }

  dispose() {
    this.physics.dispose();
    this.course.dispose();
    this.group.removeFromParent();
  }
}
