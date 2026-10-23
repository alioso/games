import type { Controls } from '@engine/input';
import { segmentCircle, wrapAngle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { Spear } from '../entities/spear';
import { SPEAR } from '../data/weapons';
import { SFX } from '../data/sounds';
import { TUNING } from '../data/tuning';
import type { Match } from '../match';
import type { Danger, Threat, Weapon } from './types';

/** Nudge a human's aim onto the enemy closest to where they're pointing. */
export function aimAssist(match: Match, b: Bloc, dx: number, dz: number, range: number): [number, number] {
  if (b.human === null) return [dx, dz];
  const maxAngle = (TUNING.aimAssistDeg.human * Math.PI) / 180;
  const aim = Math.atan2(dx, dz);
  let best: Bloc | null = null, bestA = maxAngle;
  for (const o of match.blocs) {
    if (!o.alive || o.team === b.team) continue;
    const ox = o.x - b.x, oz = o.z - b.z;
    if (Math.hypot(ox, oz) > range) continue;
    const a = Math.abs(wrapAngle(Math.atan2(ox, oz) - aim));
    if (a < bestA) { bestA = a; best = o; }
  }
  if (!best) return [dx, dz];
  const ox = best.x - b.x, oz = best.z - b.z, l = Math.hypot(ox, oz);
  return [ox / l, oz / l];
}

export class SpearWeapon implements Weapon {
  readonly id = 'spear' as const;
  readonly spears: Spear[] = [];

  constructor(private match: Match) {}

  attach(b: Bloc) {
    const s = new Spear(b);
    b.spear = s;
    b.armed = true;
    s.addTo(this.match.group);
    this.spears.push(s);
  }

  control(b: Bloc, c: Controls) {
    if (!c.attackPressed || !b.armed || !b.spear) return;
    const [dx, dz] = aimAssist(this.match, b, b.aimX, b.aimZ, SPEAR.range);
    b.armed = false;
    b.spear.launch(b.x + dx * 0.5, b.z + dz * 0.5, dx, dz);
    b.view.throwAnim();
    this.match.sfx(SFX.throw);
  }

  update(dt: number) {
    for (const s of this.spears) this.updateSpear(s, dt);
  }

  private updateSpear(s: Spear, dt: number) {
    const m = this.match;
    const owner = s.owner;
    switch (s.state) {
      case 'flying': this.fly(s, dt); break;
      case 'falling':
        s.y -= dt * 4;
        s.x += s.dirX * dt * 3;
        s.z += s.dirZ * dt * 3;
        if (s.y <= 0.12) {
          s.y = 0.12;
          s.state = 'grounded';
          if (m.arena.pondAt(s.x, s.z)) {
            s.state = 'sinking';
            s.timer = SPEAR.waterReturn;
            m.sfx(SFX.splash);
            m.particles.burst({ x: s.x, y: 0.1, z: s.z, count: 14, color: 0xe8fbff, speed: 2, up: 4, size: 0.1 });
          }
        }
        break;
      case 'sinking':
        s.y = Math.max(-1, s.y - dt * 0.8);
        s.timer -= dt;
        // The piranhas spit it back out to its owner.
        if (s.timer <= 0 && owner.state !== 'eaten' && owner.state !== 'gone') {
          s.state = 'held';
          owner.armed = true;
        }
        break;
    }
    if ((s.state === 'grounded' || s.state === 'stuck' || s.state === 'falling') && owner.alive) {
      if (Math.hypot(owner.x - s.x, owner.z - s.z) < SPEAR.pickupRadius + (s.state === 'stuck' ? 0.4 : 0)) {
        s.state = 'held';
        owner.armed = true;
        if (owner.human !== null) m.sfx(SFX.pickup);
      }
    }
  }

  private fly(s: Spear, dt: number) {
    const m = this.match;
    const { halfW, halfD } = m.arena.def;
    const step = SPEAR.speed * dt;
    const nx = s.x + s.dirX * step, nz = s.z + s.dirZ * step;
    let tStop = 1;
    let stop: 'obstacle' | 'wall' | null = null;
    for (const o of m.arena.obstacles) {
      const t = segmentCircle(s.x, s.z, nx, nz, o.x, o.z, o.r + 0.05);
      if (t !== null && t < tStop) { tStop = t; stop = 'obstacle'; }
    }
    const wallT = (from: number, to: number, lim: number) =>
      Math.abs(to) > lim ? (Math.sign(to) * lim - from) / (to - from) : null;
    for (const t of [wallT(s.x, nx, halfW), wallT(s.z, nz, halfD)]) {
      if (t !== null && t >= 0 && t < tStop) { tStop = t; stop = 'wall'; }
    }

    const hits: { b: Bloc; t: number }[] = [];
    for (const b of m.blocs) {
      if (!b.alive || b === s.owner || s.hit.has(b.id) || b.shield > 0) continue;
      const t = segmentCircle(s.x, s.z, nx, nz, b.x, b.z, b.radius + 0.18);
      if (t !== null && t <= tStop) hits.push({ b, t });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const { b, t } of hits) {
      s.hit.add(b.id);
      const hx = s.x + (nx - s.x) * t, hz = s.z + (nz - s.z) * t;
      if (b.isBunny) {
        m.damageBunny(b, s.owner, s.dirX, s.dirZ);
        this.drop(s, hx - s.dirX * 0.6, hz - s.dirZ * 0.6);
        return;
      }
      m.kill(b, s.owner, s.dirX, s.dirZ);
      s.kills++;
      if (s.kills === 2) m.multiHit(2, s.owner.team.color);
      if (s.kills >= SPEAR.maxKills) {
        this.drop(s, hx, hz);
        return;
      }
    }

    s.x += (nx - s.x) * tStop;
    s.z += (nz - s.z) * tStop;
    s.traveled += step * tStop;
    if (stop === 'obstacle') {
      s.state = 'stuck';
      s.x -= s.dirX * 0.55;
      s.z -= s.dirZ * 0.55;
      m.sfx(SFX.thunk);
      m.particles.burst({ x: s.x + s.dirX * 0.9, y: 1, z: s.z + s.dirZ * 0.9, count: 8, color: 0x8a6a4a, speed: 2.5, up: 2, size: 0.1, dirX: -s.dirX, dirZ: -s.dirZ });
    } else if (stop === 'wall') {
      this.drop(s, s.x - s.dirX * 0.3, s.z - s.dirZ * 0.3);
      m.sfx(SFX.thunk);
    } else if (s.traveled >= SPEAR.range) {
      s.state = 'falling';
    }
  }

  private drop(s: Spear, x: number, z: number) {
    s.x = x;
    s.z = z;
    s.state = 'falling';
  }

  onDeath(b: Bloc, dirX: number, dirZ: number) {
    if (!b.armed || !b.spear) return;
    b.armed = false;
    b.spear.dirX = dirX;
    b.spear.dirZ = dirZ;
    this.drop(b.spear, b.x + 0.5, b.z + 0.3);
    b.spear.y = 0.6;
  }

  onEaten(b: Bloc) {
    if (!b.armed || !b.spear) return;
    b.armed = false;
    Object.assign(b.spear, { state: 'sinking', timer: Infinity, x: b.x, z: b.z, y: -2 });
  }

  render(dt: number) {
    for (const s of this.spears) s.updateView(dt);
  }

  status(b: Bloc) {
    return { ready: b.armed ? 1 : 0, label: b.armed ? 'Ready' : 'Get your spear!' };
  }

  threats(): Threat[] {
    return this.spears
      .filter((s) => s.state === 'flying')
      .map((s) => ({ id: s.id, x: s.x, z: s.z, dirX: s.dirX, dirZ: s.dirZ, speed: SPEAR.speed, owner: s.owner }));
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {
    for (const s of this.spears) s.dispose();
  }
}
