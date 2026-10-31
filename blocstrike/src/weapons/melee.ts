import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { wrapAngle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { HAMMER, LIGHTSABER, MELEE, type WeaponId } from '../data/weapons';
import { SFX } from '../data/sounds';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

/** Everyone a swing from b would hit (teammates too — but not while they're jumping). */
export function meleeTargets(match: Match, b: Bloc, weapon: WeaponId, enemiesOnly = false) {
  const def = MELEE[weapon]!;
  const arc = (def.arcDeg * Math.PI) / 180;
  const aim = Math.atan2(b.aimX, b.aimZ);
  return match.blocs.filter((t) => {
    if (t === b || !t.alive || t.shield > 0 || t.airborne) return false;
    if (enemiesOnly && t.team === b.team) return false;
    const dx = t.x - b.x, dz = t.z - b.z;
    if (Math.hypot(dx, dz) - b.radius - t.radius > def.reach) return false;
    return Math.abs(wrapAngle(Math.atan2(dx, dz) - aim)) <= arc;
  });
}

function slashGeometry(weapon: WeaponId) {
  const def = MELEE[weapon]!;
  const arc = (def.arcDeg * Math.PI) / 180;
  return new THREE.RingGeometry(0.7, 0.8 + def.reach, 24, 1, Math.PI / 2 - arc, arc * 2).rotateX(-Math.PI / 2);
}

/** Sword and light saber: always in your hand, no reload, slash whatever is just in front. */
export class Blade implements Weapon {
  private slashes: { mesh: THREE.Mesh; t: number }[] = [];
  private geo: THREE.BufferGeometry;

  constructor(private match: Match, readonly id: 'sword' | 'lightsaber') {
    this.geo = slashGeometry(id);
  }

  attach(b: Bloc) {
    b.armed = true;
    b.reload = 0;
  }

  control(b: Bloc, c: Controls, dt: number) {
    b.reload = Math.max(0, b.reload - dt);
    if (!(c.attackPressed || c.attack) || b.reload > 0) return;
    const m = this.match;
    const def = MELEE[this.id]!;
    const saber = this.id === 'lightsaber';
    b.reload = def.cooldown;
    [b.aimX, b.aimZ] = aimAssist(m, b, b.aimX, b.aimZ, def.reach + 1.4);
    b.view.swingAnim();
    m.sfx(saber ? SFX.saber : SFX.slash);

    // A swoosh in front: white for the sword, glowing team colour for the saber.
    const color = new THREE.Color(saber ? b.team.color : 0xffffff).multiplyScalar(saber ? 3 : 1.6);
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.position.set(b.x, 0.9, b.z);
    mesh.rotation.y = Math.atan2(b.aimX, b.aimZ) + Math.PI;
    m.group.add(mesh);
    this.slashes.push({ mesh, t: 0 });

    // The saber sends flying things back where they came from.
    if (saber) {
      const sent = m.deflect(b, b.x + b.aimX * 1.2, b.z + b.aimZ * 1.2, LIGHTSABER.deflectRadius);
      if (sent) m.sfx(SFX.deflect);
    }

    const hits = meleeTargets(m, b, this.id);
    for (const t of hits) {
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
      if (t.isBunny) m.damageBunny(t, b, dx / d, dz / d, 1);
      else m.kill(t, b, dx / d, dz / d);
    }
    if (hits.length) m.sfx(SFX.swordHit);
    const kills = hits.filter((t) => !t.isBunny).length;
    if (kills >= 2) m.multiHit(kills, b.team.color);
  }

  update() {}

  render(dt: number) {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - s.t / 0.18);
      s.mesh.scale.setScalar(0.9 + s.t * 1.2);
      if (s.t >= 0.18) {
        s.mesh.removeFromParent();
        mat.dispose();
        this.slashes.splice(i, 1);
      }
    }
  }

  onDeath() {}
  onEaten() {}

  status() {
    return { ready: 1, label: 'Ready' };
  }

  threats(): Threat[] {
    return [];
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {
    for (const s of this.slashes) s.mesh.removeFromParent();
  }
}

/** Slow overhead smash: knocks out whoever is where it lands, shoves everyone around, breaks props. */
export class Hammer implements Weapon {
  readonly id = 'hammer' as const;

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.armed = true;
    b.reload = 0;
  }

  control(b: Bloc, c: Controls, dt: number) {
    b.reload = Math.max(0, b.reload - dt);
    if (!(c.attackPressed || c.attack) || b.reload > 0) return;
    const m = this.match;
    b.reload = HAMMER.cooldown;
    [b.aimX, b.aimZ] = aimAssist(m, b, b.aimX, b.aimZ, HAMMER.reach + 1.6);
    b.view.smashAnim();
    const x = b.x + b.aimX * 1.2, z = b.z + b.aimZ * 1.2;
    m.sfx(SFX.smash);
    m.ring(x, z, HAMMER.pushRadius, 0.4);
    m.particles.burst({ x, y: 0.2, z, count: 30, color: 0xb8a888, speed: 5, up: 3, size: 0.18, life: 0.8 });
    m.shake(0.55);

    let kills = 0;
    for (const t of m.blocs) {
      if (t === b || !t.alive || t.airborne) continue;
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
      const nx = d > 0.01 ? dx / d : b.aimX, nz = d > 0.01 ? dz / d : b.aimZ;
      if (d < HAMMER.smashRadius + t.radius * 0.5 && t.shield <= 0) {
        if (t.isBunny) m.damageBunny(t, b, nx, nz, 1);
        else { m.kill(t, b, nx, nz); kills++; }
      } else if (d < HAMMER.pushRadius) {
        const k = (1 - d / HAMMER.pushRadius) * HAMMER.push * (t.isBunny ? 0.4 : 1);
        t.kbX += nx * k;
        t.kbZ += nz * k;
      }
    }
    if (kills >= 2) m.multiHit(kills, b.team.color);
    // Trees, rocks and crates where it lands crack.
    m.arena.destroyed(m.terrain.blast(x, z, 0.8));
  }

  update() {}
  render() {}
  onDeath() {}
  onEaten() {}

  status(b: Bloc) {
    return b.reload > 0 ? { ready: 1 - b.reload / HAMMER.cooldown, label: 'Lifting…' } : { ready: 1, label: 'Ready' };
  }

  threats(): Threat[] {
    return [];
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {}
}
