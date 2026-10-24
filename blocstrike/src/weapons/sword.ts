import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { wrapAngle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { SWORD } from '../data/weapons';
import { SFX } from '../data/sounds';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

const ARC = (SWORD.arcDeg * Math.PI) / 180;
const SLASH_GEO = new THREE.RingGeometry(0.7, 1.75, 24, 1, Math.PI / 2 - ARC, ARC * 2).rotateX(-Math.PI / 2);

/** Everyone a slash from b would hit (teammates too — but not while they're jumping). */
export function swordTargets(match: Match, b: Bloc, enemiesOnly = false) {
  const aim = Math.atan2(b.aimX, b.aimZ);
  return match.blocs.filter((t) => {
    if (t === b || !t.alive || t.shield > 0 || t.airborne) return false;
    if (enemiesOnly && t.team === b.team) return false;
    const dx = t.x - b.x, dz = t.z - b.z;
    if (Math.hypot(dx, dz) - b.radius - t.radius > SWORD.reach) return false;
    return Math.abs(wrapAngle(Math.atan2(dx, dz) - aim)) <= ARC;
  });
}

/** Always in your hand, no reload: get close and slash. */
export class Sword implements Weapon {
  readonly id = 'sword' as const;
  private slashes: { mesh: THREE.Mesh; t: number }[] = [];

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.armed = true;
    b.reload = 0;
  }

  control(b: Bloc, c: Controls, dt: number) {
    b.reload = Math.max(0, b.reload - dt);
    if (!(c.attackPressed || c.attack) || b.reload > 0) return;
    const m = this.match;
    b.reload = SWORD.cooldown;
    [b.aimX, b.aimZ] = aimAssist(m, b, b.aimX, b.aimZ, SWORD.reach + 1.4);
    b.view.swingAnim();
    m.sfx(SFX.slash);

    // A bright swoosh in front.
    const mesh = new THREE.Mesh(SLASH_GEO, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.position.set(b.x, 0.9, b.z);
    mesh.rotation.y = Math.atan2(b.aimX, b.aimZ) + Math.PI;
    m.group.add(mesh);
    this.slashes.push({ mesh, t: 0 });

    const hits = swordTargets(m, b);
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
