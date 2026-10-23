import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { clamp } from '@engine/math';
import { makeProgressRing } from '@engine/fx';
import type { Bloc } from '../entities/bloc';
import { makeGrenadeModel } from '../entities/weaponModels';
import { GRENADE } from '../data/weapons';
import { SFX } from '../data/sounds';
import { TEXT } from '../data/text';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

const G = 20; // gravity
const RADIUS = 0.24;
const START_Y = 1.2;
let nextId = 100000; // separate from spear/rocket ids

interface Nade {
  id: number;
  owner: Bloc;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  sinking: boolean;
  mesh: THREE.Group;
  light: THREE.Mesh;
  ring: ReturnType<typeof makeProgressRing>;
}

/** How far a throw goes after holding the button for `charge` seconds. */
export const grenadeDistance = (charge: number) =>
  GRENADE.minDistance + (GRENADE.maxDistance - GRENADE.minDistance) * clamp(charge / GRENADE.fullChargeTime, 0, 1);

export class Grenade implements Weapon {
  readonly id = 'grenade' as const;
  private nades: Nade[] = [];
  /** Landing marker shown while a human holds the throw button. */
  private reticles = new Map<Bloc, ReturnType<typeof makeProgressRing>>();

  constructor(private match: Match) {}

  attach(b: Bloc) {
    b.ammo = GRENADE.perPlayer;
    b.armed = true;
    b.charge = -1;
    if (b.human !== null) {
      const r = makeProgressRing(0.45, 0.6, b.team.color);
      r.mesh.visible = false;
      r.mesh.position.y = 0.06;
      this.match.group.add(r.mesh);
      this.reticles.set(b, r);
    }
  }

  control(b: Bloc, c: Controls, dt: number) {
    b.armed = b.ammo > 0;
    if (!b.armed) {
      if (c.attackPressed && b.human !== null) {
        this.match.sfx(SFX.empty);
        this.match.say(TEXT.outOfAmmo, 'small', b.team.color);
      }
      return;
    }
    if (b.charge < 0 && c.attackPressed) b.charge = 0;
    if (b.charge < 0) return;
    b.charge += dt;
    if (c.attack && !c.attackReleased) return;
    this.throwFrom(b, grenadeDistance(b.charge));
    b.charge = -1;
  }

