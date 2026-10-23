import * as THREE from 'three';
import type { Controls } from '@engine/input';
import { clamp, damp, segmentCircle, wrapAngle } from '@engine/math';
import type { Particles } from '@engine/particles';
import { Bloc } from './entities/bloc';
import { Spear } from './entities/spear';
import { Brain } from './ai/brain';
import type { Arena } from './world/arena';
import { TEAMS, type TeamDef } from './data/teams';
import { AI_LEVELS, TUNING, type Difficulty } from './data/tuning';
import { SPEAR } from './data/weapons';
import { SFX } from './data/sounds';
import { TEXT } from './data/text';

export interface MatchSetup {
  /** Which team each human player is on (index = player number). */
  humans: number[];
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
  robotHp: number;
  eliminated: boolean;
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
      robot: { x: s * (halfW - 2.8), z: 0 },
    };
  }
  const sx = team % 2 === 0 ? -1 : 1, sz = team < 2 ? -1 : 1;
  const cx = sx * (halfW - 6), cz = sz * (halfD - 4.5);
  return {
    blocs: [{ x: cx, z: cz - sz * 2.5 }, { x: cx - sx * 3, z: cz }, { x: cx + sx * 1.5, z: cz + sz * 1.5 }],
    robot: { x: sx * (halfW - 2.5), z: sz * (halfD - 2.5) },
  };
}

export class Match {
  readonly group = new THREE.Group();
  readonly blocs: Bloc[] = [];
  readonly spears: Spear[] = [];
  readonly teams: TeamDef[];
  readonly brains = new Map<Bloc, Brain>();
  readonly eliminated = new Set<number>();
  phase: 'countdown' | 'playing' | 'over' = 'countdown';
  time = 0;
  private countdownT = 3.6;
  private lastCount = 4;
  private drawTimer = 0;
  private sinking: { bloc: Bloc; t: number }[] = [];
  /** Counters for balancing (see simulate() in main.ts). */
  readonly stats = { friendlyKills: 0, enemyKills: 0, friendlyRobotHits: 0, enemyRobotHits: 0 };

  constructor(
    readonly arena: Arena,
    readonly setup: MatchSetup,
    private particles: Particles,
    private glow: Particles,
    private events: MatchEvents,
  ) {
    this.teams = TEAMS.slice(0, setup.teamCount);
    const level = AI_LEVELS[setup.difficulty];
    for (const team of this.teams) {
      const spots = spawnSpots(team.id, setup.teamCount, arena.def.halfW, arena.def.halfD);
      const humansHere = setup.humans.map((t, p) => (t === team.id ? p : -1)).filter((p) => p >= 0);
      spots.blocs.slice(0, TUNING.teams.blocsPerTeam).forEach((s, i) => {
        const human = i < humansHere.length ? humansHere[i] : null;
        const b = new Bloc('bloc', team, s.x, s.z, human);
        const spear = new Spear(b);
        b.spear = spear;
        b.holdingSpear = true;
        spear.addTo(this.group);
        this.spears.push(spear);
        this.add(b, human === null ? new Brain(b, this, level) : null);
      });
      const robot = new Bloc('robot', team, spots.robot.x, spots.robot.z, null);
      this.add(robot, new Brain(robot, this, level));
    }
    if (setup.demo) {
      this.phase = 'playing';
      this.countdownT = 0;
    }
  }

  private add(b: Bloc, brain: Brain | null) {
    this.blocs.push(b);
    this.group.add(b.view.root);
    if (brain) this.brains.set(b, brain);
  }

  private say(text: string, style: 'big' | 'small' = 'big', color?: number) {
    if (!this.setup.demo) this.events.banner(text, style, color);
  }

  private sfx(fn: () => void) {
    if (!this.setup.demo) fn();
  }

  // ───────────────────────── simulation ─────────────────────────

  update(dt: number, controls: (Controls | null)[]) {
    this.time += dt;
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
      if (b.alive && this.arena.pondAt(b.x, b.z)) this.eaten(b);
    }

