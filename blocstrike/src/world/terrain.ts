import { NavGrid } from '@engine/navgrid';
import { allProps, mirror, type ArenaDef, type LiquidKind, type PropKind } from '../data/arenas';
import {
  circleOutOfBox, depthIn, inBox, nearestOnPolygon, outline, pointInPolygon,
  segmentBox, segmentPolygon, toBox, type Box, type Pt,
} from './shapes';
import { segmentCircle } from '@engine/math';
import { TUNING } from '../data/tuning';

/** How tough each kind of prop is. hp = explosions needed; flammable ones burn down in flames. */
export const PROP_INFO: Record<PropKind, { hp: number; flammable: boolean }> = {
  tree: { hp: 1, flammable: true },
  jungleTree: { hp: 1, flammable: true },
  palm: { hp: 1, flammable: true },
  deadTree: { hp: 1, flammable: true },
  crate: { hp: 1, flammable: true },
  rock: { hp: 2, flammable: false },
  pillar: { hp: 2, flammable: false },
  sandcastle: { hp: 1, flammable: false },
};

/** Seconds in the flames before a tree or crate burns down. */
export const BURN_DOWN = 1.5;

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  z: number;
  r: number;
  hp: number;
  burn: number;
  alive: boolean;
}

export interface BridgeState {
  box: Box;
  style: 'wood' | 'stone' | 'log';
  moving: boolean;
  period: number;
  offset: number;
  /** 0 = pulled in, 1 = fully out. */
  ext: number;
  /** About to pull in: flash and warn. */
  warn: boolean;
}

export interface GateState {
  box: Box;
  period: number;
  offset: number;
  /** 0 = sunk in the ground, 1 = fully up. */
  h: number;
  warn: boolean;
}

export interface SegmentHit {
  t: number;
  prop?: Prop;
  gate?: GateState;
  wall?: boolean;
}

const GATE_THICK = 0.3;

/** Up/down cycle shared by gates and sliding bridges: fraction of the period → level 0..1. */
function cycle(f: number, upFrom: number, upTo: number, ramp: number) {
  if (f < upFrom - ramp || f >= upTo + ramp) return 0;
  if (f < upFrom) return (f - (upFrom - ramp)) / ramp;
  if (f < upTo) return 1;
  return 1 - (f - upTo) / ramp;
}

/** The arena's rules: where you can walk, what's deadly, what blocks you. No drawing here. */
export class Terrain {
  readonly landPoly: Pt[];
  readonly wallEdge: boolean;
  readonly props: Prop[];
  readonly bridges: BridgeState[];
  readonly gates: GateState[];
  readonly nav: NavGrid;
  time = 0;
  /** Set when something moved or broke and computer players need fresh paths. */
  navDirty = true;

  constructor(readonly def: ArenaDef) {
    this.landPoly = outline(def.land);
    this.wallEdge = def.edge !== 'lava';
    this.props = allProps(def).map((p, i) => ({ id: i, kind: p.kind, x: p.x, z: p.z, r: p.r ?? 0.7, hp: PROP_INFO[p.kind].hp, burn: 0, alive: true }));
    this.bridges = def.bridges.map((b) => ({
      box: { x: b.x, z: b.z, hl: b.length / 2, ht: b.width / 2, angle: b.angle },
      style: b.style,
      moving: !!b.moving,
      period: b.moving?.period ?? 1,
      offset: b.moving?.offset ?? 0,
      ext: 1,
      warn: false,
    }));
    this.gates = def.gates.map((g) => ({
      box: { x: g.x, z: g.z, hl: g.length / 2, ht: GATE_THICK, angle: g.angle },
      period: g.period,
      offset: g.offset,
      h: 0,
      warn: false,
    }));
    this.nav = new NavGrid(-def.halfW, -def.halfD, def.halfW * 2, def.halfD * 2, 0.5);
    this.update(0);
    this.rebuildNav();
  }

  /** Back to the start of a round: props regrow, moving parts reset. */
  reset() {
    for (const p of this.props) {
      p.alive = true;
      p.hp = PROP_INFO[p.kind].hp;
      p.burn = 0;
    }
    this.time = 0;
    this.update(0);
    this.navDirty = true;
  }

  // ───────── moving parts ─────────

