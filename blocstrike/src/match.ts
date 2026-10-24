import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { damp } from '@engine/math';
import type { Particles } from '@engine/particles';
import { Bloc } from './entities/bloc';
import type { BlocLook } from './entities/blocView';
import { Brain } from './ai/brain';
import type { Arena } from './world/arena';
import { TEAMS, type TeamDef } from './data/teams';
import { AI_LEVELS, TUNING, type Difficulty } from './data/tuning';
import { PUNCH, type WeaponId } from './data/weapons';
import { wrapAngle } from '@engine/math';
import { SFX } from './data/sounds';
import { TEXT } from './data/text';
import type { Weapon, WeaponStatus } from './weapons/types';
import { SpearWeapon } from './weapons/spearWeapon';
import { Bazooka } from './weapons/bazooka';
import { Grenade } from './weapons/grenade';
import { Flamethrower } from './weapons/flamethrower';
import { Sword } from './weapons/sword';
import { MachineGun } from './weapons/machinegun';

/** One round. A match (best of 5) is a series of these, run by main.ts. */
export interface MatchSetup {
  /** Which team each human player is on (index = player number). */
  humans: number[];
  /** Hat and skin for each human player. */
  looks: BlocLook[];
  /** Weapon for every bloc: [team][slot]. Humans take the first slots of their team. */
  loadouts: WeaponId[][];
  teamCount: 2 | 4;
  difficulty: Difficulty;
  /** Menu background: no sounds, no banners. */
  demo?: boolean;
}

export interface MatchEvents {
  banner(text: string, style?: 'big' | 'small', color?: number): void;
  shake(amount: number): void;
  slowmo(seconds: number): void;
  countdown(n: number | null): void;
  over(winner: TeamDef | null): void;
}

export interface TeamStatus {
  team: TeamDef;
  blocs: { state: Bloc['state']; human: number | null }[];
  bunnyHp: number;
  eliminated: boolean;
}

export interface PlayerStatus {
  player: number;
  team: TeamDef;
  weapon: WeaponId;
  alive: boolean;
  weaponStatus: WeaponStatus;
  dash: number; // 0..1
  revives: number;
}

const NO_INPUT: Controls = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, hasAim: false,
  attack: false, attackPressed: false, attackReleased: false, dashPressed: false, pausePressed: false,
};

/** Spawn spots per team: 2 teams use left/right halves, 4 teams use corners. */
function spawnSpots(team: number, teamCount: number, halfW: number, halfD: number) {
  if (teamCount === 2) {
    const s = team === 0 ? -1 : 1;
    return {
      blocs: [-0.45, 0, 0.45].map((k) => ({ x: s * (halfW - 5), z: k * halfD })),
      bunny: { x: s * (halfW - 2.8), z: 0 },
    };
  }
  const sx = team % 2 === 0 ? -1 : 1, sz = team < 2 ? -1 : 1;
  const cx = sx * (halfW - 6), cz = sz * (halfD - 4.5);
  return {
    blocs: [{ x: cx, z: cz - sz * 2.5 }, { x: cx - sx * 3, z: cz }, { x: cx + sx * 1.5, z: cz + sz * 1.5 }],
    bunny: { x: sx * (halfW - 2.5), z: sz * (halfD - 2.5) },
  };
}

interface Fx {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  kind: 'shock' | 'scorch';
  size: number;
}

const SHOCK_GEO = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
const SCORCH_GEO = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);

export class Match {
  readonly group = new THREE.Group();
  readonly blocs: Bloc[] = [];
  readonly teams: TeamDef[];
  readonly brains = new Map<Bloc, Brain>();
  readonly weapons = new Map<WeaponId, Weapon>();
  readonly eliminated = new Set<number>();
  phase: 'countdown' | 'playing' | 'over' = 'countdown';
  time = 0;
  private countdownT = 3.6;
  private lastCount = 4;
  private drawTimer = 0;
  private sinking: { bloc: Bloc; t: number }[] = [];
  private fx: Fx[] = [];
  /** Counters for balancing (see simulate() in main.ts). */
  readonly stats = { friendlyKills: 0, enemyKills: 0, friendlyBunnyHits: 0, enemyBunnyHits: 0 };

