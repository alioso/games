// A monster on a floor: lurks, notices you, hunts you through the house, and fights with
// readable wind-ups and openings. Flees upstairs at its health mark, or dies on its last appearance.
import * as THREE from 'three';
import type { NavGrid } from '@engine/navgrid';
import { damp, dampAngle, wrapAngle } from '@engine/math';
import { AGGRESSION } from '../data/combat';
import { type MonsterAttack, type MonsterDef, type MonsterName } from '../data/monsters';
import type { Difficulty } from '../data/tuning';
import type { Injury, MonsterPose, MonsterRig } from '../entities/monsterModel';
import { glow } from '../world/toon';

export type HitResult = 'hit' | 'blocked' | 'parried' | 'dodged' | 'none';

/** What a monster needs from the floor it's on. */
export interface MonsterWorld {
  readonly difficulty: Difficulty;
  readonly time: number;
  readonly hero: { x: number; z: number; yaw: number };
  heroDown(): boolean;
  heroInRoomWith(x: number, z: number): boolean;
  collide(x: number, z: number, r: number): [number, number];
  nav(): NavGrid;
  visibleAt(x: number, z: number): boolean;
  openDoorsNear(x: number, z: number): void;
  /** `push`: how far the blow shoves the hero; `ranged`: a thrown thing (parrying it doesn't stun anyone). */
  hitHero(m: Monster, damage: number, dx: number, dz: number, push?: number, ranged?: boolean): HitResult;
  /** Lob a crate / acid / blades at (x, z). */
  throwAt(m: Monster, a: MonsterAttack, x: number, z: number): void;
  /** Dirt kicked up by something burrowing. */
  dirt(x: number, z: number): void;
  /** The faint shimmer of something invisible. */
  shimmer(x: number, z: number): void;
  monsterSays(m: Monster, text: string, shout?: boolean): void;
  pow(x: number, y: number, z: number, text: string, color?: string, size?: number): void;
  sound(name: 'growl' | 'swipe' | 'bite' | 'squeal' | 'poof' | 'whistle' | 'land' | 'clang', m: Monster): void;
  spray(x: number, y: number, z: number, dx: number, dz: number, amount: number): void;
  fling(obj: THREE.Object3D, dx: number, dz: number): void;
  smoke(x: number, z: number): void;
  shake(amount: number): void;
  /** Where to run when fleeing upstairs. */
  readonly fleeTo: { x: number; z: number };
  spawnMinion(near: Monster): void;
  /** The beaten monster's parting words about the key (null if you already have it). */
  hint(): string | null;
  /** Remember how hurt it is for the next floor. */
  record(m: Monster): void;
  minionCount(): number;
  /** It has seen the hero: time for a fight scene. */
  startDuel(m: Monster): void;
}

type State = 'lurk' | 'hunt' | 'fight' | 'attack' | 'recover' | 'hurt' | 'stun' | 'retreat' | 'flee' | 'gone' | 'dead' | 'confused';

let nextId = 1;

export class Monster {
  readonly id = nextId++;
  x: number;
  z: number;
  yaw = 0;
  hp: number;
  state: State = 'lurk';
  stateT = 0;
  readonly injuries: Injury[];
  /** Health bar position where it gives up (0 = fights to the death). */
  readonly fleeHp: number;
  /** 1st, 2nd or 3rd time it shows up: later ones know more tricks. */
  readonly appearance: number;
  private attack: MonsterAttack | null = null;
  private hitIndex = 0;
  private lockX = 0;
  private lockZ = 0;
  private path: { x: number; z: number }[] = [];
  private pathT = 0;
  private plan: 'circle' | 'approach' | 'backoff' = 'circle';
  private planT = 0;
  private strafe = 1;
  private cool = 1.2;
  private recentHits = 0;
  /** Times of the last few hits taken, to spot button mashing. */
  private hitTimes: number[] = [];
  private evade: { dx: number; dz: number; t: number } | null = null;
  private wander: { x: number; z: number } | null = null;
  private senseT = 0;
  private summonT = 0;
  private speed = 0;
  private marker: THREE.Mesh | null = null;
  private perchY = 0;
  private stunFor = 0;
  blind = 0;

  constructor(
    readonly def: MonsterDef,
    readonly rig: MonsterRig,
    private world: MonsterWorld,
    x: number,
    z: number,
    opts: { hp: number; fleeHp: number; appearance: number; injuries: Injury[]; minion?: boolean },
  ) {
    this.x = x;
    this.z = z;
    this.hp = opts.hp;
    this.fleeHp = opts.fleeHp;
    this.appearance = opts.appearance;
    this.injuries = [...opts.injuries];
    this.minion = !!opts.minion;
    this.summonT = def.minions?.every ?? 0;
  }