    for (const s of this.spears) this.updateSpear(s, dt);
    this.updateRevives(dt);
    this.updateSinking(dt);
    if (this.phase === 'playing') this.checkEnd(dt);
  }

  private drive(b: Bloc, c: Controls, dt: number) {
    const T = TUNING.bloc;
    b.dashCooldown = Math.max(0, b.dashCooldown - dt);
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

    if (!b.isRobot) {
      if (c.dashPressed && b.dashCooldown <= 0) {
        b.dashCooldown = T.dashCooldown;
        b.dashTime = T.dashTime;
        const m = Math.hypot(c.moveX, c.moveZ);
        b.dashX = m > 0 ? c.moveX / m : b.aimX;
        b.dashZ = m > 0 ? c.moveZ / m : b.aimZ;
        this.sfx(SFX.dash);
        this.particles.burst({ x: b.x, y: 0.15, z: b.z, count: 10, color: 0xe8e2c8, speed: 2, up: 1.5, size: 0.14, life: 0.5, dirX: -b.dashX, dirZ: -b.dashZ, spread: 1.4 });
      }
      if (c.attackPressed && b.holdingSpear && b.spear) this.throwSpear(b);
    }

    if (b.dashTime > 0) {
      b.dashTime -= dt;
      const v = T.dashDistance / T.dashTime;
      b.vx = b.dashX * v;
      b.vz = b.dashZ * v;
    } else {
      b.vx = damp(b.vx, c.moveX * b.speed, 18, dt);
      b.vz = damp(b.vz, c.moveZ * b.speed, 18, dt);
    }
    const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
    // Computer players never walk into the water by accident (humans can!).
    if (b.human === null && this.arena.pondAt(nx, nz)) {
      b.vx = b.vz = 0;
    } else {
      b.x = nx;
      b.z = nz;
    }
    b.yaw = Math.atan2(b.aimX, b.aimZ);
  }

  private throwSpear(b: Bloc) {
    let dx = b.aimX, dz = b.aimZ;
    if (b.human !== null) [dx, dz] = this.aimAssist(b, dx, dz);
    b.holdingSpear = false;
    b.spear!.launch(b.x + dx * 0.5, b.z + dz * 0.5, dx, dz);
    b.view.throwAnim();
    this.sfx(SFX.throw);
  }

  /** Nudge a human's aim onto the enemy closest to where they're pointing. */
  private aimAssist(b: Bloc, dx: number, dz: number): [number, number] {
    const maxAngle = (TUNING.aimAssistDeg.human * Math.PI) / 180;
    const aim = Math.atan2(dx, dz);
    let best: Bloc | null = null, bestA = maxAngle;
    for (const o of this.blocs) {
      if (!o.alive || o.team === b.team) continue;
      const ox = o.x - b.x, oz = o.z - b.z;
      if (Math.hypot(ox, oz) > SPEAR.range) continue;
      const a = Math.abs(wrapAngle(Math.atan2(ox, oz) - aim));
      if (a < bestA) { bestA = a; best = o; }
    }
    if (!best) return [dx, dz];
    const ox = best.x - b.x, oz = best.z - b.z, l = Math.hypot(ox, oz);
    return [ox / l, oz / l];
  }

  private collide() {
    const { halfW, halfD } = this.arena.def;
    const live = this.blocs.filter((b) => b.alive);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          const dx = b.x - a.x, dz = b.z - a.z;
          const min = a.radius + b.radius;
          const d = Math.hypot(dx, dz);
          if (d >= min || d < 1e-5) continue;
          const push = min - d;
          // Robots are heavy: blocs barely move them.
          const wa = a.isRobot && !b.isRobot ? 0.1 : b.isRobot && !a.isRobot ? 0.9 : 0.5;
          a.x -= (dx / d) * push * wa;
          a.z -= (dz / d) * push * wa;
          b.x += (dx / d) * push * (1 - wa);
          b.z += (dz / d) * push * (1 - wa);
        }
      }
      for (const b of live) {
        for (const o of this.arena.obstacles) {
          const dx = b.x - o.x, dz = b.z - o.z;
          const d = Math.hypot(dx, dz), min = o.r + b.radius;
          if (d < min && d > 1e-5) {
            b.x = o.x + (dx / d) * min;
            b.z = o.z + (dz / d) * min;
          }
        }
        b.x = clamp(b.x, -halfW + b.radius, halfW - b.radius);
        b.z = clamp(b.z, -halfD + b.radius, halfD - b.radius);
      }
    }
  }

  private updateSpear(s: Spear, dt: number) {
    const owner = s.owner;
    switch (s.state) {
      case 'flying': this.flySpear(s, dt); break;
      case 'falling':
        s.y -= dt * 4;
        s.x += s.dirX * dt * 3;
        s.z += s.dirZ * dt * 3;
        if (s.y <= 0.12) {
          s.y = 0.12;
          s.state = 'grounded';
          if (this.arena.pondAt(s.x, s.z)) {
            s.state = 'sinking';
            s.timer = SPEAR.waterReturn;
            this.sfx(SFX.splash);
            this.particles.burst({ x: s.x, y: 0.1, z: s.z, count: 14, color: 0xe8fbff, speed: 2, up: 4, size: 0.1 });
          }
        }
        break;
      case 'sinking':
        s.y = Math.max(-1, s.y - dt * 0.8);
        s.timer -= dt;
        // The piranhas spit it back out to its owner.
        if (s.timer <= 0 && owner.state !== 'eaten' && owner.state !== 'gone') {
          s.state = 'held';
          owner.holdingSpear = true;
        }
        break;
    }
    if ((s.state === 'grounded' || s.state === 'stuck' || s.state === 'falling') && owner.alive) {
      if (Math.hypot(owner.x - s.x, owner.z - s.z) < SPEAR.pickupRadius + (s.state === 'stuck' ? 0.4 : 0)) {
        s.state = 'held';
        owner.holdingSpear = true;
        if (owner.human !== null) this.sfx(SFX.pickup);
      }
    }
  }

  private flySpear(s: Spear, dt: number) {
    const { halfW, halfD } = this.arena.def;
    const step = SPEAR.speed * dt;
    const nx = s.x + s.dirX * step, nz = s.z + s.dirZ * step;
    let tStop = 1;
    let stop: 'obstacle' | 'wall' | null = null;
    for (const o of this.arena.obstacles) {
      const t = segmentCircle(s.x, s.z, nx, nz, o.x, o.z, o.r + 0.05);
      if (t !== null && t < tStop) { tStop = t; stop = 'obstacle'; }
    }
    const wallT = (from: number, to: number, lim: number) =>
      Math.abs(to) > lim ? (Math.sign(to) * lim - from) / (to - from) : null;
    for (const t of [wallT(s.x, nx, halfW), wallT(s.z, nz, halfD)]) {
      if (t !== null && t >= 0 && t < tStop) { tStop = t; stop = 'wall'; }
    }

    const hits: { b: Bloc; t: number }[] = [];
    for (const b of this.blocs) {
      if (!b.alive || b === s.owner || s.hit.has(b.id) || b.shield > 0) continue;
      const t = segmentCircle(s.x, s.z, nx, nz, b.x, b.z, b.radius + 0.18);
      if (t !== null && t <= tStop) hits.push({ b, t });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const { b, t } of hits) {
      s.hit.add(b.id);
      const hx = s.x + (nx - s.x) * t, hz = s.z + (nz - s.z) * t;
      if (b.isRobot) {
        if (b.team === s.owner.team) this.stats.friendlyRobotHits++; else this.stats.enemyRobotHits++;
        this.damageRobot(b, s);
        this.drop(s, hx - s.dirX * 0.6, hz - s.dirZ * 0.6);
        return;
      }
      if (b.team === s.owner.team) this.stats.friendlyKills++; else this.stats.enemyKills++;
      this.kill(b, s);
      s.kills++;
      if (s.kills === 2) this.doubleHit(s);
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
      this.sfx(SFX.thunk);
      this.particles.burst({ x: s.x + s.dirX * 0.9, y: 1, z: s.z + s.dirZ * 0.9, count: 8, color: 0x8a6a4a, speed: 2.5, up: 2, size: 0.1, dirX: -s.dirX, dirZ: -s.dirZ });
    } else if (stop === 'wall') {
      this.drop(s, s.x - s.dirX * 0.3, s.z - s.dirZ * 0.3);
      this.sfx(SFX.thunk);
    } else if (s.traveled >= SPEAR.range) {
      s.state = 'falling';
    }
  }

  private drop(s: Spear, x: number, z: number) {
    s.x = x;
    s.z = z;
    s.state = 'falling';
  }

  private doubleHit(s: Spear) {
    this.say(TEXT.doubleHit, 'big', s.owner.team.color);
    this.sfx(SFX.double);
    if (!this.setup.demo) this.events.slowmo(0.7);
  }

  kill(b: Bloc, by: Spear | null) {
    b.state = 'dead';
    b.reviveProgress = 0;
    b.dashTime = 0;
    b.view.setDead(true);
    b.view.hit();
    this.particles.burst({ x: b.x, y: 0.9, z: b.z, count: 26, color: b.team.color, speed: 5, up: 5, size: 0.2 });
    this.glow.burst({ x: b.x, y: 0.9, z: b.z, count: 14, color: 0xfff3b0, intensity: 3, speed: 6, up: 3, size: 0.09, life: 0.4, gravity: 0 });
    this.sfx(SFX.hit);
    if (!this.setup.demo) this.events.shake(b.human !== null ? 0.6 : 0.35);
    if (b.holdingSpear && b.spear) {
      b.holdingSpear = false;
      b.spear.dirX = by ? by.dirX : 1;
      b.spear.dirZ = by ? by.dirZ : 0;
      this.drop(b.spear, b.x + 0.5, b.z + 0.3);
      b.spear.y = 0.6;
    }
    if (b.human !== null) this.say(`P${b.human + 1} is down! A teammate can revive you`, 'small', b.team.color);
  }

  private eaten(b: Bloc) {
    b.state = 'eaten';
    b.view.hit();
    this.sinking.push({ bloc: b, t: 0 });
    const pond = this.arena.pondAt(b.x, b.z);
    pond?.feed(b.x, b.z, b.team.color, !this.setup.demo);
    if (b.holdingSpear && b.spear) {
      b.holdingSpear = false;
      b.spear.state = 'sinking';
      b.spear.timer = Infinity;
      b.spear.x = b.x; b.spear.z = b.z; b.spear.y = -2;
    }
    if (!this.setup.demo) this.events.shake(0.4);
    this.say(TEXT.eaten, b.human !== null ? 'big' : 'small', b.team.color);
    if (b.isRobot) this.eliminate(b.team);
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

  private damageRobot(r: Bloc, s: Spear) {
    if (this.phase === 'over') return;
    r.hp--;
    r.view.hit();
    r.view.setHearts(r.hp, TUNING.robot.hp);
    this.sfx(SFX.robotHit);
    this.glow.burst({ x: r.x, y: 1.2, z: r.z, count: 16, color: 0xffe08a, intensity: 3, speed: 5, up: 3, size: 0.08, life: 0.4, gravity: 4, dirX: -s.dirX, dirZ: -s.dirZ, spread: 2 });
    if (!this.setup.demo) this.events.shake(0.3);
    if (r.hp <= 0) {
      r.state = 'gone';
      r.view.setWreck();
      this.sfx(SFX.robotDie);
      this.particles.burst({ x: r.x, y: 1, z: r.z, count: 40, color: 0x6d757c, speed: 6, up: 7, size: 0.22 });
      this.glow.burst({ x: r.x, y: 1, z: r.z, count: 40, color: 0xff9a3a, intensity: 3, speed: 7, up: 4, size: 0.14, life: 0.6, gravity: 2 });
      if (!this.setup.demo) this.events.shake(0.9);
      this.eliminate(r.team);
    }
  }

  private eliminate(team: TeamDef) {
    if (this.eliminated.has(team.id)) return;
    this.eliminated.add(team.id);
    this.say(TEXT.robotDown(team.name), 'small', team.color);
    // With 4 teams, a beaten team's blocs vanish in a puff.
    if (this.teams.length > 2) {
      for (const b of this.blocs) {
        if (b.team !== team || b.isRobot || b.state === 'eaten' || b.state === 'gone') continue;
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
      const helper = this.blocs.find((h) =>
        h.alive && !h.isRobot && h.team === d.team && h.revivesLeft > 0 &&
        Math.hypot(h.x - d.x, h.z - d.z) < R.radius);
      d.reviveProgress = helper
        ? d.reviveProgress + dt / R.time
        : Math.max(0, d.reviveProgress - dt / R.time);
      d.view.setRevive(d.reviveProgress);
      if (helper && d.reviveProgress >= 1) {
        helper.revivesLeft--;
        d.state = 'alive';
        d.reviveProgress = 0;
        d.shield = 1;
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
    // Nobody left who can throw: a draw.
    const anyFighter = this.blocs.some((b) => b.alive && !b.isRobot && !this.eliminated.has(b.team.id));
    this.drawTimer = anyFighter ? 0 : this.drawTimer + dt;
    if (this.drawTimer > 2) this.finish(null);
  }

  private finish(winner: TeamDef | null) {
    this.phase = 'over';
    this.events.over(winner);
  }

  // ───────────────────────── queries ─────────────────────────

  status(): TeamStatus[] {
    return this.teams.map((team) => {
      const mine = this.blocs.filter((b) => b.team === team);
      const robot = mine.find((b) => b.isRobot)!;
      return {
        team,
        blocs: mine.filter((b) => !b.isRobot).map((b) => ({ state: b.state, human: b.human })),
        robotHp: Math.max(0, robot.hp),
        eliminated: this.eliminated.has(team.id),
      };
    });
  }

  human(player: number) {
    return this.blocs.find((b) => b.human === player) ?? null;
  }

  // ───────────────────────── drawing ─────────────────────────

  render(dt: number) {
    for (const b of this.blocs) {
      if (b.state !== 'eaten') b.view.root.position.set(b.x, b.view.root.position.y, b.z);
      if (b.human !== null) b.view.setCooldown(1 - b.dashCooldown / TUNING.bloc.dashCooldown);
      b.view.update(dt, {
        speed: b.alive ? Math.hypot(b.vx, b.vz) : 0,
        yaw: b.yaw,
        dashing: b.dashTime > 0,
        holdingSpear: b.holdingSpear,
      });
    }
    for (const s of this.spears) s.updateView(dt);
  }

  dispose() {
    this.group.removeFromParent();
    for (const p of this.arena.ponds) p.clear();
  }
}