  constructor(
    readonly arena: Arena,
    readonly setup: MatchSetup,
    readonly particles: Particles,
    readonly glow: Particles,
    private events: MatchEvents,
  ) {
    this.teams = TEAMS.slice(0, setup.teamCount);
    const level = AI_LEVELS[setup.difficulty];
    for (const team of this.teams) {
      const spots = setup.teamCount === 2
        ? (({ blocs, bunny }) => ({ blocs: blocs.map(([x, z]) => ({ x, z })), bunny: { x: bunny[0], z: bunny[1] } }))(arena.terrain.spawnFor(team.id))
        : spawnSpots(team.id, setup.teamCount, arena.def.halfW, arena.def.halfD);
      const humansHere = setup.humans.map((t, p) => (t === team.id ? p : -1)).filter((p) => p >= 0);
      spots.blocs.slice(0, TUNING.teams.blocsPerTeam).forEach((s, i) => {
        const human = i < humansHere.length ? humansHere[i] : null;
        const look = human !== null ? setup.looks[human] : undefined;
        const weaponId = setup.loadouts[team.id]?.[i] ?? 'spear';
        const b = new Bloc('bloc', team, s.x, s.z, human, weaponId, look);
        this.weaponFor(weaponId).attach(b);
        this.add(b, human === null ? new Brain(b, this, level) : null);
      });
      const bunny = new Bloc('bunny', team, spots.bunny.x, spots.bunny.z, null, 'spear');
      this.add(bunny, new Brain(bunny, this, level));
    }
    if (setup.demo) {
      this.phase = 'playing';
      this.countdownT = 0;
    }
  }

  private weaponFor(id: WeaponId): Weapon {
    let w = this.weapons.get(id);
    if (!w) {
      w = id === 'spear' ? new SpearWeapon(this)
        : id === 'bazooka' ? new Bazooka(this)
        : id === 'grenade' ? new Grenade(this)
        : id === 'sword' ? new Sword(this)
        : id === 'machinegun' ? new MachineGun(this)
        : new Flamethrower(this);
      this.weapons.set(id, w);
    }
    return w;
  }

  get terrain() {
    return this.arena.terrain;
  }

  private add(b: Bloc, brain: Brain | null) {
    this.blocs.push(b);
    this.group.add(b.view.root);
    if (brain) this.brains.set(b, brain);
  }

  say(text: string, style: 'big' | 'small' = 'big', color?: number) {
    if (!this.setup.demo && this.phase !== 'over') this.events.banner(text, style, color);
  }

  sfx(fn: () => void) {
    if (!this.setup.demo) fn();
  }

  shake(amount: number) {
    if (!this.setup.demo) this.events.shake(amount);
  }

  // ───────────────────────── simulation ─────────────────────────