  readonly minion: boolean;

  get name(): MonsterName {
    return this.def.name;
  }

  get alive() {
    return this.state !== 'dead' && this.state !== 'gone';
  }

  /** Busy fighting (for the health bar and music). */
  get engaged() {
    return this.alive && this.state !== 'lurk' && this.state !== 'flee' && this.state !== 'confused';
  }

  /** In a telegraphed wind-up the hero can see coming. */
  get winding() {
    return this.state === 'attack' && !!this.attack && this.stateT < this.tellTime();
  }

  get attackId() {
    return this.attack?.id ?? null;
  }

  /** Seconds until the next blow of the current attack lands (Infinity if not attacking). */
  get timeToHit() {
    if (this.state !== 'attack' || !this.attack) return Infinity;
    const shift = this.tellTime() - this.attack.tell;
    const next = this.attack.hits[this.hitIndex];
    return next === undefined ? Infinity : next + shift - this.stateT;
  }

  /** Open for punishment: just missed, stunned, or recovering. */
  get open() {
    return this.state === 'recover' || this.state === 'stun';
  }

  private set(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  private tellTime() {
    return (this.attack?.tell ?? 0) * AGGRESSION[this.world.difficulty].tell;
  }

  private dist() {
    const h = this.world.hero;
    return Math.hypot(h.x - this.x, h.z - this.z);
  }

  private faceHero(dt: number, rate = 8) {
    const h = this.world.hero;
    this.yaw = dampAngle(this.yaw, Math.atan2(h.x - this.x, h.z - this.z), rate, dt);
  }

  private moveTo(tx: number, tz: number, speed: number, dt: number, face = true) {
    // Follow the nav grid, re-planning now and then.
    this.pathT -= dt;
    const last = this.path[this.path.length - 1];
    if (this.pathT <= 0 || !last || Math.hypot(last.x - tx, last.z - tz) > 1) {
      this.pathT = 0.5;
      this.path = this.world.nav().findPath(this.x, this.z, tx, tz) ?? [{ x: tx, z: tz }];
    }
    let next = this.path[0];
    while (next && Math.hypot(next.x - this.x, next.z - this.z) < 0.25 && this.path.length > 1) {
      this.path.shift();
      next = this.path[0];
    }
    if (!next) return;
    const dx = next.x - this.x, dz = next.z - this.z, d = Math.hypot(dx, dz) || 1;
    this.step((dx / d) * speed, (dz / d) * speed, dt);
    if (face) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    this.world.openDoorsNear(this.x, this.z);
  }

  /** Smoothed velocity: monsters speed up and slow down instead of snapping. */
  private vx = 0;
  private vz = 0;

  private step(vx: number, vz: number, dt: number, instant = false) {
    const k = instant ? 1 : 1 - Math.exp(-12 * dt);
    this.vx += (vx - this.vx) * k;
    this.vz += (vz - this.vz) * k;
    vx = this.vx;
    vz = this.vz;
    const [nx, nz] = this.world.collide(this.x + vx * dt, this.z + vz * dt, this.def.radius);
    this.speed = Math.hypot(nx - this.x, nz - this.z) / dt;
    this.x = nx;
    this.z = nz;
  }

  private notices() {
    const w = this.world, h = w.hero;
    if (w.heroDown() || this.blind > 0) return false;
    const d = this.dist();
    if (w.heroInRoomWith(this.x, this.z) && d < 12) return true;
    return d < 6 && w.nav().lineFree(this.x, this.z, h.x, h.z);
  }

  /** Something loud happened at (x, z): come and look. */
  hear(x: number, z: number) {
    if (this.state === 'lurk' && Math.hypot(x - this.x, z - this.z) < 11) this.spot();
  }

  private spot() {
    if (this.state !== 'lurk' && this.state !== 'confused') return;
    this.set('hunt');
    if (!this.minion) {
      this.world.sound('growl', this);
      this.world.monsterSays(this, pick(this.def.lines.spot), true);
    }
  }

  /** Being driven by a fight scene (see duel.ts) rather than its own wandering brain. */
  inDuel = false;

  update(dt: number) {
    if (this.inDuel || this.state === 'gone') return;
    this.stateT += dt;
    this.cool -= dt;
    this.blind = Math.max(0, this.blind - dt);
    this.speed = 0;
    // Coast to a stop when not walking this frame.
    this.vx *= Math.exp(-10 * dt);
    this.vz *= Math.exp(-10 * dt);
    const w = this.world;
    const d = this.dist();
    const tune = AGGRESSION[w.difficulty];

    switch (this.state) {
      case 'lurk': {
        // Shuffle about the room, sniffing.
        if (!this.wander || Math.hypot(this.wander.x - this.x, this.wander.z - this.z) < 0.3 || this.stateT > 6) {
          const nav = w.nav();
          for (let i = 0; i < 8; i++) {
            const tx = this.x + (Math.random() - 0.5) * 5, tz = this.z + (Math.random() - 0.5) * 5;
            if (!nav.isBlocked(tx, tz) && w.heroInRoomWith(tx, tz) === w.heroInRoomWith(this.x, this.z)) { this.wander = { x: tx, z: tz }; break; }
          }
          this.stateT = Math.random() * 3;
        }
        if (this.wander && this.stateT > 2) this.moveTo(this.wander.x, this.wander.z, this.def.walk * 0.6, dt);
        this.senseT -= dt;
        if (this.senseT <= 0) {
          this.senseT = 0.25;
          if (this.notices()) { this.spot(); this.world.startDuel(this); }
        }
        break;
      }
      case 'confused': {
        // Lost you in the smoke: look around.
        this.yaw += dt * 2;
        if (this.blind <= 0) this.set(this.notices() ? 'hunt' : 'lurk');
        break;
      }
      case 'hunt': {
        if (w.heroDown()) { this.set('lurk'); break; }
        if (this.blind > 0) { this.set('confused'); w.monsterSays(this, '???'); break; }
        // Close enough to see you: fight scene!
        this.senseT -= dt;
        if (this.senseT <= 0) {
          this.senseT = 0.2;
          if (this.notices()) { this.world.startDuel(this); break; }
        }
        // Throw, charge or leap from afar when it can see you.
        if (this.cool <= 0 && d < 10 && w.nav().lineFree(this.x, this.z, w.hero.x, w.hero.z)) {
          const a = this.pickAttack(d, true);
          if (a) { this.begin(a); break; }
          this.cool = 0.5;
        }
        this.moveTo(w.hero.x, w.hero.z, this.def.run, dt);
        // Lost you for good?
        if (d > 18 && this.stateT > 8) this.set('lurk');
        break;
      }
      case 'fight': {
        if (w.heroDown()) { this.set('lurk'); w.monsterSays(this, pick(this.def.lines.taunt)); break; }
        if (this.blind > 0) { this.set('confused'); w.monsterSays(this, '???'); break; }
        if (d > 5) { this.set('hunt'); break; }
        this.faceHero(dt);
        // Call the rats.
        if (this.def.minions && this.appearance >= 3 && !this.minion) {
          this.summonT -= dt;
          if (this.summonT <= 0 && w.minionCount() < this.def.minions.count) {
            this.summonT = this.def.minions.every;
            w.sound('whistle', this);
            w.monsterSays(this, 'Come, my pretties!', true);
            for (let i = w.minionCount(); i < this.def.minions.count; i++) w.spawnMinion(this);
          }
        }
        if (this.cool <= 0) {
          const a = this.pickAttack(d);
          if (a) { this.begin(a); break; }
          if (d > 1.0) { this.moveTo(w.hero.x, w.hero.z, this.def.run * 0.8, dt, false); break; }
        }
        this.planT -= dt;
        if (this.planT <= 0) {
          this.planT = 0.7 + Math.random() * 0.8;
          this.plan = d < 1.5 ? 'backoff' : Math.random() < 0.25 ? 'approach' : 'circle';
          if (Math.random() < 0.3) this.strafe *= -1;
        }
        // Prowl around, not straight back and forth.
        const h = w.hero;
        const ax = (h.x - this.x) / (d || 1), az = (h.z - this.z) / (d || 1);
        let vx = 0, vz = 0;
        if (this.plan === 'circle') {
          const want = 2.2 - d;
          vx = -az * this.strafe * this.def.walk + -ax * want * 1.5;
          vz = ax * this.strafe * this.def.walk + -az * want * 1.5;
        } else if (this.plan === 'approach') {
          vx = ax * this.def.walk;
          vz = az * this.def.walk;
        } else {
          vx = -ax * this.def.walk;
          vz = -az * this.def.walk;
        }
        const before = this.x + this.z;
        this.step(vx, vz, dt);
        if (Math.abs(this.x + this.z - before) < 0.001) this.strafe *= -1;
        break;
      }
      case 'attack': {
        this.updateAttack(dt);
        if ((this.state as State) === 'recover') this.cool = (0.9 + Math.random() * 0.9) * tune.cooldown;
        break;
      }
      case 'recover': {
        if (this.stateT > (this.attack?.recover ?? 0.6)) {
          this.set('fight');
          this.plan = 'backoff';
          this.planT = 0.6 + Math.random() * 0.5;
        }
        break;
      }
      case 'hurt': {
        if (this.stateT > 0.28) this.set('fight');
        break;
      }
      case 'stun': {
        if (this.stateT > this.stunFor) this.set('fight');
        break;
      }
      case 'retreat': {
        if (this.evade) {
          // A quick hop back, then straight back to fighting.
          this.evade.t += dt;
          this.step(this.evade.dx * 5.5, this.evade.dz * 5.5, dt, true);
          this.perchY = Math.sin(Math.min(1, this.evade.t / 0.35) * Math.PI) * 0.3;
          if (this.evade.t >= 0.35) { this.evade = null; this.perchY = 0; this.set('fight'); this.cool = 0.4; }
          break;
        }
        // Run off to lick its wounds for a moment, then come back.
        if (this.wander) this.moveTo(this.wander.x, this.wander.z, this.def.run, dt);
        if (this.stateT > 2.5 || !this.wander) this.set('hunt');
        break;
      }
      case 'flee': {
        this.moveTo(w.fleeTo.x, w.fleeTo.z, this.def.run * 1.15, dt);
        if (Math.hypot(w.fleeTo.x - this.x, w.fleeTo.z - this.z) < 0.6 || this.stateT > 5) {
          w.smoke(this.x, this.z);
          w.sound('poof', this);
          w.pow(this.x, 1.2, this.z, 'POOF!', '#ffffff', 0.9);
          this.set('gone');
        }
        break;
      }
      case 'dead':
        break;
    }
    this.render(dt);
  }

  private pickAttack(d: number, rangedOnly = false) {
    const options = this.def.attacks.filter((a) => a.from <= this.appearance && d >= a.range[0] && d <= a.range[1] && (!rangedOnly || a.range[0] >= 2.4));
    if (!options.length) return null;
    // Weighted pick: the tricks learned on later appearances come up more often.
    const total = options.reduce((s, a) => s + (a.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const a of options) if ((r -= a.weight ?? 1) <= 0) return a;
    return options[0];
  }

  private begin(a: MonsterAttack, tellScale = 1) {
    this.attack = tellScale === 1 ? a : { ...a, tell: a.tell * tellScale, hits: a.hits.map((h) => h - a.tell * (1 - tellScale)) };
    this.hitIndex = 0;
    this.rig.move = a.id;
    this.lockX = this.world.hero.x;
    this.lockZ = this.world.hero.z;
    this.dashHit = false;
    this.phase = 0;
    this.set('attack');
    if (a.kind === 'leap') this.world.monsterSays(this, pick(['Hup!', 'From above!', 'Incoming!']), true);
    if (a.kind === 'dash' && a.wallStun) this.world.monsterSays(this, 'CHAAARGE!', true);
  }

  private follow(a: MonsterAttack) {
    const next = this.def.attacks.find((x) => x.id === a.follow);
    if (next) this.begin(next, 0.6);
    else this.set('fight');
  }

  /** True if the hero is within reach and in front (or anywhere, for all-round moves). */
  private inReach(reach: number, arc: number) {
    const h = this.world.hero;
    const dx = h.x - this.x, dz = h.z - this.z, d = Math.hypot(dx, dz);
    if (d > reach + 0.32) return false;
    return arc >= 360 || Math.abs(wrapAngle(Math.atan2(dx, dz) - this.yaw)) <= (arc * Math.PI) / 180;
  }

  private dashHit = false;
  /** Sub-step of multi-part moves (burrowing, vanishing, teleporting). */
  private phase = 0;
  private phaseT = 0;
  /** Invisible (vanished or underground). */
  hidden = false;

  private updateAttack(dt: number) {
    const w = this.world, h = w.hero;
    const a = this.attack!;
    const tell = this.tellTime();
    const shift = tell - a.tell;
    if (this.stateT < tell) {
      // Wind-up: keep tracking the hero (less so at the end, so you can sidestep).
      if (this.stateT < tell * 0.7 || a.kind === 'throw') {
        this.faceHero(dt, 6);
        this.lockX = h.x;
        this.lockZ = h.z;
      }
      if (a.kind === 'leap') this.updateMarker(true, 1);
      return;
    }
    const done = () => {
      this.updateMarker(false);
      this.perchY = 0;
      this.hidden = false;
      this.set('recover');
    };
    switch (a.kind) {
      case 'melee': {
        if (a.spin) this.yaw += dt * 13;
        while (this.hitIndex < a.hits.length && this.stateT >= a.hits[this.hitIndex] + shift) {
          this.resolveHit(a);
          this.hitIndex++;
        }
        if (this.hitIndex >= a.hits.length && this.stateT >= a.hits[a.hits.length - 1] + shift + 0.15) done();
        return;
      }
      case 'dash': {
        // Rush at where you were (or straight on, for a charge).
        const t = this.stateT - tell;
        const dur = a.duration ?? 0.35;
        if (t < dur) {
          const dx = this.lockX - this.x, dz = this.lockZ - this.z, l = Math.hypot(dx, dz) || 1;
          const fx = a.wallStun ? Math.sin(this.yaw) : dx / l, fz = a.wallStun ? Math.cos(this.yaw) : dz / l;
          if (a.wallStun || l > 0.2) {
            const bx = this.x, bz = this.z;
            this.step(fx * (a.speed ?? 6.5), fz * (a.speed ?? 6.5), dt, true);
            // Ran into a wall? Dizzy!
            if (a.wallStun && Math.hypot(this.x - bx, this.z - bz) < (a.speed ?? 8) * dt * 0.3 && t > 0.1) {
              w.sound('land', this);
              w.shake(0.4);
              w.pow(this.x, 1.4, this.z, 'BONK!', '#ffd23f', 1.1);
              w.monsterSays(this, pick(['Ow, my horn...', 'Who put a wall there?', 'Stars... pretty...']));
              this.stun(a.wallStun);
              return;
            }
          }
          if (!this.dashHit && this.inReach(a.reach, a.arc)) {
            this.dashHit = true;
            this.resolveHit(a);
          }
          return;
        }
        if (!this.dashHit) w.sound('swipe', this);
        done();
        return;
      }
      case 'leap': {
        // A big arc onto the marked spot.
        const t0 = tell, t1 = a.hits[0] + shift;
        const k = Math.min(1, (this.stateT - t0) / (t1 - t0));
        if (k < 1) {
          this.x = damp(this.x, this.lockX, 6, dt);
          this.z = damp(this.z, this.lockZ, 6, dt);
          this.perchY = Math.sin(k * Math.PI) * (a.jump ?? 1.6);
          return;
        }
        if (this.hitIndex === 0) { this.hitIndex = 1; this.perchY = 0; this.resolveHit(a); }
        if (this.stateT >= t1 + 0.15) done();
        return;
      }
      case 'throw': {
        while (this.hitIndex < a.hits.length && this.stateT >= a.hits[this.hitIndex] + shift) {
          w.throwAt(this, a, h.x, h.z);
          this.hitIndex++;
        }
        if (this.stateT >= a.hits[a.hits.length - 1] + shift + 0.2) done();
        return;
      }
      case 'burrow': {
        // Dig down, tunnel toward you (watch the cracks!), then burst up.
        this.phaseT += dt;
        if (this.phase === 0) {
          this.phase = 1;
          this.phaseT = 0;
          this.hidden = true;
          w.smoke(this.x, this.z);
          w.pow(this.x, 0.8, this.z, 'KRRSSH', '#c8a070', 0.9);
          w.sound('land', this);
        } else if (this.phase === 1) {
          const dx = h.x - this.x, dz = h.z - this.z, l = Math.hypot(dx, dz) || 1;
          this.step((dx / l) * (a.speed ?? 3), (dz / l) * (a.speed ?? 3), dt, true);
          w.dirt(this.x, this.z);
          if (l < 0.7 || this.phaseT > (a.duration ?? 2.5)) {
            this.phase = 2;
            this.phaseT = 0;
            this.lockX = this.x;
            this.lockZ = this.z;
          }
        } else if (this.phase === 2) {
          // The floor bulges: get out of the red ring!
          this.updateMarker(true, a.reach / 0.75);
          w.dirt(this.x, this.z);
          if (this.phaseT > 0.55 * AGGRESSION[w.difficulty].tell) {
            this.phase = 3;
            this.phaseT = 0;
            this.hidden = false;
            this.updateMarker(false);
            w.shake(0.5);
            w.pow(this.x, 1.2, this.z, 'KA-BLAM!', '#ff9a3a', 1.2);
            w.smoke(this.x, this.z);
            this.perchY = 0.6;
            this.resolveHit(a);
          }
        } else {
          this.perchY = Math.max(0, 0.6 - this.phaseT * 2);
          if (this.phaseT > 0.3) done();
        }
        return;
      }
      case 'vanish': {
        // Fade out, creep up (only a shimmer gives it away), then strike.
        this.phaseT += dt;
        if (this.phase === 0) {
          this.phase = 1;
          this.phaseT = 0;
          this.hidden = true;
          w.pow(this.x, 1.3, this.z, 'fsssht', '#a0e0a0', 0.7);
        }
        const dx = h.x - this.x, dz = h.z - this.z, l = Math.hypot(dx, dz) || 1;
        if (l > 1.0) this.moveTo(h.x, h.z, this.def.walk * 1.3, dt);
        w.shimmer(this.x, this.z);
        if (this.phaseT > (a.hide ?? 3) || l < 1.0) {
          this.hidden = false;
          this.faceHero(dt, 50);
          w.monsterSays(this, pick(this.def.lines.taunt), true);
          this.follow(a);
        }
        return;
      }
      case 'teleport': {
        // Poof... and poof, right behind you.
        this.phaseT += dt;
        if (this.phase === 0) {
          this.phase = 1;
          this.phaseT = 0;
          this.hidden = true;
          w.smoke(this.x, this.z);
          w.sound('poof', this);
        } else if (this.phaseT > 0.45) {
          const bx = -Math.sin(h.yaw), bz = -Math.cos(h.yaw);
          const [nx, nz] = w.collide(h.x + bx * 1.4, h.z + bz * 1.4, this.def.radius);
          this.x = nx;
          this.z = nz;
          this.hidden = false;
          this.yaw = Math.atan2(h.x - nx, h.z - nz);
          w.smoke(nx, nz);
          w.sound('poof', this);
          w.monsterSays(this, pick(['Behind you.', 'Boo.', 'Snip?']), true);
          this.follow(a);
        }
        return;
      }
    }
  }

  private resolveHit(a: MonsterAttack) {
    const w = this.world, h = w.hero;
    w.sound(a.id === 'bite' || a.id === 'tongue' ? 'bite' : a.kind === 'leap' || a.kind === 'burrow' || a.id === 'slam' ? 'land' : 'swipe', this);
    if (a.kind === 'leap' || a.id === 'slam') w.shake(0.35);
    if (!this.inReach(a.reach, a.arc)) return;
    const dx = h.x - this.x, dz = h.z - this.z, d = Math.hypot(dx, dz);
    const dmg = a.damage * AGGRESSION[w.difficulty].damage;
    const res = w.hitHero(this, dmg, dx / (d || 1), dz / (d || 1), a.push ?? 0);
    if (res === 'hit' && Math.random() < 0.25 && !this.minion) w.monsterSays(this, pick(this.def.lines.taunt));
  }

  /** The red ring on the floor where something is about to land. */
  private updateMarker(on: boolean, size = 1) {
    if (on && !this.marker) {
      this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), glow(0xff3020, 1.5));
      this.marker.rotation.x = -Math.PI / 2;
      this.rig.root.parent?.add(this.marker);
    }
    if (this.marker) {
      this.marker.visible = on;
      this.marker.position.set(this.lockX, 0.03, this.lockZ);
      this.marker.scale.setScalar(size * (1 + Math.sin(this.stateT * 18) * 0.08));
    }
  }