  /** Shoreline z at x right now (sea is beyond it). */
  shoreZ(x: number, worstCase = false) {
    const s = this.def.shore!;
    const wave = s.amp * (0.6 * Math.sin(x * 0.35 + s.seed) + 0.4 * Math.sin(x * 0.9 + s.seed * 2.1));
    const tide = worstCase ? s.tide : s.tide * (0.5 - 0.5 * Math.cos((2 * Math.PI * this.time) / s.period));
    return s.z + wave - tide;
  }

  /** Advances gates, bridges and tide. Returns what started moving, for sounds. */
  update(dt: number) {
    this.time += dt;
    const events: ('gate' | 'bridge')[] = [];
    for (const b of this.bridges) {
      if (!b.moving) continue;
      const f = (((this.time + b.offset) % b.period) + b.period) % b.period / b.period;
      // Out most of the time; pulls in around 55%–90% of the cycle.
      const ext = 1 - cycle(f, 0.62, 0.88, 0.07);
      if ((ext < 1) !== (b.ext < 1)) { events.push('bridge'); this.navDirty = true; }
      const warn = f > 0.45 && f < 0.62;
      if (warn !== b.warn) this.navDirty = true;
      b.ext = ext;
      b.warn = warn;
    }
    for (const g of this.gates) {
      const f = (((this.time + g.offset) % g.period) + g.period) % g.period / g.period;
      const h = cycle(f, 0.55, 0.9, 0.06);
      if (h > 0 && g.h === 0) events.push('gate');
      if ((h > 0.3) !== (g.h > 0.3)) this.navDirty = true;
      const warn = f > 0.38 && f < 0.55;
      if (warn !== g.warn) this.navDirty = true;
      g.h = h;
      g.warn = warn;
    }
    return events;
  }

  // ───────── ground queries ─────────

  inLand(x: number, z: number) {
    return pointInPolygon(this.landPoly, x, z);
  }

  /**
   * The liquid at a point, ignoring bridges. `margin` > 0 means "this far inside";
   * < 0 means "within this distance of it" (used to keep paths clear).
   */
  liquidAt(x: number, z: number, margin = 0, worstTide = false): LiquidKind | null {
    for (const l of this.def.liquids) if (depthIn(l.shape, x, z) > margin) return l.kind;
    if (this.def.shore && z - this.shoreZ(x, worstTide) > margin) return 'sea';
    if (this.def.edge === 'lava' && !this.inLand(x, z) && nearestOnPolygon(this.landPoly, x, z).d > margin) return 'lava';
    return null;
  }

  onBridge(x: number, z: number, pad = 0) {
    return this.bridges.some((b) => this.bridgeCovers(b, x, z, pad));
  }

  private bridgeCovers(b: BridgeState, x: number, z: number, pad: number) {
    if (!inBox(b.box, x, z, pad)) return false;
    if (b.ext >= 1) return true;
    // Sliding bridge: two halves pulled back towards each bank.
    const [u] = toBox(b.box, x, z);
    return Math.abs(u) >= b.box.hl * (1 - b.ext);
  }

  /** What would get you right now: the liquid you're standing in (bridges keep you safe). */
  deadlyAt(x: number, z: number): LiquidKind | null {
    if (this.onBridge(x, z, -0.1)) return null;
    return this.liquidAt(x, z, 0.25);
  }

  // ───────── solid things ─────────