  update(dt: number, controls: (Controls | null)[]) {
    this.time += dt;
    if (this.phase !== 'countdown') this.arena.step(dt);
    if (this.phase === 'countdown') {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT - 0.6);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) { this.events.countdown(n); SFX.beep(); }
        else { this.events.countdown(null); this.say(TEXT.fight); SFX.beep(true); this.phase = 'playing'; }
      }
    }
    const frozen = this.phase === 'countdown';

    for (const b of this.blocs) {
      if (!b.alive) continue;
      let c = NO_INPUT;
      if (!frozen) {
        if (b.human !== null) c = controls[b.human] ?? NO_INPUT;
        else c = this.brains.get(b)?.think(dt) ?? NO_INPUT;
      }
      this.drive(b, c, dt);
    }

    this.collide();

    for (const b of this.blocs) {
      if (b.alive && !b.airborne && this.arena.deadlyAt(b.x, b.z)) this.eaten(b);
    }

    for (const w of this.weapons.values()) w.update(dt);
    this.updateRevives(dt);
    this.updateSinking(dt);
    if (this.phase === 'playing') this.checkEnd(dt);
  }

  private drive(b: Bloc, c: Controls, dt: number) {
    const T = TUNING.bloc;
    if (!b.airborne && b.crouch <= 0) b.jumpCooldown = Math.max(0, b.jumpCooldown - dt);
    b.shield = Math.max(0, b.shield - dt);

    const moving = c.moveX !== 0 || c.moveZ !== 0;
    if (c.hasAim) {
      b.aimX = c.aimX;
      b.aimZ = c.aimZ;
    } else if (moving) {
      const m = Math.hypot(c.moveX, c.moveZ);
      b.aimX = c.moveX / m;
      b.aimZ = c.moveZ / m;
    }

    if (!b.isBunny) {
      // Jump: bend the legs for a second, then hop the way you're pushing (or facing).
      if (c.dashPressed && b.jumpCooldown <= 0 && b.crouch <= 0 && !b.airborne) {
        b.crouch = T.jumpCrouch;
        this.sfx(SFX.jumpCrouch);
      }
      if (b.crouch > 0) {
        b.crouch -= dt;
        if (b.crouch <= 0) {
          const m = Math.hypot(c.moveX, c.moveZ);
          b.jumpX = m > 0 ? c.moveX / m : b.aimX;
          b.jumpZ = m > 0 ? c.moveZ / m : b.aimZ;
          b.air = T.jumpTime;
          this.sfx(SFX.jump);
          this.particles.burst({ x: b.x, y: 0.1, z: b.z, count: 12, color: 0xd8cfb0, speed: 2, up: 1.5, size: 0.14, life: 0.5 });
        }
      }
      b.punchCooldown = Math.max(0, b.punchCooldown - dt);
      if (this.outOfAmmo(b)) {
        b.firing = false;
        // Holding the button keeps punching.
        if ((c.attackPressed || c.attack) && b.punchCooldown <= 0) this.punch(b);
      } else {
        this.weaponFor(b.weapon).control(b, c, dt);
      }
    } else if (c.dashPressed && b.jumpCooldown <= 0 && (c.moveX || c.moveZ)) {
      // Bunny dodge-hop.
      const B = TUNING.bunny, m = Math.hypot(c.moveX, c.moveZ);
      b.hop = B.hopTime;
      b.jumpX = c.moveX / m;
      b.jumpZ = c.moveZ / m;
      b.jumpCooldown = B.hopCooldown;
    }

    if (b.air > 0) {
      b.air -= dt;
      const v = T.jumpDistance / T.jumpTime;
      b.vx = b.jumpX * v;
      b.vz = b.jumpZ * v;
      if (b.air <= 0) {
        b.air = 0;
        b.jumpCooldown = T.jumpCooldown;
        this.sfx(SFX.land);
        this.particles.burst({ x: b.x, y: 0.1, z: b.z, count: 14, color: 0xd8cfb0, speed: 2.5, up: 1.5, size: 0.15, life: 0.5 });
      }
    } else if (b.hop > 0) {
      b.hop -= dt;
      b.vx = b.jumpX * TUNING.bunny.hopSpeed;
      b.vz = b.jumpZ * TUNING.bunny.hopSpeed;
    } else if (b.crouch > 0) {
      // Feet planted while the legs bend.
      b.vx = damp(b.vx, 0, 18, dt);
      b.vz = damp(b.vz, 0, 18, dt);
    } else {
      // Spraying flames slows you down a bit.
      const speed = b.firing ? b.speed * 0.6 : b.speed;
      b.vx = damp(b.vx, c.moveX * speed, 18, dt);
      b.vz = damp(b.vz, c.moveZ * speed, 18, dt);
    }
    const wx = b.x + b.vx * dt, wz = b.z + b.vz * dt;
    // Computer players never walk into the water by accident (humans can!).
    if (b.human === null && !b.airborne && this.arena.deadlyAt(wx, wz)) {
      b.vx = b.vz = 0;
    } else {
      b.x = wx;
      b.z = wz;
    }
    // Explosion push applies to everyone: a blast can knock anybody into the pond.
    b.x += b.kbX * dt;
    b.z += b.kbZ * dt;
    b.kbX = damp(b.kbX, 0, TUNING.knockback.decay, dt);
    b.kbZ = damp(b.kbZ, 0, TUNING.knockback.decay, dt);
    b.yaw = Math.atan2(b.aimX, b.aimZ);
  }

  private collide() {
    const live = this.blocs.filter((b) => b.alive);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          if (a.airborne || b.airborne) continue; // jump over each other
          const dx = b.x - a.x, dz = b.z - a.z;
          const min = a.radius + b.radius;
          const d = Math.hypot(dx, dz);
          if (d >= min || d < 1e-5) continue;
          const push = min - d;
          // Bunnies stand their ground: blocs barely move them.
          const wa = a.isBunny && !b.isBunny ? 0.1 : b.isBunny && !a.isBunny ? 0.9 : 0.5;
          a.x -= (dx / d) * push * wa;
          a.z -= (dz / d) * push * wa;
          b.x += (dx / d) * push * (1 - wa);
          b.z += (dz / d) * push * (1 - wa);
        }
      }
      for (const b of live) {
        const o = this.terrain.pushOut(b.x, b.z, b.radius);
        b.x = o.x;
        b.z = o.z;
      }
    }
  }

  // ───────────────────────── hits ─────────────────────────

  /** Grenades or fuel used up: this bloc fights with its fists. */
  outOfAmmo(b: Bloc) {
    return (b.weapon === 'grenade' && b.ammo <= 0 && b.charge < 0) || (b.weapon === 'flamethrower' && b.fuel <= 0);
  }

  /** Who a punch from b would land on: the closest enemy in front, within reach. */
  punchTarget(b: Bloc) {
    let best: Bloc | null = null, bestD = Infinity;
    const aim = Math.atan2(b.aimX, b.aimZ);
    for (const t of this.blocs) {
      if (!t.alive || t.team === b.team || t.shield > 0 || t.airborne) continue;
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
      if (d - b.radius - t.radius > PUNCH.reach) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - aim)) > (PUNCH.coneDeg * Math.PI) / 180) continue;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  private punch(b: Bloc) {
    b.punchCooldown = PUNCH.cooldown;
    b.view.punchAnim();
    const t = this.punchTarget(b);
    if (!t) { this.sfx(SFX.whiff); return; }
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    t.kbX += nx * PUNCH.push * (t.isBunny ? 0.5 : 1);
    t.kbZ += nz * PUNCH.push * (t.isBunny ? 0.5 : 1);
    t.punches++;
    t.view.hit();
    this.sfx(SFX.punch);
    this.glow.burst({ x: t.x - nx * t.radius, y: 1, z: t.z - nz * t.radius, count: 8, color: 0xffe066, intensity: 2.5, speed: 3, up: 3, size: 0.1, life: 0.4, gravity: 2 });
    this.shake(0.15);
    if (t.isBunny) {
      if (t.punches >= PUNCH.perBunnyHeart) {
        t.punches = 0;
        this.damageBunny(t, b, nx, nz);
      } else {
        t.view.setHearts(t.hp, TUNING.bunny.hp, true);
      }
    } else if (t.punches >= PUNCH.toKnockOut) {
      this.kill(t, b, nx, nz);
    } else {
      t.view.setPunches(t.punches, PUNCH.toKnockOut);
    }
  }

  kill(b: Bloc, by: Bloc | null, dirX = 1, dirZ = 0) {
    if (!b.alive) return;
    if (by) {
      if (by.team === b.team) this.stats.friendlyKills++;
      else this.stats.enemyKills++;
    }
    b.state = 'dead';
    b.punches = 0;
    b.bulletHits = 0;
    b.view.setPunches(0, PUNCH.toKnockOut);
    b.reviveProgress = 0;
    b.crouch = b.air = 0;
    b.kbX = b.kbZ = 0;
    b.view.setDead(true);
    b.view.hit();
    this.weaponFor(b.weapon).onDeath(b, dirX, dirZ);
    this.particles.burst({ x: b.x, y: 0.9, z: b.z, count: 26, color: b.team.color, speed: 5, up: 5, size: 0.2 });
    this.glow.burst({ x: b.x, y: 0.9, z: b.z, count: 14, color: 0xfff3b0, intensity: 3, speed: 6, up: 3, size: 0.09, life: 0.4, gravity: 0 });
    this.sfx(SFX.hit);
    this.shake(b.human !== null ? 0.6 : 0.35);
    if (b.human !== null) this.say(`P${b.human + 1} is down! A teammate can revive you`, 'small', b.team.color);
  }

  damageBunny(r: Bloc, by: Bloc | null, dirX: number, dirZ: number, hearts = 1) {
    if (this.phase === 'over' || !r.alive) return;
    if (by) {
      if (by.team === r.team) this.stats.friendlyBunnyHits++;
      else this.stats.enemyBunnyHits++;
    }
    r.hp = Math.max(0, r.hp - hearts);
    r.view.hit();
    r.view.setHearts(r.hp, TUNING.bunny.hp, r.punches > 0);
    this.sfx(SFX.bunnyHit);
    this.particles.burst({ x: r.x, y: 0.9, z: r.z, count: 10, color: 0xffffff, speed: 2.5, up: 3, size: 0.12, gravity: 3, dirX, dirZ, spread: 2 });
    this.shake(0.3);
    if (r.hp <= 0) this.poofBunny(r);
  }

  private poofBunny(r: Bloc) {
    r.state = 'gone';
    r.view.poof();
    this.sfx(SFX.bunnyPoof);
    // A soft cloud of fluff and little hearts.
    this.particles.burst({ x: r.x, y: 0.8, z: r.z, count: 40, color: 0xffffff, speed: 3, up: 3, size: 0.28, life: 1.4, gravity: -0.5 });
    this.glow.burst({ x: r.x, y: 1, z: r.z, count: 24, color: 0xff7aa8, intensity: 2.2, speed: 2, up: 4, size: 0.12, life: 1.2, gravity: -1 });
    this.shake(0.5);
    this.eliminate(r.team);
  }

  /** Kills blocs inside `blast`, chips bunnies, and pushes everyone within `pushR`. */
  explode(x: number, z: number, blast: number, pushR: number, push: number, bunnyDamage: number, owner: Bloc, big: boolean) {
    let kills = 0;
    for (const b of this.blocs) {
      if (!b.alive) continue;
      const dx = b.x - x, dz = b.z - z;
      const d = Math.hypot(dx, dz);
      const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
      if (d < blast + b.radius * 0.5 && b.shield <= 0) {
        if (b.isBunny) this.damageBunny(b, owner, nx, nz, bunnyDamage);
        else { this.kill(b, owner, nx, nz); kills++; }
      } else if (d < pushR) {
        const k = (1 - d / pushR) * push * (b.isBunny ? 0.4 : 1);
        b.kbX += nx * k;
        b.kbZ += nz * k;
      }
    }
    if (kills >= 2) this.multiHit(kills, owner.team.color);

    const s = big ? 1.4 : 1;
    this.glow.burst({ x, y: 0.6, z, count: Math.round(50 * s), color: 0xffb040, intensity: 3.5, speed: 7 * s, up: 4, size: 0.2 * s, life: 0.5, gravity: 1 });
    this.glow.burst({ x, y: 0.6, z, count: Math.round(25 * s), color: 0xfff0a0, intensity: 4, speed: 4 * s, up: 3, size: 0.15, life: 0.3, gravity: 0 });
    this.particles.burst({ x, y: 0.5, z, count: Math.round(30 * s), color: 0x5d4a3a, speed: 6 * s, up: 7, size: 0.16, life: 1.0 });
    this.particles.burst({ x, y: 0.8, z, count: Math.round(14 * s), color: 0x666666, speed: 1.5, up: 1.5, size: 0.5 * s, life: 1.4, gravity: -1 });
    this.addFx('shock', x, z, pushR, 0.35);
    if (!this.arena.deadlyAt(x, z)) this.addFx('scorch', x, z, blast * 0.8, 9);
    // Trees, rocks and crates in the blast break.
    this.arena.destroyed(this.terrain.blast(x, z, blast));
    this.sfx(() => SFX.boom(big));
    this.shake(big ? 0.85 : 0.6);
  }

  multiHit(n: number, color: number) {
    this.say(n >= 3 ? TEXT.tripleHit : TEXT.doubleHit, 'big', color);
    this.sfx(SFX.double);
    if (!this.setup.demo) this.events.slowmo(0.7);
  }

  private addFx(kind: Fx['kind'], x: number, z: number, size: number, dur: number) {
    const mat = kind === 'shock'
      ? new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, depthWrite: false, opacity: 0.55 });
    const mesh = new THREE.Mesh(kind === 'shock' ? SHOCK_GEO : SCORCH_GEO, mat);
    mesh.position.set(x, kind === 'shock' ? 0.3 : 0.025, z);
    mesh.scale.setScalar(kind === 'shock' ? 0.1 : size);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.fx.push({ mesh, t: 0, dur, kind, size });
  }

  private eaten(b: Bloc) {
    b.state = 'eaten';
    b.view.hit();
    this.sinking.push({ bloc: b, t: 0 });
    const kind = this.arena.deadlyAt(b.x, b.z) ?? 'pond';
    this.arena.swallow(kind, b.x, b.z, b.isBunny ? 0xffffff : b.team.color, !this.setup.demo);
    if (!b.isBunny) this.weaponFor(b.weapon).onEaten(b);
    if (kind === 'lava') b.view.hit();
    this.shake(0.4);
    this.say(TEXT.swallowed[kind], b.human !== null || b.isBunny ? 'big' : 'small', b.team.color);
    if (b.isBunny) this.eliminate(b.team);
  }

  private updateSinking(dt: number) {
    for (let i = this.sinking.length - 1; i >= 0; i--) {
      const s = this.sinking[i];
      s.t += dt;
      const r = s.bloc.view.root;
      r.position.y = -s.t * 1.1;
      r.rotation.z = Math.sin(s.t * 30) * 0.15;
      if (s.t > 1.6) {
        r.visible = false;
        this.sinking.splice(i, 1);
      }
    }
  }

  private eliminate(team: TeamDef) {
    if (this.eliminated.has(team.id)) return;
    this.eliminated.add(team.id);
    this.say(TEXT.bunnyPoofed(team.name), 'small', team.color);
    // With 4 teams, a beaten team's blocs vanish in a puff.
    if (this.teams.length > 2) {
      for (const b of this.blocs) {
        if (b.team !== team || b.isBunny || b.state === 'eaten' || b.state === 'gone') continue;
        b.state = 'gone';
        b.view.root.visible = false;
        this.particles.burst({ x: b.x, y: 0.6, z: b.z, count: 20, color: 0xffffff, speed: 3, up: 3, size: 0.2 });
      }
    }
  }

  private updateRevives(dt: number) {
    const R = TUNING.revive;
    for (const d of this.blocs) {
      if (d.state !== 'dead') continue;
      // Any teammate standing on the body can revive, the bunny too (and faster).
      const helpers = this.blocs.filter((h) =>
        h.alive && h.team === d.team && h.revivesLeft > 0 &&
        Math.hypot(h.x - d.x, h.z - d.z) < R.radius + (h.isBunny ? 0.25 : 0));
      const helper = helpers.find((h) => h.isBunny) ?? helpers[0];
      d.reviveProgress = helper
        ? d.reviveProgress + dt / (helper.isBunny ? R.bunnyTime : R.time)
        : Math.max(0, d.reviveProgress - dt / R.time);
      d.view.setRevive(d.reviveProgress);
      if (helper && d.reviveProgress >= 1) {
        helper.revivesLeft--;
        d.state = 'alive';
        d.reviveProgress = 0;
        d.shield = 1;
        d.burn = 0;
        d.view.setDead(false);
        d.view.blink(1);
        this.sfx(SFX.revive);
        this.glow.burst({ x: d.x, y: 0.4, z: d.z, count: 30, color: 0x7dff8a, intensity: 2.5, speed: 2, up: 6, size: 0.1, life: 0.9, gravity: 1 });
        if (d.human !== null || helper.human !== null) this.say(TEXT.revived, 'small', d.team.color);
      }
    }
  }

  private checkEnd(dt: number) {
    const left = this.teams.filter((t) => !this.eliminated.has(t.id));
    if (left.length <= 1) return this.finish(left[0] ?? null);
    // Nobody left standing on any team: a draw. (Out of ammo still counts: you can punch.)
    const canFight = this.blocs.some((b) => b.alive && !b.isBunny && !this.eliminated.has(b.team.id));
    this.drawTimer = canFight ? 0 : this.drawTimer + dt;
    if (this.drawTimer > 2.5) this.finish(null);
  }

  private finish(winner: TeamDef | null) {
    this.phase = 'over';
    this.events.over(winner);
  }

  // ───────────────────────── queries ─────────────────────────

  threats() {
    return [...this.weapons.values()].flatMap((w) => w.threats());
  }

  dangers() {
    return [...this.weapons.values()].flatMap((w) => w.dangers());
  }

  status(): TeamStatus[] {
    return this.teams.map((team) => {
      const mine = this.blocs.filter((b) => b.team === team);
      const bunny = mine.find((b) => b.isBunny)!;
      return {
        team,
        blocs: mine.filter((b) => !b.isBunny).map((b) => ({ state: b.state, human: b.human })),
        bunnyHp: Math.max(0, bunny.hp),
        eliminated: this.eliminated.has(team.id),
      };
    });
  }

  players(): PlayerStatus[] {
    return this.blocs
      .filter((b) => b.human !== null)
      .map((b) => ({
        player: b.human!,
        team: b.team,
        weapon: b.weapon,
        alive: b.alive,
        weaponStatus: this.weaponFor(b.weapon).status(b),
        dash: b.crouch > 0 || b.airborne ? 0 : 1 - b.jumpCooldown / TUNING.bloc.jumpCooldown,
        revives: b.revivesLeft,
      }))
      .sort((a, b) => a.player - b.player);
  }

  human(player: number) {
    return this.blocs.find((b) => b.human === player) ?? null;
  }

  // ───────────────────────── drawing ─────────────────────────

  render(dt: number) {
    const T = TUNING.bloc;
    for (const b of this.blocs) {
      if (b.state === 'eaten') continue; // the sinking animation moves it
      b.view.root.position.set(b.x, b.view.root.position.y, b.z);
      if (b.human !== null) b.view.setCooldown(b.crouch > 0 || b.airborne ? 0 : 1 - b.jumpCooldown / T.jumpCooldown);
      const k = b.airborne ? 1 - b.air / T.jumpTime : 0;
      b.view.update(dt, {
        speed: b.alive ? Math.hypot(b.vx + b.kbX, b.vz + b.kbZ) : 0,
        yaw: b.yaw,
        crouch: b.crouch > 0 ? Math.min(1, (T.jumpCrouch - b.crouch) / 0.25) : 0,
        jumpY: 4 * T.jumpHeight * k * (1 - k),
        // Spear and grenade leave the hand when thrown; bazooka and flamethrower stay.
        holdingWeapon: b.armed || b.weapon === 'bazooka' || b.weapon === 'machinegun' || b.weapon === 'sword' || (b.weapon === 'flamethrower' && b.fuel > 0),
      });
    }
    for (const w of this.weapons.values()) w.render(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      if (f.kind === 'shock') {
        f.mesh.scale.setScalar(0.3 + f.size * Math.sqrt(k));
        mat.opacity = 1 - k;
      } else {
        mat.opacity = 0.55 * Math.min(1, (1 - k) * 3);
      }
      if (k >= 1) {
        f.mesh.removeFromParent();
        mat.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const w of this.weapons.values()) w.dispose();
    this.group.removeFromParent();
  }
}