  /** Stunned (parry, shield bash...): stars over its head, and it's wide open. */
  stun(seconds: number) {
    if (!this.alive || this.state === 'flee') return;
    this.updateMarker(false);
    this.perchY = 0;
    this.hidden = false;
    this.stunFor = seconds;
    this.set('stun');
  }

  /** The hero hits it. Returns true if it connected. */
  takeHit(damage: number, dx: number, dz: number, opts: { push?: number; stun?: number; heavy?: boolean } = {}) {
    if (!this.alive || this.state === 'flee') return false;
    const w = this.world;
    // Can't hit what's under the floor.
    if (this.hidden && this.attack?.kind === 'burrow') return false;
    // Armour: blows to the front just clang off, unless it's off balance.
    if (this.def.armor !== undefined && !this.open) {
      const h = w.hero;
      const toHero = Math.atan2(h.x - this.x, h.z - this.z);
      if (Math.abs(wrapAngle(toHero - this.yaw)) < 1.25) {
        damage *= this.def.armor;
        w.pow(this.x, 1.3, this.z, 'CLANG!', '#d0d8e0', 0.9);
        w.sound('clang', this);
        if (Math.random() < 0.35) w.monsterSays(this, pick(this.def.lines.taunt));
      }
    }
    this.hp = Math.max(0, this.hp - damage);
    w.spray(this.x, 0.6, this.z, dx, dz, Math.min(2, damage * 0.6));
    this.rig.flinch(opts.heavy ? 1.3 : 0.7);
    if (opts.push) {
      const [nx, nz] = w.collide(this.x + dx * opts.push, this.z + dz * opts.push, this.def.radius);
      this.x = nx;
      this.z = nz;
    }
    if (this.state === 'lurk' || this.state === 'confused') this.spot();
    // Big hits knock teeth out.
    if (opts.heavy && !this.minion && !this.injuries.includes('tooth') && Math.random() < 0.5) {
      const tooth = this.rig.detach('tooth');
      if (tooth) { this.injuries.push('tooth'); w.fling(tooth, dx, dz); w.pow(this.x, 1.3, this.z, 'CRACK!', '#ffffff', 0.8); }
    }
    if (this.hp <= this.fleeHp) {
      if (this.fleeHp > 0 || this.hp <= 0) {
        this.updateMarker(false);
        this.perchY = 0;
        if (this.hp <= 0) this.die(dx, dz);
        else this.flee(dx, dz);
        return true;
      }
    }
    w.sound('squeal', this);
    if (!this.minion && Math.random() < 0.3) w.monsterSays(this, pick(this.def.lines.hurt));
    // Only heavy blows (and stuns) break a wind-up; little hits just sting.
    const winding = this.state === 'attack';
    if (opts.stun) this.stun(opts.stun);
    else if (opts.heavy && this.state !== 'stun') { this.updateMarker(false); this.perchY = 0; this.set('hurt'); }
    else if (!winding && this.state !== 'stun' && this.state !== 'recover' && Math.random() < 0.5) this.set('hurt');
    // Hit again and again without a break? It fights back: a quick counter-swipe or a hop out of reach.
    const now = w.time;
    this.hitTimes = this.hitTimes.filter((t) => now - t < 1.4);
    this.hitTimes.push(now);
    if (!this.minion && this.hitTimes.length >= 2 && this.state !== 'stun' && this.state !== 'recover' && !winding) {
      this.hitTimes = [];
      if (Math.random() < 0.6) this.counter();
      else this.hop();
      w.record(this);
      return true;
    }
    // Sometimes it runs off for a breather after a beating, and you can chase it.
    this.recentHits++;
    if (this.recentHits >= 3 && !this.minion && Math.random() < 0.35) {
      this.recentHits = 0;
      const nav = w.nav();
      for (let i = 0; i < 10; i++) {
        const tx = this.x + (Math.random() - 0.5) * 12, tz = this.z + (Math.random() - 0.5) * 12;
        if (!nav.isBlocked(tx, tz) && Math.hypot(tx - w.hero.x, tz - w.hero.z) > 5) { this.wander = { x: tx, z: tz }; this.set('retreat'); break; }
      }
    }
    w.record(this);
    return true;
  }

