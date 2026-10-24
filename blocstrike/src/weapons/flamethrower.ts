import type { Controls } from '@engine/input';
import { rand, wrapAngle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { FLAMETHROWER } from '../data/weapons';
import { SFX } from '../data/sounds';
import { TEXT } from '../data/text';
import type { Match } from '../match';
import type { Danger, Threat, Weapon } from './types';

const FLAME_COLORS = [0xffe08a, 0xffa030, 0xff6a1a, 0xff3a10];

/** Is `t` inside b's flame cone, with nothing solid in between? (`solid`: t is itself a prop, so aim at its near side.) */
export function inFlames(match: Match, b: Bloc, t: { x: number; z: number; radius: number }, solid = false) {
  const dx = t.x - b.x, dz = t.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d > FLAMETHROWER.range + t.radius) return false;
  const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - Math.atan2(b.aimX, b.aimZ)));
  // Close up, the cone is wide enough to catch the whole body.
  if (off > (FLAMETHROWER.coneDeg * Math.PI) / 180 + Math.atan2(t.radius, Math.max(d, 0.1))) return false;
  if (!solid) return match.terrain.clearLine(b.x, b.z, t.x, t.z, 0);
  const k = Math.max(0, d - t.radius - 0.05) / d;
  return match.terrain.clearLine(b.x, b.z, b.x + dx * k, b.z + dz * k, 0);
}

export class Flamethrower implements Weapon {
  readonly id = 'flamethrower' as const;
  private soundT = 0;
  private burnedThisTick = new Set<Bloc>();

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.fuel = FLAMETHROWER.fuel;
    b.armed = true;
  }

  control(b: Bloc, c: Controls, dt: number) {
    const m = this.match;
    b.firing = c.attack && b.fuel > 0;
    if (!b.firing) return;
    b.fuel = Math.max(0, b.fuel - dt);
    b.armed = b.fuel > 0;
    if (b.fuel <= 0 && b.human !== null) m.say(TEXT.outOfFuel, 'small', b.team.color);

    // Flames: hot glowing bits rushing out of the nozzle and rising.
    const nx = b.x + b.aimX * 0.95, nz = b.z + b.aimZ * 0.95;
    for (let i = 0; i < 3; i++) {
      m.glow.burst({
        x: nx, y: 0.85, z: nz, count: 1,
        color: FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)], intensity: 2.6,
        speed: rand(8, 11), up: 0.6, size: rand(0.18, 0.32), life: 0.36, gravity: -3,
        dirX: b.aimX, dirZ: b.aimZ, spread: (FLAMETHROWER.coneDeg * Math.PI) / 180 * 1.4,
      });
    }
    if (Math.random() < 0.3) m.particles.burst({ x: nx + b.aimX * 2.5, y: 1.2, z: nz + b.aimZ * 2.5, count: 1, color: 0x555555, speed: 0.5, up: 1, size: 0.25, life: 0.8, gravity: -1 });
    this.soundT -= dt;
    if (this.soundT <= 0) { m.sfx(SFX.flame); this.soundT = 0.1; }

    // Everybody in the cone burns — teammates too.
    for (const t of m.blocs) {
      if (t === b || !t.alive || t.shield > 0 || t.airborne || !inFlames(m, b, t)) continue;
      this.burnedThisTick.add(t);
      t.burn += dt;
      if (t.isBunny) {
        if (t.burn >= FLAMETHROWER.bunnyBurnTime) { t.burn = 0; m.damageBunny(t, b, b.aimX, b.aimZ, 1); }
      } else if (t.burn >= FLAMETHROWER.burnTime) {
        m.kill(t, b, b.aimX, b.aimZ);
        m.particles.burst({ x: t.x, y: 0.8, z: t.z, count: 12, color: 0x333333, speed: 1, up: 3, size: 0.25, life: 1.2, gravity: -1.5 });
      }
    }
  }

  update(dt: number) {
    // Trees and crates in the flames catch fire and burn down.
    const m = this.match;
    for (const b of m.blocs) {
      if (!b.alive || !b.firing) continue;
      for (const p of m.terrain.props) {
        if (!p.alive || !inFlames(m, b, { x: p.x, z: p.z, radius: p.r }, true)) continue;
        if (m.terrain.burn(p, dt)) m.arena.destroyed([p]);
      }
    }
    // Cool down anyone who stepped out of the flames.
    for (const b of this.match.blocs) {
      if (!this.burnedThisTick.has(b)) b.burn = Math.max(0, b.burn - dt * 2);
    }
    this.burnedThisTick.clear();
  }

  render() {}

  onDeath(b: Bloc) {
    b.firing = false;
  }

  onEaten(b: Bloc) {
    b.firing = false;
  }

  status(b: Bloc) {
    return { ready: b.fuel / FLAMETHROWER.fuel, label: b.fuel > 0 ? `Fuel ${Math.ceil(b.fuel)}s` : TEXT.punch };
  }

  threats(): Threat[] {
    return [];
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {}
}
