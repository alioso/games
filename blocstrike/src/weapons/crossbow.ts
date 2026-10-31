import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { segmentCircle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { makeBoltModel } from '../entities/weaponModels';
import { CROSSBOW } from '../data/weapons';
import { SFX } from '../data/sounds';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

interface Bolt {
  id: number;
  owner: Bloc;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  traveled: number;
  kills: number;
  hit: Set<number>;
  mesh: THREE.Group;
}

let nextId = 300000;

/** Fast, long-range bolts that pierce two blocs. No fetching: it reloads by itself. */
export class Crossbow implements Weapon {
  readonly id = 'crossbow' as const;
  private bolts: Bolt[] = [];

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.armed = true;
    b.reload = 0;
  }

  control(b: Bloc, c: Controls, dt: number) {
    const m = this.match;
    if (b.reload > 0) {
      b.reload -= dt;
      if (b.reload <= 0) b.armed = true;
      return;
    }
    if (!c.attackPressed) return;
    const [dx, dz] = aimAssist(m, b, b.aimX, b.aimZ, CROSSBOW.range);
    b.reload = CROSSBOW.reload;
    b.armed = false;
    const mesh = makeBoltModel();
    m.group.add(mesh);
    this.bolts.push({ id: nextId++, owner: b, x: b.x + dx * 0.7, z: b.z + dz * 0.7, dirX: dx, dirZ: dz, traveled: 0, kills: 0, hit: new Set(), mesh });
    b.view.throwAnim();
    m.sfx(SFX.crossbow);
  }

  update(dt: number) {
    const m = this.match;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const u = this.bolts[i];
      const step = CROSSBOW.speed * dt;
      const nx = u.x + u.dirX * step, nz = u.z + u.dirZ * step;
      const solid = m.terrain.segmentHit(u.x, u.z, nx, nz, 0.03);
      const tStop = solid ? solid.t : 1;
      const hits: { b: Bloc; t: number }[] = [];
      for (const b of m.blocs) {
        if (!b.alive || b === u.owner || u.hit.has(b.id) || b.shield > 0 || b.airborne) continue;
        const t = segmentCircle(u.x, u.z, nx, nz, b.x, b.z, b.radius + 0.1);
        if (t !== null && t <= tStop) hits.push({ b, t });
      }
      hits.sort((a, b) => a.t - b.t);
      let done = false;
      for (const { b } of hits) {
        u.hit.add(b.id);
        if (b.isBunny) {
          m.damageBunny(b, u.owner, u.dirX, u.dirZ, 1);
          done = true;
          break;
        }
        m.kill(b, u.owner, u.dirX, u.dirZ);
        if (++u.kills === 2) m.multiHit(2, u.owner.team.color);
        if (u.kills >= CROSSBOW.maxKills) { done = true; break; }
      }
      u.traveled += step * tStop;
      if (done || solid || u.traveled >= CROSSBOW.range) {
        if (solid?.prop || solid?.gate) m.sfx(SFX.thunk);
        m.particles.burst({ x: u.x, y: 1, z: u.z, count: 5, color: 0x9c7a4f, speed: 2, up: 2, size: 0.07, life: 0.4 });
        this.remove(i);
        continue;
      }
      u.x = nx;
      u.z = nz;
    }
  }

  private remove(i: number) {
    this.bolts[i].mesh.removeFromParent();
    this.bolts.splice(i, 1);
  }

  /** Light saber: send bolts back, now belonging to whoever deflected them. */
  deflect(by: Bloc, x: number, z: number, r: number) {
    let n = 0;
    for (const u of this.bolts) {
      if (u.owner === by || Math.hypot(u.x - x, u.z - z) > r) continue;
      u.dirX = -u.dirX;
      u.dirZ = -u.dirZ;
      u.owner = by;
      u.traveled = 0;
      u.hit.clear();
      n++;
    }
    return n;
  }

  render() {
    for (const u of this.bolts) {
      u.mesh.position.set(u.x, 1.0, u.z);
      u.mesh.rotation.set(0, Math.atan2(u.dirX, u.dirZ), 0);
    }
  }

  onDeath() {}
  onEaten() {}

  status(b: Bloc) {
    return b.reload > 0 ? { ready: 1 - b.reload / CROSSBOW.reload, label: 'Reloading…' } : { ready: 1, label: 'Ready' };
  }

  threats(): Threat[] {
    return this.bolts.map((u) => ({ id: u.id, x: u.x, z: u.z, dirX: u.dirX, dirZ: u.dirZ, speed: CROSSBOW.speed, owner: u.owner }));
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {
    for (let i = this.bolts.length - 1; i >= 0; i--) this.remove(i);
  }
}