  /**
   * A blow landed in a fight scene: health, blood, lost teeth, and running away or dying at its
   * marks. `dir` is the direction of the blow along the fight line (+1 or -1).
   */
  wound(damage: number, dir: number, heavy: boolean): 'ok' | 'flee' | 'dead' {
    if (!this.alive || this.state === 'flee') return 'ok';
    const w = this.world;
    this.hp = Math.max(0, this.hp - damage);
    w.spray(this.x, 0.7, this.z, dir, 0, Math.min(2, damage * 0.6));
    this.rig.flinch(heavy ? 1.3 : 0.7);
    if (heavy && !this.minion && !this.injuries.includes('tooth') && Math.random() < 0.5) {
      const tooth = this.rig.detach('tooth');
      if (tooth) { this.injuries.push('tooth'); w.fling(tooth, dir, 0.3); w.pow(this.x, 1.5, this.z, 'CRACK!', '#ffffff', 0.8); }
    }
    if (this.hp <= this.fleeHp && (this.fleeHp > 0 || this.hp <= 0)) {
      if (this.hp <= 0) { this.die(dir, 0); return 'dead'; }
      this.flee(dir, 0);
      return 'flee';
    }
    w.sound('squeal', this);
    if (!this.minion && Math.random() < 0.25) w.monsterSays(this, pick(this.def.lines.hurt));
    w.record(this);
    return 'ok';
  }

