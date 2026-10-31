import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { segmentCircle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { makeRocketModel } from '../entities/weaponModels';
import { BAZOOKA } from '../data/weapons';
import { SFX } from '../data/sounds';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

interface Rocket {
  id: number;
  owner: Bloc;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  traveled: number;
  mesh: THREE.Group;
}

let nextId = 1;

export class Bazooka implements Weapon {
  readonly id = 'bazooka' as const;
  private rockets: Rocket[] = [];

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.armed = true;
    b.reload = 0;
  }

  control(b: Bloc, c: Controls, dt: number) {
    b.reload = Math.max(0, b.reload - dt);
    b.armed = b.reload <= 0;
    if (!c.attackPressed) return;
    if (!b.armed) {
      if (b.human !== null) this.match.sfx(SFX.empty);
      return;
    }
    const [dx, dz] = aimAssist(this.match, b, b.aimX, b.aimZ, BAZOOKA.range);
    b.reload = BAZOOKA.reload;
    b.armed = false;
    const mesh = makeRocketModel();
    this.match.group.add(mesh);
    this.rockets.push({ id: nextId++, owner: b, x: b.x + dx * 0.9, z: b.z + dz * 0.9, dirX: dx, dirZ: dz, traveled: 0, mesh });
    // Kick back a little.
    b.kbX -= dx * 3;
    b.kbZ -= dz * 3;
    b.view.throwAnim();
    this.match.sfx(SFX.rocket);
    this.match.particles.burst({ x: b.x - dx * 0.6, y: 1.1, z: b.z - dz * 0.6, count: 10, color: 0xbbbbbb, speed: 2, up: 1, size: 0.2, life: 0.6, dirX: -dx, dirZ: -dz, spread: 1, gravity: -1 });
  }

  update(dt: number) {
    const m = this.match;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const step = BAZOOKA.speed * dt;
      const nx = r.x + r.dirX * step, nz = r.z + r.dirZ * step;
      let tHit: number | null = m.terrain.segmentHit(r.x, r.z, nx, nz, 0.1)?.t ?? null;
      for (const b of m.blocs) {
        // Jumping blocs: the rocket flies underneath.
        if (!b.alive || b === r.owner || b.airborne) continue;
        const t = segmentCircle(r.x, r.z, nx, nz, b.x, b.z, b.radius + 0.12);
        if (t !== null && (tHit === null || t < tHit)) tHit = t;
      }
      r.traveled += step;
      if (tHit !== null || r.traveled >= BAZOOKA.range) {
        const t = tHit ?? 1;
        const ex = r.x + (nx - r.x) * t, ez = r.z + (nz - r.z) * t;
        m.explode(ex, ez, BAZOOKA.blastRadius, BAZOOKA.pushRadius, BAZOOKA.push, BAZOOKA.bunnyDamage, r.owner, false);
        r.mesh.removeFromParent();
        this.rockets.splice(i, 1);
        continue;
      }
      r.x = nx;
      r.z = nz;
      // Smoke trail with a hot glow at the back.
      m.particles.burst({ x: r.x - r.dirX * 0.35, y: 1.0, z: r.z - r.dirZ * 0.35, count: 1, color: 0xd0d0d0, speed: 0.3, up: 0.5, size: 0.22, life: 0.7, gravity: -0.6 });
      m.glow.burst({ x: r.x - r.dirX * 0.35, y: 1.0, z: r.z - r.dirZ * 0.35, count: 1, color: 0xffa040, intensity: 3, speed: 0.4, up: 0.2, size: 0.14, life: 0.15, gravity: 0 });
    }
  }

  render() {
    for (const r of this.rockets) {
      r.mesh.position.set(r.x, 1.0, r.z);
      r.mesh.rotation.set(0, Math.atan2(r.dirX, r.dirZ), 0);
    }
  }

  deflect(by: Bloc, x: number, z: number, r: number) {
    let n = 0;
    for (const k of this.rockets) {
      if (k.owner === by || Math.hypot(k.x - x, k.z - z) > r) continue;
      k.dirX = -k.dirX;
      k.dirZ = -k.dirZ;
      k.owner = by;
      k.traveled = 0;
      n++;
    }
    return n;
  }

  onDeath() {}
  onEaten() {}

  status(b: Bloc) {
    return b.reload <= 0
      ? { ready: 1, label: 'Ready' }
      : { ready: 1 - b.reload / BAZOOKA.reload, label: `Reloading ${Math.ceil(b.reload)}s` };
  }

  threats(): Threat[] {
    return this.rockets.map((r) => ({ id: r.id, x: r.x, z: r.z, dirX: r.dirX, dirZ: r.dirZ, speed: BAZOOKA.speed, owner: r.owner }));
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {
    for (const r of this.rockets) r.mesh.removeFromParent();
  }
}