  private throwFrom(b: Bloc, dist: number) {
    const [dx, dz] = aimAssist(this.match, b, b.aimX, b.aimZ, dist + 2);
    b.ammo--;
    const T = GRENADE.flightTime;
    const vh = dist / T;
    const mesh = makeGrenadeModel();
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(3) }));
    light.position.y = 0.27;
    mesh.add(light);
    const ring = makeProgressRing(GRENADE.blastRadius - 0.15, GRENADE.blastRadius, 0xff3030);
    ring.mesh.visible = false;
    this.match.group.add(mesh, ring.mesh);
    this.nades.push({
      id: nextId++,
      owner: b,
      x: b.x + dx * 0.6, y: START_Y, z: b.z + dz * 0.6,
      vx: dx * vh, vz: dz * vh, vy: (G * T) / 2 - START_Y / T,
      fuse: GRENADE.fuse, sinking: false, mesh, light, ring,
    });
    b.view.throwAnim();
    this.match.sfx(SFX.lob);
  }

  update(dt: number) {
    const m = this.match;
    const { halfW, halfD } = m.arena.def;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      if (n.sinking) {
        n.y -= dt * 0.6;
        if (n.fuse <= 0) this.remove(i);
        continue;
      }
      n.vy -= G * dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.z += n.vz * dt;
      // Bounce off trees, rocks and the hedge.
      for (const o of m.arena.obstacles) {
        const dx = n.x - o.x, dz = n.z - o.z, d = Math.hypot(dx, dz), min = o.r + RADIUS;
        if (d < min && n.y < 2.5) {
          const nx = dx / d, nz = dz / d;
          const dot = n.vx * nx + n.vz * nz;
          if (dot < 0) { n.vx -= 1.6 * dot * nx; n.vz -= 1.6 * dot * nz; }
          n.x = o.x + nx * min;
          n.z = o.z + nz * min;
        }
      }
      if (Math.abs(n.x) > halfW - RADIUS) { n.x = Math.sign(n.x) * (halfW - RADIUS); n.vx *= -0.5; }
      if (Math.abs(n.z) > halfD - RADIUS) { n.z = Math.sign(n.z) * (halfD - RADIUS); n.vz *= -0.5; }
      if (n.y <= RADIUS) {
        n.y = RADIUS;
        if (m.arena.pondAt(n.x, n.z)) {
          // Plop. The piranhas aren't interested.
          n.sinking = true;
          n.fuse = 1.2;
          m.sfx(SFX.fizzle);
          m.particles.burst({ x: n.x, y: 0.1, z: n.z, count: 16, color: 0xe8fbff, speed: 2, up: 4, size: 0.1 });
          continue;
        }
        if (n.vy < -2) {
          m.sfx(SFX.bounce);
          // A heavy grenade: small hop, then it mostly stops where it lands.
          n.vx *= 0.3;
          n.vz *= 0.3;
        }
        n.vy = Math.abs(n.vy) > 2 ? -n.vy * 0.3 : 0;
        const f = Math.exp(-7 * dt);
        n.vx *= f;
        n.vz *= f;
      }
      if (n.fuse <= 0) {
        m.explode(n.x, n.z, GRENADE.blastRadius, GRENADE.pushRadius, GRENADE.push, GRENADE.bunnyDamage, n.owner, true);
        this.remove(i);
      }
    }
  }

  private remove(i: number) {
    const n = this.nades[i];
    n.mesh.removeFromParent();
    n.ring.mesh.removeFromParent();
    this.nades.splice(i, 1);
  }

  render(dt: number) {
    for (const n of this.nades) {
      n.mesh.position.set(n.x, n.y, n.z);
      n.mesh.rotation.x += dt * Math.hypot(n.vx, n.vz) * 2;
      // The light blinks faster as the fuse runs out.
      n.light.visible = Math.sin((GRENADE.fuse - n.fuse) * (6 + (GRENADE.fuse - n.fuse) * 14)) > 0;
      n.ring.mesh.visible = !n.sinking && n.y < 0.5;
      n.ring.mesh.position.set(n.x, 0.05, n.z);
      n.ring.progress = 1 - n.fuse / GRENADE.fuse;
    }
    for (const [b, r] of this.reticles) {
      r.mesh.visible = b.alive && b.charge >= 0;
      if (!r.mesh.visible) continue;
      const d = grenadeDistance(b.charge);
      r.mesh.position.set(b.x + b.aimX * (d + 0.6), 0.06, b.z + b.aimZ * (d + 0.6));
      r.progress = clamp(b.charge / GRENADE.fullChargeTime, 0, 1);
    }
  }

  onDeath(b: Bloc) {
    b.charge = -1;
  }

  onEaten(b: Bloc) {
    b.charge = -1;
  }

  status(b: Bloc) {
    return { ready: b.ammo / GRENADE.perPlayer, label: b.ammo ? `${'💣'.repeat(b.ammo)}` : 'No grenades' };
  }

  threats(): Threat[] {
    return [];
  }

  dangers(): Danger[] {
    // Where each grenade is heading (or lying), so computer players can run away.
    return this.nades
      .filter((n) => !n.sinking)
      .map((n) => {
        const t = n.y > RADIUS + 0.05 ? Math.max(0, (n.vy + Math.sqrt(Math.max(0, n.vy * n.vy + 2 * G * (n.y - RADIUS)))) / G) : 0;
        return { id: n.id, x: n.x + n.vx * t, z: n.z + n.vz * t, r: GRENADE.blastRadius + 0.8 };
      });
  }

  dispose() {
    for (let i = this.nades.length - 1; i >= 0; i--) this.remove(i);
    for (const r of this.reticles.values()) r.mesh.removeFromParent();
  }
}
