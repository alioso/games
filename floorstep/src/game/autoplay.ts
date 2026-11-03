// A test pilot: walks the hero around a floor like a player would, searching things until it
// finds the key, then goes to the exit. Used by the test tools to prove floors can be finished.
import { COMBAT } from '../data/combat';
import { FURNITURE } from '../data/furniture';
import { HERO } from '../data/tuning';
import { buildNav, inRect, rectDist } from '../world/plan';
import { type HeroControls, NO_CONTROLS } from './controls';
import type { Floor } from './floor';
import type { Monster } from './monster';

export class Autopilot {
  private path: { x: number; z: number }[] = [];
  private goal: number | 'exit' | null = null;
  private stuck = 0;
  private lastX = 0;
  private lastZ = 0;
  private repath = 0;
  /** Pieces it gave up on (couldn't get close enough). */
  readonly skipped = new Set<number>();

  constructor(readonly floor: Floor) {}

  /** Fight like a careful player: block or dodge the wind-ups, hit back when it's open. */
  private fight(c: HeroControls): boolean {
    const f = this.floor, h = f.hero, cb = f.combat;
    let foe: Monster | null = null, best = 7;
    for (const m of cb.monsters) {
      if (!m.alive || m.state === 'flee' || m.state === 'lurk') continue;
      const d = Math.hypot(m.x - h.x, m.z - h.z);
      if (d < best) { best = d; foe = m; }
    }
    if (!foe) return false;
    const dx = foe.x - h.x, dz = foe.z - h.z, d = Math.max(best, 0.01);
    const nx = dx / d, nz = dz / d;
    const reach = COMBAT[f.look.cls].combo[0].reach + foe.def.radius;
    if (this.style === 'mash') {
      // No defence at all: walk up and swing (to check that strategy matters).
      c.moveX = d > reach ? nx : 0;
      c.moveZ = d > reach ? nz : 0;
      c.light = d < reach + 0.4;
      return true;
    }
    const t = foe.timeToHit;
    if (foe.state === 'attack' && t < 0.35) {
      const big = foe.attackId === 'lunge' || foe.attackId === 'pounce';
      if (big || this.style === 'dodge') {
        // Sidestep across its path.
        c.moveX = -nz;
        c.moveZ = nx;
        c.dodge = t < 0.22;
      } else c.block = true;
      return true;
    }
    if (foe.open && d < reach + 0.3) {
      // Punish!
      c.moveX = nx * 0.01;
      c.moveZ = nz * 0.01;
      if (foe.state === 'stun' && cb.stamina > 40 && !cb.act) c.heavy = true;
      else c.light = true;
      return true;
    }
    if (foe.open && d < 3.5) {
      c.moveX = nx;
      c.moveZ = nz;
      return true;
    }
    // Specials when ready.
    const sp = COMBAT[f.look.cls].special.kind;
    if (!cb.act && cb.specialCool <= 0 && ((sp === 'bash' && d < 1.4) || (sp === 'slam' && d < 1.8) || (sp === 'blast' && cb.charges > 0 && d > 2.5 && d < 7))) {
      c.special = true;
      return true;
    }
    if (f.look.cls === 'thief' && f.ctx.run.arrows > 0 && d > 3 && !cb.act) {
      h.yaw = Math.atan2(dx, dz);
      c.light = true;
      return true;
    }
    // Keep a respectful distance and wait for an opening.
    const want = 2.0;
    const k = d > want + 0.5 ? 1 : d < want - 0.4 ? -1 : 0;
    c.moveX = nx * k;
    c.moveZ = nz * k;
    if (k === 0) h.yaw = Math.atan2(dx, dz);
    return true;
  }

  /** 'block' blocks quick attacks; 'dodge' dodges everything; 'mash' never defends. */
  style: 'block' | 'dodge' | 'mash' = 'block';