  /** Push a circle out of props, raised gates and the land edge wall. */
  pushOut(x: number, z: number, r: number) {
    let nx = 0, nz = 0, hit = false;
    for (const p of this.props) {
      if (!p.alive) continue;
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), min = p.r + r;
      if (d < min && d > 1e-5) {
        x = p.x + (dx / d) * min;
        z = p.z + (dz / d) * min;
        nx += dx / d; nz += dz / d; hit = true;
      }
    }
    for (const g of this.gates) {
      if (g.h < 0.3) continue;
      const o = circleOutOfBox(g.box, x, z, r);
      if (o) { x = o.x; z = o.z; nx += o.nx; nz += o.nz; hit = true; }
    }
    if (this.wallEdge) {
      const n = nearestOnPolygon(this.landPoly, x, z);
      const inside = this.inLand(x, z);
      if (!inside || n.d < r) {
        const dx = n.x - x, dz = n.z - z, l = Math.hypot(dx, dz) || 1;
        const ix = inside ? -dx / l : dx / l, iz = inside ? -dz / l : dz / l; // inward
        x = n.x + ix * r;
        z = n.z + iz * r;
        nx += ix; nz += iz; hit = true;
      }
    }
    const { halfW, halfD } = this.def;
    x = Math.max(-halfW - 2, Math.min(halfW + 2, x));
    z = Math.max(-halfD - 2, Math.min(halfD + 2, z));
    const l = Math.hypot(nx, nz) || 1;
    return { x, z, nx: nx / l, nz: nz / l, hit };
  }

  /** First solid thing a flying object from a to b runs into (props, raised gates, walls, arena limits). */
  segmentHit(ax: number, az: number, bx: number, bz: number, pad = 0.05): SegmentHit | null {
    let best: SegmentHit | null = null;
    for (const p of this.props) {
      if (!p.alive) continue;
      const t = segmentCircle(ax, az, bx, bz, p.x, p.z, p.r + pad);
      if (t !== null && (!best || t < best.t)) best = { t, prop: p };
    }
    for (const g of this.gates) {
      if (g.h < 0.3) continue;
      const t = segmentBox(g.box, ax, az, bx, bz, pad);
      if (t !== null && (!best || t < best.t)) best = { t, gate: g };
    }
    if (this.wallEdge && this.inLand(ax, az)) {
      const t = segmentPolygon(this.landPoly, ax, az, bx, bz);
      if (t !== null && (!best || t < best.t)) best = { t, wall: true };
    }
    const { halfW, halfD } = this.def;
    const lim = (from: number, to: number, l: number) => (Math.abs(to) > l ? (Math.sign(to) * l - from) / (to - from) : null);
    for (const t of [lim(ax, bx, halfW + 1), lim(az, bz, halfD + 1)]) {
      if (t !== null && t >= 0 && (!best || t < best.t)) best = { t, wall: true };
    }
    return best;
  }

  clearLine(ax: number, az: number, bx: number, bz: number, pad = 0.1) {
    return this.segmentHit(ax, az, bx, bz, pad) === null;
  }

  /** An explosion: props inside lose a hit point. Returns the ones destroyed. */
  blast(x: number, z: number, radius: number) {
    const broken: Prop[] = [];
    for (const p of this.props) {
      if (!p.alive || Math.hypot(p.x - x, p.z - z) > radius + p.r) continue;
      p.hp--;
      if (p.hp <= 0) { p.alive = false; broken.push(p); this.navDirty = true; }
    }
    return broken;
  }

  /** Flames on a prop. Returns true when it burns down. */
  burn(p: Prop, dt: number) {
    if (!p.alive || !PROP_INFO[p.kind].flammable) return false;
    p.burn += dt;
    if (p.burn < BURN_DOWN) return false;
    p.alive = false;
    this.navDirty = true;
    return true;
  }

  // ───────── spawning & paths ─────────

  spawnFor(team: number) {
    const s = this.def.spawn;
    const t = (p: [number, number]) => (team === 0 ? p : mirror(this.def, p[0], p[1]));
    return { blocs: s.blocs.map(t), bunny: t(s.bunny) };
  }

  /** Recompute where computer players can walk. Bridges about to slide away and gates about to rise count as blocked. */
  rebuildNav() {
    const pad = TUNING.bloc.radius + 0.15;
    this.nav.blocked.fill(0);
    this.nav.mark((x, z) => {
      if (this.wallEdge && (!this.inLand(x, z) || nearestOnPolygon(this.landPoly, x, z).d < pad)) return true;
      if (this.props.some((p) => p.alive && Math.hypot(p.x - x, p.z - z) < p.r + pad)) return true;
      if (this.gates.some((g) => (g.h > 0 || g.warn) && inBox(g.box, x, z, pad))) return true;
      const bridge = this.bridges.find((b) => inBox(b.box, x, z, -0.25));
      if (bridge && (!bridge.moving || (bridge.ext >= 1 && !bridge.warn))) return false;
      return this.liquidAt(x, z, -pad - 0.1, true) !== null;
    });
    this.navDirty = false;
  }
}
