// A team's brain: keeps the shape, chases loose balls, presses whoever has the ball, and decides
// what the player on the ball does (shoot, cross, pass, dribble). Also the goalkeepers: angles,
// diving at shots, rushing out, and throwing or kicking the ball back out.
import * as THREE from 'three';
import { BALL, PITCH, PLAYER } from '../data/tuning';
import type { Match, Side } from './match';
import type { Player } from './player';

const L = PITCH.length / 2, W = PITCH.width / 2, GW = PITCH.goalWidth / 2;
const tmp = new THREE.Vector3();

/** Distance from point (px, pz) to the segment a→b. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export class TeamBrain {
  private next = new Map<Player, number>();
  /** Keeper: when they'll react to a shot, and when they'll let go of the ball. */
  private keeperReact = 0;
  private holdUntil = 0;
  /** A teammate making a run in behind while we have the ball: who, which channel, and when. */
  private runner: Player | null = null;
  /** Who had the ball last time we looked (to notice a new carrier). */
  private carrier: Player | null = null;
  private rushed: Player | null = null;
  private runZ = 0;
  private runStart = 0;
  private nextRun = 0;

  constructor(private m: Match, private side: Side) {}

  private get level() {
    return this.side.level;
  }

  /** Is this player run by the brain right now? */
  private mine(p: Player) {
    const r = this.m.restart;
    // The brain also walks your player to the ball for a restart (you take over once they're there).
    return p !== this.m.human || this.m.autopilot || this.side.index !== 0 || (!!r && !r.ready && r.taker === p);
  }

  update(dt: number) {
    const m = this.m, side = this.side, b = m.ball;
    const opp = m.other(side);
    const ours = (b.owner?.side === side) || (b.holder?.side === side);
    const theirs = (b.owner?.side === opp) || (b.holder?.side === opp);
    const phase = m.phase;

    // Who goes for the ball: fastest to reach it (for a loose ball), nearest to the carrier (when defending).
    let chaser: Player | null = null, chaserT = Infinity;
    let presser: Player | null = null, presser2: Player | null = null;
    if (phase === 'play' && !b.owner && !b.holder) {
      for (const p of side.players) {
        if (p.role === 'gk' || p.state === 'down') continue;
        const t = this.reachTime(p);
        if (t < chaserT) { chaserT = t; chaser = p; }
      }
    } else if (phase === 'play' && theirs) {
      const c = b.owner ?? b.holder!;
      const ranked = side.players.filter((p) => p.role !== 'gk').sort((a, q) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z));
      presser = ranked[0] ?? null;
      if (side.extraPress || Math.hypot(c.x - this.ownGoal(), c.z) < 16) presser2 = ranked[1] ?? null;
    }

    // They just passed (or shot, or cleared it): our players carry on as they were for a moment
    // before reacting, so a quick pass actually gets past them.
    const lk = m.lastKick;
    const reading = phase === 'play' && !!lk && lk.side !== side.index && m.time - lk.t < this.level.read && !b.owner;

    this.pickRunner(ours && phase === 'play' ? b.owner : null);
    if (!b.owner) this.carrier = this.rushed = null;

    for (const p of side.players) {
      if (!this.mine(p)) continue;
      p.faceYaw = Math.atan2(b.pos.x - p.x, b.pos.z - p.z);
      if (p.state === 'celebrate' || phase === 'goal' || phase === 'halftime' || phase === 'fulltime') continue;
      if (p.role === 'gk') { this.keeper(p, dt); continue; }
      if (reading) continue;
      if (phase === 'restart' || phase === 'kickoff') { this.restart(p); continue; }
      if (phase === 'out') { this.goHome(p, false); continue; }
      if (b.owner === p) { this.carry(p, dt); continue; }
      if (m.pass && m.pass.to === p) { this.meet(p); continue; }
      if (p === chaser) { this.meet(p); continue; }
      if (p === presser || p === presser2) { this.press(p, dt, p === presser2); continue; }
      if (p === this.runner) { this.makeRun(p); continue; }
      this.goHome(p, ours);
    }
  }

  /**
   * Off-the-ball runs: every few seconds while we have it, a forward or wide midfielder ahead of
   * the ball sets off: first along the last defender's line, then sprinting in behind.
   */
  private pickRunner(carrier: Player | null) {
    const m = this.m, dir = this.side.dir;
    if (!carrier || carrier.side !== this.side) { this.runner = null; return; }
    if (this.runner && (this.runner === carrier || m.time - this.runStart > 3.2)) {
      this.runner = null;
      this.nextRun = m.time + 1.5 + Math.random() * 2.5;
    }
    if (this.runner || m.time < this.nextRun) return;
    const cx = carrier.x * dir;
    const options = this.side.players.filter((q) => q !== carrier && (q.role === 'fwd' || (q.role === 'mid' && Math.abs(q.z) > 3)) && q.x * dir > cx - 4 && q.x * dir < L - 7);
    if (!options.length) { this.nextRun = m.time + 1; return; }
    const r = options.find((q) => q.role === 'fwd' && Math.random() < 0.6) ?? options[Math.floor(Math.random() * options.length)];
    this.runner = r;
    this.runStart = m.time;
    // Into the channel on their side (or either side, for the striker).
    const zs = r.role === 'fwd' ? (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 3) : Math.sign(r.z) * (3 + Math.random() * 3);
    this.runZ = Math.max(-W + 3, Math.min(W - 3, zs));
  }

  private makeRun(p: Player) {
    const m = this.m, dir = this.side.dir;
    const line = this.offsideLine();
    const t = m.time - this.runStart;
    if (t < 1.0) {
      // Wait on the shoulder of the last defender.
      this.moveTo(p, (line - 0.7) * dir, this.runZ, false, 0.3);
    } else {
      // Go!
      p.mx = dir * 0.9;
      p.mz = Math.max(-0.45, Math.min(0.45, (this.runZ * 0.7 - p.z) * 0.3));
      const l = Math.hypot(p.mx, p.mz);
      p.mx /= l; p.mz /= l;
      p.sprint = true;
      if (p.x * dir > L - 5) this.runner = null;
    }
  }

  private ownGoal() {
    return -this.side.dir * L;
  }

  /** Rough time for p to get to the ball (looking ahead at where it's rolling). */
  private reachTime(p: Player) {
    const b = this.m.ball;
    const sp = PLAYER.sprint * p.speedMul;
    for (let t = 0; t <= 3; t += 0.15) {
      b.predict(t, tmp);
      if (tmp.y > 1.6) continue;
      const d = Math.hypot(tmp.x - p.x, tmp.z - p.z);
      if (d / sp + 0.15 <= t) return t;
    }
    b.predict(3, tmp);
    return 3 + Math.hypot(tmp.x - p.x, tmp.z - p.z) / sp;
  }

  private moveTo(p: Player, x: number, z: number, hurry: boolean, slack = 0.4) {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < slack) { p.mx = p.mz = 0; p.sprint = false; return; }
    const k = Math.min(1, d / 2.5);
    p.mx = (dx / d) * k;
    p.mz = (dz / d) * k;
    p.sprint = hurry && d > 3;
  }

  /** Run to where the ball's going to be. (Also used to bring your receiver to a pass.) */
  meet(p: Player) {
    const b = this.m.ball;
    const t = Math.min(2.5, this.reachTime(p));
    b.predict(t, tmp);
    this.moveTo(p, tmp.x, tmp.z, true, 0.1);
  }

  /** The formation spot, slid along with the ball (up when we're attacking, back when defending). */
  private home(p: Player, attacking: boolean) {
    const m = this.m, b = m.ball, dir = this.side.dir;
    const spot = m.formationSpot(p);
    const bx = b.pos.x * dir, bz = b.pos.z;
    let x = spot.x * dir * 0.8 + bx * 0.45 + (attacking ? 5 : -2.5);
    let z = spot.z + bz * 0.28;
    switch (p.role) {
      case 'def':
        x = Math.min(x, attacking ? 4 : bx - 3);
        x = Math.max(x, -L + 3);
        break;
      case 'mid':
        x = Math.max(-L + 7, Math.min(L - 7, x));
        break;
      case 'fwd': {
        // Stay level with the last defender (no offside), push on when the ball does.
        const line = this.offsideLine();
        x = Math.max(-4, Math.min(x + 3, line - 0.6, L - 4));
        break;
      }
    }
    z = Math.max(-W + 1.5, Math.min(W - 1.5, z));
    return { x: x * dir, z };
  }

  /** Attack-relative x of the opponents' second-last player (keeper usually last). */
  private offsideLine() {
    const dir = this.side.dir;
    const xs = this.m.other(this.side).players.map((p) => p.x * dir).sort((a, b) => b - a);
    return Math.max(0, xs[1] ?? L, this.m.ball.pos.x * dir);
  }

  private goHome(p: Player, attacking: boolean) {
    const h = this.home(p, attacking);
    this.moveTo(p, h.x, h.z, Math.hypot(h.x - p.x, h.z - p.z) > 8, 0.8);
    // Mark someone nearby when defending.
    if (!attacking && p.role !== 'fwd') {
      const opp = this.m.other(this.side).players;
      let mark: Player | null = null, md = 6;
      for (const o of opp) {
        if (o.role === 'gk') continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < md) { md = d; mark = o; }
      }
      if (mark) {
        // Goal-side of them.
        const gx = this.ownGoal();
        const dx = gx - mark.x, dz = -mark.z;
        const dl = Math.hypot(dx, dz) || 1;
        this.moveTo(p, mark.x + (dx / dl) * 1.6, mark.z + (dz / dl) * 1.6, md > 4, 0.5);
      }
    }
  }

  /** Close down the player on the ball and try to win it. */
  private press(p: Player, dt: number, second: boolean) {
    const m = this.m, c = m.ball.owner ?? m.ball.holder;
    if (!c) return;
    if (m.ball.holder) { this.goHome(p, false); return; }
    // Get between them and our goal, in front of the ball.
    const gx = this.ownGoal();
    const gdx = gx - c.x, gdz = -c.z;
    const gl = Math.hypot(gdx, gdz) || 1;
    // Close down fast, then jockey: stay goal-side at arm's length, matching their run, and wait
    // for a heavy touch to nick it.
    const stand = second ? 2.2 : 1.25;
    const tx = c.x + (gdx / gl) * stand + c.vx * 0.25, tz = c.z + (gdz / gl) * stand + c.vz * 0.25;
    const dc = Math.hypot(c.x - p.x, c.z - p.z);
    this.moveTo(p, tx, tz, dc > 3.5, 0.15);
    if (dc < 3.5) { p.mx *= 0.85; p.mz *= 0.85; }
    const b = m.ball;
    const bd = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
    // The moment: the ball pushed out from their feet (or they've turned their back badly).
    const out = Math.hypot(b.pos.x - c.x, b.pos.z - c.z);
    const shielded = (b.pos.x - c.x) * (p.x - c.x) + (b.pos.z - c.z) * (p.z - c.z) < 0;
    const keen = (out > 0.62 && !shielded ? 2.5 : shielded ? 0.3 : 0.9) * this.level.tackleRate;
    if (!second && p.state === 'free' && bd < 1.6 && Math.random() < keen * dt) {
      m.tackle(p);
    } else if (p.state === 'free' && bd > 1.4 && bd < 2.6 && c.speed > 4.5 && Math.random() < this.level.tackleRate * 0.12 * dt) {
      m.slide(p);
    }
  }

  // ---------- on the ball ----------

  private carry(p: Player, dt: number) {
    const m = this.m, side = this.side, dir = side.dir;
    const gx = m.goalX(side);
    const opp = m.other(side).players;
    // Just got it: take a touch and look up before deciding (less time the keener they are to pass).
    if (this.carrier !== p) {
      this.carrier = p;
      this.next.set(p, m.time + 0.45 + Math.random() * 0.9 * (1.2 - this.level.passing));
    }
    let t = this.next.get(p) ?? 0;

    // Dribble toward goal, swerving away from anyone in front.
    let dx = gx - p.x, dz = -p.z * 0.4;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    let near = Infinity, ahead = Infinity;
    for (const o of opp) {
      const ox = o.x - p.x, oz = o.z - p.z;
      const d = Math.hypot(ox, oz);
      near = Math.min(near, d);
      if (ox * dir > -0.5 && o.role !== 'gk') ahead = Math.min(ahead, d);
      if (d > 5 || ox * dir < -1) continue;
      const push = (5 - d) / 5;
      dx -= (ox / d) * push * 0.9;
      dz -= (oz / d) * push * 0.9;
    }
    if (Math.abs(p.z) > W - 2.5) dz -= Math.sign(p.z) * 0.6;
    const l2 = Math.hypot(dx, dz) || 1;
    p.mx = dx / l2;
    p.mz = dz / l2;
    p.sprint = near > 3;

    // (Someone closing in: decide now, once.)
    if (near < 1.1 && t > m.time + 0.1 && this.rushed !== p) { t = m.time; this.rushed = p; }
    if (m.time < t) return;
    this.next.set(p, m.time + this.level.think * (0.7 + Math.random() * 0.6));

    const toGoal = Math.hypot(gx - p.x, p.z);
    const ax = (p.x * dir);
    // Shoot?
    const angleOk = Math.abs(p.z) < 9 || toGoal < 10;
    if (angleOk && (toGoal < 9 || (toGoal < this.level.shootRange && Math.random() < 0.45))) {
      const z = (Math.random() < 0.5 ? -1 : 1) * (GW - 0.4 - Math.random() * 0.6);
      const power = Math.min(0.88, 0.45 + toGoal / 35 + Math.random() * 0.2);
      m.orders.set(p, { kind: 'shot', power, aimX: dir, aimZ: 0, goalZ: z, goalY: 0.2 + Math.random() * 0.9, curl: -Math.sign(z) * Math.sign(gx - p.x) * (Math.random() < 0.75 ? 1 : -0.4) * (0.2 + Math.random() * 0.5), until: m.time + 0.5 });
      return;
    }
    // Cross from the wing?
    if (ax > L - 11 && Math.abs(p.z) > PITCH.boxWidth / 2 - 1 && Math.random() < 0.6) {
      const inBox = side.players.filter((q) => q !== p && q.role !== 'gk' && q.x * dir > L - PITCH.boxDepth - 3 && Math.abs(q.z) < PITCH.boxWidth / 2);
      const tgt = inBox.sort((a, b) => Math.abs(a.z) - Math.abs(b.z))[0];
      const sx = tgt ? tgt.x + dir * 0.5 : gx - dir * PITCH.spot;
      const sz = tgt ? tgt.z : (Math.random() - 0.5) * 3;
      m.orders.set(p, { kind: 'lob', power: 0.6, aimX: 0, aimZ: 0, target: tgt ?? null, spotX: sx, spotZ: sz, until: m.time + 0.5 });
      return;
    }
    // Pass?
    const best = this.bestPass(p);
    const pressure = near < 1.1;
    // Open grass in front: run with it, unless there's a really good pass on.
    const space = ahead > 4.5 && ax < L - 9;
    const want = pressure ? 0.2 : space ? 4.3 - this.level.passing * 0.8 : 2.4 - this.level.passing * 1.2;
    if (best && (best.score > want || (pressure && best.score > -1.5))) {
      m.orders.set(p, { kind: best.through ? 'through' : 'pass', power: 0.4 + Math.random() * 0.3, aimX: best.t.x - p.x, aimZ: best.t.z - p.z, target: best.t, until: m.time + 0.5 });
      return;
    }
    // In trouble deep in our half: clear it.
    if (pressure && ax < -L + 9) m.orders.set(p, { kind: 'clear', power: 1, aimX: dir, aimZ: 0, until: m.time + 0.4 });
    void dt;
  }

  /** The most promising teammate to pass to (open, safe lane, further up the pitch). */
  private bestPass(p: Player) {
    const m = this.m, dir = this.side.dir;
    const opp = m.other(this.side).players;
    let best: { t: Player; score: number; through: boolean } | null = null;
    for (const t of this.side.players) {
      if (t === p || t.role === 'gk') continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < 4 || d > 28) continue;
      let lane = 9, open = 9;
      for (const o of opp) {
        if ((o.x - p.x) * (t.x - p.x) + (o.z - p.z) * (t.z - p.z) < 0) continue;
        lane = Math.min(lane, segDist(o.x, o.z, p.x, p.z, t.x, t.z));
        open = Math.min(open, Math.hypot(o.x - t.x, o.z - t.z));
      }
      const progress = (t.x - p.x) * dir;
      let score = progress * 0.12 + Math.min(open, 6) * 0.3 + Math.min(lane, 4) * 0.5 - Math.max(0, d - 18) * 0.12;
      if (lane < 1.2) score -= 3;
      // A run into space behind them: through ball.
      let through = false;
      if ((t.role === 'fwd' || t.role === 'mid') && t.vx * dir > 2 && open > 3 && t.x * dir < L - 8) { through = true; score += 1; }
      if (!best || score > best.score) best = { t, score, through };
    }
    return best;
  }

  // ---------- restarts ----------

  private restart(p: Player) {
    const m = this.m, r = m.restart;
    if (!r) { this.goHome(p, false); return; }
    const ours = r.side === this.side;
    if (r.taker === p) {
      if (!r.ready) {
        const s = m.takerSpot(r);
        this.moveTo(p, s.x, s.z, true, 0.1);
        return;
      }
      p.mx = p.mz = 0;
      // Take it after a short pause (a bit longer to line up a penalty).
      if ((m.phase === 'kickoff' ? m.phaseT : r.t) < (r.kind === 'penalty' ? 1.8 : 1.1)) return;
      if (r.kind === 'free') { this.freeKick(p); return; }
      if (r.kind === 'penalty') {
        const z = Math.random() < 0.1 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (GW - 0.45 - Math.random() * 0.5);
        m.orders.set(p, { kind: 'shot', power: 0.62 + Math.random() * 0.2, aimX: this.side.dir, aimZ: 0, goalZ: z, goalY: Math.random() < 0.4 ? 1.2 : 0.3, curl: 0, until: m.time + 1 });
        return;
      }
      if (r.kind === 'throw') {
        const t = this.bestPass(p)?.t ?? m.nearestOf(this.side, p.x, p.z, true, p);
        if (t) m.keeperRelease(p, 'throw', t.x - p.x, t.z - p.z, 0.5);
        return;
      }
      if (r.kind === 'goalkick') {
        const best = this.bestPass(p);
        if (best && best.score > 1) m.orders.set(p, { kind: 'pass', power: 0.6, aimX: best.t.x - p.x, aimZ: best.t.z - p.z, target: best.t, until: m.time + 1 });
        else m.orders.set(p, { kind: 'clear', power: 1, aimX: this.side.dir, aimZ: 0, until: m.time + 1 });
        return;
      }
      if (r.kind === 'corner') {
        const gx = m.goalX(this.side);
        const inBox = this.side.players.filter((q) => q !== p && q.role !== 'gk' && Math.abs(q.x - gx) < PITCH.boxDepth + 1);
        const tgt = inBox[Math.floor(Math.random() * inBox.length)];
        m.orders.set(p, { kind: 'lob', power: 0.6, aimX: 0, aimZ: 0, target: tgt ?? null, spotX: tgt ? tgt.x : gx - this.side.dir * PITCH.spot, spotZ: tgt ? tgt.z : 0, until: m.time + 1 });
        return;
      }
      // Kick-off: roll it to a teammate.
      const t = m.nearestOf(this.side, p.x - this.side.dir * 6, p.z, true, p);
      if (t) m.orders.set(p, { kind: 'pass', power: 0.3, aimX: t.x - p.x, aimZ: t.z - p.z, target: t, until: m.time + 1 });
      return;
    }
    if (r.kind === 'kickoff' || r.kind === 'penalty') { p.mx = p.mz = 0; return; }
    // In the wall.
    const w = m.wall.get(p);
    if (w) { this.moveTo(p, w.x, w.z, true, 0.1); return; }
    // Corners, and free kicks near goal: crowd the box (attackers) or mark it (defenders).
    const setPiece = r.kind === 'corner' || (r.kind === 'free' && Math.hypot(m.goalX(r.side) - r.x, r.z) < 24);
    if (setPiece) {
      const gx = ours ? m.goalX(this.side) : this.ownGoal();
      const inward = -Math.sign(gx);
      if (p.role === 'gk') return;
      const spots = [[2.5, -1.5], [3.5, 1.2], [5.5, 0], [6.5, -2.5], [9, 2]];
      const i = (p.slot - 1) % spots.length;
      const [sx, sz] = spots[i];
      const tx = gx + inward * (sx + (ours ? 0 : -0.6)), tz = sz + (ours ? 0 : 0.5);
      if (p.role === 'fwd' || p.slot <= 5) { this.moveTo(p, tx, tz, true, 0.3); return; }
    }
    // Throw-ins and goal kicks: get into shape; the nearest teammates offer themselves.
    const h = this.home(p, ours);
    let tx = h.x, tz = h.z;
    if (ours && r.kind === 'throw') {
      const near = this.side.players.filter((q) => q !== r.taker && q.role !== 'gk').sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z));
      const k = near.indexOf(p);
      if (k === 0) { tx = r.x + this.side.dir * 4; tz = r.z - Math.sign(r.z) * 5; }
      if (k === 1) { tx = r.x - this.side.dir * 3; tz = r.z - Math.sign(r.z) * 7; }
    }
    // Keep away from the ball when it's theirs.
    if (!ours) {
      const d = Math.hypot(tx - r.x, tz - r.z);
      if (d < 4.5) { tx = r.x + ((tx - r.x) / (d || 1)) * 4.5; tz = r.z + ((tz - r.z) / (d || 1)) * 4.5; }
    }
    this.moveTo(p, tx, tz, false, 0.5);
  }

  /** Taking a free kick: shoot over the wall if it's in range, cross it in if it's close, else pass. */
  private freeKick(p: Player) {
    const m = this.m, r = m.restart!, dir = this.side.dir;
    const gx = m.goalX(this.side);
    const d = Math.hypot(gx - p.x, p.z);
    if (!r.indirect && d < 17 && Math.abs(r.z) < 10) {
      const z = (Math.random() < 0.5 ? -1 : 1) * (GW - 0.45 - Math.random() * 0.5);
      m.orders.set(p, { kind: 'shot', power: 0.7 + Math.random() * 0.17, aimX: dir, aimZ: 0, goalZ: z, goalY: 1.15 + Math.random() * 0.4, curl: -Math.sign(z) * dir * (0.3 + Math.random() * 0.4), until: m.time + 1 });
      return;
    }
    if (d < 24) {
      const inBox = this.side.players.filter((q) => q !== p && q.role !== 'gk' && Math.abs(q.x - gx) < PITCH.boxDepth + 1);
      const tgt = inBox[Math.floor(Math.random() * inBox.length)];
      m.orders.set(p, { kind: 'lob', power: 0.6, aimX: 0, aimZ: 0, target: tgt ?? null, spotX: tgt ? tgt.x : gx - dir * PITCH.spot, spotZ: tgt ? tgt.z : 0, until: m.time + 1 });
      return;
    }
    const best = this.bestPass(p);
    if (best) m.orders.set(p, { kind: 'pass', power: 0.55, aimX: best.t.x - p.x, aimZ: best.t.z - p.z, target: best.t, until: m.time + 1 });
    else m.orders.set(p, { kind: 'clear', power: 1, aimX: dir, aimZ: 0, until: m.time + 1 });
  }

  // ---------- goalkeeper ----------

  private keeper(k: Player, dt: number) {
    const m = this.m, b = m.ball, side = this.side;
    const gx = this.ownGoal(), inward = side.dir;
    k.faceYaw = Math.atan2(b.pos.x - k.x, b.pos.z - k.z);
    if (m.phase === 'restart' || m.phase === 'kickoff') {
      if (m.restart?.taker === k) { this.restart(k); return; }
      if (m.restart?.kind === 'penalty') { k.mx = k.mz = 0; return; }
      this.moveTo(k, gx + inward * 0.8, 0, false, 0.3);
      return;
    }
    if (k.state === 'dive') return;
    if (b.holder === k) {
      // Wait a moment, then roll it to someone free or boot it upfield.
      if (k.state !== 'hold') k.setState('hold');
      if (this.holdUntil === 0) this.holdUntil = m.time + (m.human === k && !m.autopilot ? 6 : 1 + Math.random() * 0.8);
      k.mx = k.mz = 0;
      if (m.time > this.holdUntil) {
        this.holdUntil = 0;
        const best = this.bestPass(k);
        if (best && best.score > 1.5 && Math.hypot(best.t.x - k.x, best.t.z - k.z) < 20) m.keeperRelease(k, 'throw', best.t.x - k.x, best.t.z - k.z, 0.5);
        else m.keeperRelease(k, 'punt', inward, (Math.random() - 0.5) * 0.6, 0.8);
      }
      return;
    }
    if (b.owner === k) {
      // Ball at their feet: boot it.
      m.orders.set(k, { kind: 'clear', power: 1, aimX: inward, aimZ: 0, until: m.time + 0.5 });
      return;
    }

    // A shot coming? Work out where it crosses the line.
    const vx = b.vel.x * -inward;
    if (!b.owner && vx > 4 && Math.abs(b.pos.x - gx) < 30) {
      const t = (Math.abs(b.pos.x - gx) - BALL.radius) / vx;
      const zl = b.pos.z + b.vel.z * t;
      const yl = b.pos.y + b.vel.y * t - 0.5 * BALL.gravity * t * t;
      if (Math.abs(zl) < GW + 0.7 && yl < PITCH.goalHeight + 0.5 && t < 1.6) {
        if (this.keeperReact === 0) this.keeperReact = m.time + 0.45 - this.level.keeper * 0.3;
        if (m.time < this.keeperReact) return;
        const lat = zl - k.z;
        const reachable = Math.abs(lat) < 0.45 + (yl > 1.2 ? 0.2 : 0);
        if (reachable || t > 0.85) {
          // Shuffle across the line (not a full sprint: a keeper can't just run across the goal).
          this.moveTo(k, gx + inward * 0.5, zl, false, 0.05);
          const shuffle = 0.35 + this.level.keeper * 0.35;
          k.mx *= shuffle;
          k.mz *= shuffle;
        } else if (t < 0.85) {
          // Dive!
          const leftZ = -Math.sin(k.yaw);
          k.diveSide = Math.sign(lat * leftZ) || 1;
          const maxV = 3.6 + this.level.keeper * 3;
          k.diveVz = Math.max(-maxV, Math.min(maxV, lat / Math.max(0.3, t)));
          k.diveVx = (gx + inward * 0.4 - k.x) * 2;
          k.diveVy = yl > 0.8 ? Math.min(4.5, 2 + yl * 1.6) : 1.6;
          k.setState('dive');
          this.keeperReact = 0;
        }
        return;
      }
    }
    this.keeperReact = 0;

    // Rush out for a loose ball in the box, if we'll get there first.
    const inBox = Math.abs(b.pos.x - gx) < PITCH.boxDepth && Math.abs(b.pos.z) < PITCH.boxWidth / 2;
    if (inBox && !b.owner && !b.holder && b.speed < 14) {
      const mine = this.reachTime(k);
      const opp = m.other(side).players.filter((o) => o.role !== 'gk');
      const theirs = Math.min(...opp.map((o) => Math.hypot(o.x - b.pos.x, o.z - b.pos.z) / PLAYER.sprint));
      if (mine < theirs + 0.3) { this.meet(k); return; }
    }
    // One against one: come out and make yourself big.
    if (b.owner && b.owner.side !== side && inBox && Math.hypot(b.pos.x - gx, b.pos.z) < 7) {
      const dx = b.pos.x - gx, dz = b.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      this.moveTo(k, gx + (dx / dl) * Math.min(dl - 1.2, 4), (dz / dl) * Math.min(dl - 1.2, 4), true, 0.1);
      if (Math.hypot(b.pos.x - k.x, b.pos.z - k.z) < 1.0 && Math.random() < dt * 2) m.tackle(k);
      return;
    }
    // Otherwise: on the line between the ball and the middle of the goal.
    const dx = b.pos.x - gx, dz = b.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const out = Math.min(dl * 0.22, 2.2);
    const tz = Math.max(-GW - 0.3, Math.min(GW + 0.3, (dz / dl) * out * 1.4));
    this.moveTo(k, gx + (dx / dl) * out, tz, false, 0.15);
  }
}