  /** Draw it where and how a fight scene says. */
  display(dt: number, x: number, y: number, z: number, yaw: number, pose: MonsterPose, speed: number, t: number, p: number, visible = true) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const r = this.rig.root;
    r.position.set(x, y, z);
    r.rotation.y = yaw;
    r.visible = visible && this.state !== 'gone';
    this.rig.animate(dt, pose, speed, t, p);
  }

  /** Leave the fight scene and vanish (after running away). */
  vanish() {
    this.world.smoke(this.x, this.z);
    this.world.sound('poof', this);
    this.set('gone');
    this.rig.root.visible = false;
  }

  /** A fast, short-tell swipe: punishes standing there mashing buttons. */
  private counter() {
    const swipe = this.def.attacks.find((a) => a.kind === 'melee') ?? this.def.attacks[0];
    const quick: MonsterAttack = { ...swipe, tell: 0.28, hits: [0.28], recover: 0.5 };
    this.begin(quick);
    this.world.monsterSays(this, 'Grr! Enough!', true);
  }

  /** Spring backwards out of reach. */
  private hop() {
    const h = this.world.hero;
    const dx = this.x - h.x, dz = this.z - h.z, d = Math.hypot(dx, dz) || 1;
    this.evade = { dx: dx / d, dz: dz / d, t: 0 };
    this.set('retreat');
    this.wander = null;
    this.world.monsterSays(this, pick(this.def.lines.taunt));
  }

  private flee(dx: number, dz: number) {
    const w = this.world;
    // Loses an ear on the way out; it'll be wearing a bandage next time.
    const ear = this.rig.detach('ear');
    if (ear) { this.injuries.push('ear'); w.fling(ear, dx, dz); }
    if (!this.injuries.includes('bandage')) this.injuries.push('bandage');
    w.spray(this.x, 0.8, this.z, dx, dz, 2);
    w.sound('squeal', this);
    const hint = w.hint();
    w.monsterSays(this, hint ?? pick(this.def.lines.flee), true);
    this.set('flee');
    w.record(this);
  }

  private die(dx: number, dz: number) {
    const w = this.world;
    for (const part of ['arm', 'tail', 'ear'] as const) {
      const bit = this.rig.detach(part);
      if (bit) w.fling(bit, dx + (Math.random() - 0.5), dz + (Math.random() - 0.5));
    }
    w.spray(this.x, 0.7, this.z, dx, dz, 3);
    w.spray(this.x, 0.4, this.z, -dx, -dz, 2);
    w.shake(0.4);
    w.sound('squeal', this);
    if (!this.minion) {
      const hint = w.hint();
      w.monsterSays(this, hint ? `Ugh... ${hint}` : pick(this.def.lines.die), true);
      w.pow(this.x, 1.5, this.z, 'SPLAT!', '#e03030', 1.2);
    }
    this.set('dead');
    w.record(this);
  }

  private render(dt: number) {
    const r = this.rig.root;
    r.position.set(this.x, this.perchY, this.z);
    r.rotation.y = this.yaw;
    r.visible = this.state !== 'gone' && !this.hidden && this.world.visibleAt(this.x, this.z);
    const a = this.attack;
    let pose: MonsterPose = 'idle', p = 0;
    switch (this.state) {
      case 'lurk':
        pose = this.speed > 0.2 ? 'walk' : 'idle';
        break;
      case 'hunt':
      case 'retreat':
        pose = 'run';
        break;
      case 'fight':
        pose = this.speed > 0.2 ? 'walk' : 'idle';
        break;
      case 'attack': {
        const tell = this.tellTime();
        if (this.stateT < tell) { pose = 'tell'; p = this.stateT / tell; }
        else pose = a?.kind === 'leap' && this.perchY > 0.05 ? 'tell' : a?.kind === 'dash' ? 'strike' : 'strike';
        break;
      }
      case 'recover':
        pose = 'recover';
        break;
      case 'hurt':
        pose = 'hurt';
        break;
      case 'stun':
      case 'confused':
        pose = 'stun';
        break;
      case 'flee':
        pose = 'flee';
        break;
      case 'dead':
        pose = 'dead';
        break;
    }
    this.rig.animate(dt, pose, Math.min(1, this.speed / this.def.run), this.state === 'dead' || this.state === 'stun' || this.state === 'hurt' ? this.stateT : this.world.time, p);
  }

  dispose() {
    this.marker?.removeFromParent();
    this.rig.root.removeFromParent();
  }
}

function pick<T>(list: readonly T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Gribbles' rats, as a tiny monster definition. */
export const RAT_DEF: MonsterDef = {
  name: 'Gribbles',
  maxHp: 1,
  radius: 0.2,
  walk: 2.2,
  run: 3.6,
  attacks: [{ id: 'bite', kind: 'melee', tell: 0.4, hits: [0.4], recover: 0.6, damage: 0.5, reach: 0.7, arc: 60, range: [0, 0.8], from: 1 }],
  lines: { spot: [], hurt: [], flee: [], die: [], taunt: [] },
};
