import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { segmentCircle } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import { MACHINEGUN as MG } from '../data/weapons';
import { SFX } from '../data/sounds';
import type { Match } from '../match';
import { aimAssist } from './spearWeapon';
import type { Danger, Threat, Weapon } from './types';

interface Bullet {
  /** Same for every bullet of one burst, so computer players decide once whether to dodge it. */
  burst: number;
  owner: Bloc;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  traveled: number;
}

const MAX = 200;

/** 2 seconds of bullets, then 2 seconds of reloading. Each bullet knocks out a bloc; bunnies need 4 per heart. */
export class MachineGun implements Weapon {
  readonly id = 'machinegun' as const;
  private bullets: Bullet[] = [];
  private shotAcc = new Map<Bloc, number>();
  private bursts = new Map<Bloc, number>();
  private nextBurst = 200000;
  private tracers: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(private match: Match) {
    this.tracers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.55),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(3) }),
      MAX,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    match.group.add(this.tracers);
  }

  attach(b: Bloc) {
    b.mag = MG.fireTime;
    b.reload = 0;
    b.armed = true;
  }

  control(b: Bloc, c: Controls, dt: number) {
    const m = this.match;
    if (b.reload > 0) {
      b.reload -= dt;
      if (b.reload <= 0) { b.mag = MG.fireTime; b.armed = true; }
      return;
    }
    if (!c.attack) {
      this.shotAcc.set(b, 1); // first bullet comes out right away next time
      this.bursts.delete(b);
      return;
    }
    if (!this.bursts.has(b)) this.bursts.set(b, this.nextBurst++);
    b.mag -= dt;
    let acc = (this.shotAcc.get(b) ?? 1) + dt * MG.rate;
    while (acc >= 1) {
      acc -= 1;
      this.shoot(b);
    }
    this.shotAcc.set(b, acc);
    if (b.mag <= 0) {
      b.reload = MG.reload;
      b.armed = false;
      if (b.human !== null) m.sfx(SFX.reload);
    }
  }

  private shoot(b: Bloc) {
    const m = this.match;
    const [ax, az] = aimAssist(m, b, b.aimX, b.aimZ, MG.range);
    const a = Math.atan2(ax, az) + ((Math.random() * 2 - 1) * MG.spreadDeg * Math.PI) / 180;
    const dx = Math.sin(a), dz = Math.cos(a);
    if (this.bullets.length < MAX) this.bullets.push({ burst: this.bursts.get(b) ?? 0, owner: b, x: b.x + dx * 0.9, z: b.z + dz * 0.9, dirX: dx, dirZ: dz, traveled: 0 });
    m.sfx(SFX.gunshot);
    m.glow.burst({ x: b.x + dx * 1.1, y: 0.95, z: b.z + dz * 1.1, count: 2, color: 0xffd27a, intensity: 3, speed: 2, up: 0.5, size: 0.1, life: 0.06, gravity: 0, dirX: dx, dirZ: dz, spread: 0.6 });
  }

  update(dt: number) {
    const m = this.match;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const u = this.bullets[i];
      const step = MG.speed * dt;
      const nx = u.x + u.dirX * step, nz = u.z + u.dirZ * step;
      const solid = m.terrain.segmentHit(u.x, u.z, nx, nz, 0.02);
      let tEnd = solid ? solid.t : 1;
      let victim: Bloc | null = null;
      for (const b of m.blocs) {
        if (!b.alive || b === u.owner || b.shield > 0 || b.airborne) continue;
        const t = segmentCircle(u.x, u.z, nx, nz, b.x, b.z, b.isBunny ? b.radius * MG.bunnyTarget : b.radius + 0.05);
        if (t !== null && t <= tEnd) { tEnd = t; victim = b; }
      }
      u.traveled += step * tEnd;
      if (victim) {
        if (victim.isBunny) {
          victim.bulletHits++;
          victim.view.hit();
          if (victim.bulletHits >= MG.bulletsPerHeart) {
            victim.bulletHits = 0;
            m.damageBunny(victim, u.owner, u.dirX, u.dirZ, 1);
          }
        } else {
          // Blocs take a couple of bullets; the dots over their head count them.
          victim.bulletHits++;
          victim.view.hit();
          if (victim.bulletHits >= MG.bulletsToKnockOut) m.kill(victim, u.owner, u.dirX, u.dirZ);
          else victim.view.setPunches(victim.bulletHits, MG.bulletsToKnockOut);
        }
      }
      if (victim || solid || u.traveled >= MG.range) {
        const hx = u.x + (nx - u.x) * tEnd, hz = u.z + (nz - u.z) * tEnd;
        m.particles.burst({ x: hx, y: 0.9, z: hz, count: 3, color: victim ? victim.team.color : 0xbbaa88, speed: 2, up: 2, size: 0.07, life: 0.3 });
        this.bullets.splice(i, 1);
        continue;
      }
      u.x = nx;
      u.z = nz;
    }
  }

  render() {
    const d = this.dummy;
    this.bullets.forEach((u, i) => {
      d.position.set(u.x, 0.95, u.z);
      d.rotation.set(0, Math.atan2(u.dirX, u.dirZ), 0);
      d.updateMatrix();
      this.tracers.setMatrixAt(i, d.matrix);
    });
    this.tracers.count = this.bullets.length;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  onDeath(b: Bloc) {
    this.shotAcc.delete(b);
  }

  onEaten(b: Bloc) {
    this.shotAcc.delete(b);
  }

  status(b: Bloc) {
    return b.reload > 0
      ? { ready: 1 - b.reload / MG.reload, label: 'Reloading…' }
      : { ready: b.mag / MG.fireTime, label: 'Ready' };
  }

  threats(): Threat[] {
    return this.bullets.map((u) => ({ id: u.burst, x: u.x, z: u.z, dirX: u.dirX, dirZ: u.dirZ, speed: MG.speed, owner: u.owner }));
  }

  dangers(): Danger[] {
    return [];
  }

  dispose() {
    this.tracers.removeFromParent();
  }
}