  poll(dt: number): HeroControls {
    const f = this.floor;
    const c: HeroControls = { ...NO_CONTROLS };
    // Fight scenes have their own robot.
    if (f.duel) {
      if (this.style !== 'mash') return f.duel.botControls();
      const m = f.duel.m, h = f.duel.h;
      c.moveX = Math.abs(m.x - h.x) > 1.2 ? Math.sign(m.x - h.x) : 0;
      c.light = Math.random() < 0.5;
      return c;
    }
    // The robot doesn't chat: if it bumped into a conversation, it says goodbye.
    if (f.phase === 'talk') {
      f.ctx.dialog.close();
      f.residents.endTalkNow();
      return c;
    }
    if (f.phase !== 'play' || f.searching) return c;
    const h = f.hero;
    if (this.fight(c)) return c;

    if (this.goal === null || (typeof this.goal === 'number' && f.pieces[this.goal].searched) || (this.goal !== 'exit' && f.hasKey)) this.pick();
    if (this.goal === null) return c;

    // Arrived? Press the button.
    const target = f.interactTarget();
    if (this.goal === 'exit' && (target === 'exit' || f.exitOpen)) {
      if (!f.exitOpen) c.interact = true;
      else {
        // Line up with the doorway, then go through.
        const dx = f.plan.exit.c - h.x;
        c.moveX = Math.max(-1, Math.min(1, dx * 3));
        c.moveZ = Math.abs(dx) < 0.15 ? -1 : 0;
      }
      return c;
    }
    // Whatever's offered on the way gets searched too, like a player would
    // (unless a resident is closer: then E would start a chat, so keep walking).
    const chatFirst = !!target && target !== 'exit' && !!f.talkTarget(target);
    if (typeof this.goal === 'number' && target && target !== 'exit' && !chatFirst) {
      c.interact = true;
      return c;
    }
    // Someone's in the way of the thing it came for: turn to face the thing instead.
    if (chatFirst && typeof this.goal === 'number' && target === f.pieces[this.goal]) {
      const b = target.p.box;
      const dx = (b.x0 + b.x1) / 2 - h.x, dz = (b.z0 + b.z1) / 2 - h.z, d = Math.hypot(dx, dz) || 1;
      c.moveX = dx / d;
      c.moveZ = dz / d;
      return c;
    }

    // Not moving for a while: give up on this one.
    if (Math.hypot(h.x - this.lastX, h.z - this.lastZ) < 0.02) this.stuck += dt;
    else this.stuck = 0;
    this.lastX = h.x;
    this.lastZ = h.z;
    if (this.stuck > 2.5) {
      if (typeof this.goal === 'number') this.skipped.add(this.goal);
      this.goal = null;
      this.stuck = 0;
      return c;
    }

    this.repath -= dt;
    if (!this.path.length || this.repath <= 0) this.plan();
    const next = this.path[0];
    if (!next) return c;
    const dx = next.x - h.x, dz = next.z - h.z, d = Math.hypot(dx, dz);
    if (d < 0.2) this.path.shift();
    c.moveX = dx / (d || 1);
    c.moveZ = dz / (d || 1);
    return c;
  }

  private goalPoint(): { x: number; z: number } | null {
    const f = this.floor;
    if (this.goal === 'exit') return { x: f.plan.exit.c, z: f.plan.exit.at + 0.75 };
    if (typeof this.goal !== 'number') return null;
    // The free spot nearest to the piece.
    const p = f.pieces[this.goal].p;
    const nav = this.nav();
    const cx = (p.box.x0 + p.box.x1) / 2, cz = (p.box.z0 + p.box.z1) / 2;
    let best: { x: number; z: number } | null = null, bestD = Infinity;
    for (let a = 0; a < 24; a++) {
      for (const r of [0.45, 0.6, 0.8]) {
        const ang = (a / 24) * Math.PI * 2;
        const ex = Math.max(p.box.x1 - cx, p.box.z1 - cz) + r;
        const x = cx + Math.cos(ang) * ex, z = cz + Math.sin(ang) * ex;
        if (nav.isBlocked(x, z) || !inRect(f.plan.rooms[p.room].rect, x, z, -0.1)) continue;
        const dd = rectDist(p.box, x, z);
        if (dd - HERO.radius > HERO.reach) continue;
        // Stand in front of it, like a player would.
        const fx = cx + Math.sin(p.rot) * 2, fz = cz + Math.cos(p.rot) * 2;
        const score = Math.hypot(x - fx, z - fz);
        if (score < bestD) { bestD = score; best = { x, z }; }
      }
    }
    return best;
  }

  private navCache: { key: string; nav: ReturnType<typeof buildNav> } | null = null;
  private nav() {
    const f = this.floor;
    const gone = new Set(f.pieces.filter((r) => r.gone).map((r) => r.p.id));
    const key = [...gone].join(',') + ':' + f.pieces.map((r) => `${r.p.x.toFixed(1)}`).join('');
    if (!this.navCache || this.navCache.key !== key) this.navCache = { key, nav: buildNav(f.plan, gone) };
    return this.navCache.nav;
  }

  private pick() {
    const f = this.floor;
    this.path = [];
    if (f.hasKey) { this.goal = 'exit'; return; }
    const h = f.hero;
    let best: number | null = null, bestD = Infinity;
    f.pieces.forEach((r, i) => {
      if (r.searched || r.gone || this.skipped.has(i) || FURNITURE[r.p.kind].search === 'none' || f.occupied(r)) return;
      const d = Math.hypot(r.p.x - h.x, r.p.z - h.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    this.goal = best;
  }

  private plan() {
    this.repath = 1.5;
    const g = this.goalPoint();
    if (!g) {
      if (typeof this.goal === 'number') this.skipped.add(this.goal);
      this.goal = null;
      return;
    }
    const h = this.floor.hero;
    this.path = this.nav().findPath(h.x, h.z, g.x, g.z) ?? [g];
  }
}
