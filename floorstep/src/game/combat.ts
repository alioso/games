// Fighting on a floor: the hero's moves (combos, heavy blows, block and parry, dodge, class
// specials, bolts and magic), the monster and its rats, and everything that hurts whom.
import * as THREE from 'three';
import type { NavGrid } from '@engine/navgrid';
import { wrapAngle } from '@engine/math';
import { AGGRESSION, BASH, BLAST, COMBAT, CROSSBOW, DODGE, HURT, type MeleeMove, PARRY, SLAM, SMOKE, STAMINA } from '../data/combat';
import { FURNITURE } from '../data/furniture';
import { weaponOf } from '../data/heroes';
import { MONSTERS, type MonsterAttack, fleeAt, keyHint, monsterFor } from '../data/monsters';
import { HERO } from '../data/tuning';
import { MONSTER_MODELS, buildRat } from '../entities/monsterModel';
import type { Pose } from '../entities/heroModel';
import { buildNav, roomAt } from '../world/plan';
import { block, glow, ink, toon, unclipped } from '../world/toon';
import type { HeroControls } from './controls';
import type { Floor } from './floor';
import { Gore } from './gore';
import { Impacts, Trail } from './fx';
import { type HitResult, Monster, type MonsterWorld, RAT_DEF } from './monster';
import { SFX } from './sounds';

type Act =
  | { kind: 'melee'; move: MeleeMove; t: number; hit: boolean; index: number; queued: boolean; heavy: boolean; target: Monster | null }
  | { kind: 'shoot' | 'cast' | 'bash' | 'slam'; t: number; done: boolean; total: number; at: number }
  | { kind: 'dodge'; t: number; dx: number; dz: number }
  | { kind: 'hurt'; t: number };

interface Projectile {
  kind: 'bolt' | 'blast';
  x: number;
  z: number;
  vx: number;
  vz: number;
  dist: number;
  range: number;
  damage: number;
  mesh: THREE.Object3D;
}

const v = new THREE.Vector3();

/** Something a monster threw: a crate arcing over, a glob of acid, a spinning blade. */
interface Thrown {
  kind: 'crate' | 'acid' | 'blade';
  owner: Monster;
  x: number;
  z: number;
  y: number;
  /** Arcs fly from (sx, sz) to (tx, tz) over `time`; blades fly straight and come back. */
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  t: number;
  time: number;
  damage: number;
  mesh: THREE.Object3D;
  marker: THREE.Mesh | null;
  hit: boolean;
  returning: boolean;
}

interface Puddle {
  x: number;
  z: number;
  r: number;
  t: number;
  mesh: THREE.Mesh;
}
const BLADE_WORDS = ['SHLIK!', 'SLASH!', 'SNIKT!'];
const BLUNT_WORDS = ['THWACK!', 'BONK!', 'WHAP!'];
const HEAVY_WORDS = ['KRUNCH!', 'WHAM!', 'SPLAT!'];

export class Combat implements MonsterWorld {
  readonly monsters: Monster[] = [];
  readonly gore: Gore;
  act: Act | null = null;
  blocking = false;
  stamina: number = STAMINA.max;
  /** Seconds until the special can be used again. */
  specialCool = 0;
  /** Wizard's magic charges (and the time until the next one refills). */
  charges = 0;
  private chargeT = 0;
  private staminaWait = 0;
  private blockStart = -10;
  private invulnerable = 0;
  private projectiles: Projectile[] = [];
  private thrown: Thrown[] = [];
  private puddles: Puddle[] = [];
  private puddleTick = 0;
  private navCache: { key: string; nav: NavGrid } | null = null;
  private barT = 0;
  private hitPause = 0;
  private trail = new Trail();
  private impacts = new Impacts();
  private handPos = new THREE.Vector3();
  private tipPos = new THREE.Vector3();

  constructor(private f: Floor) {
    this.gore = new Gore(f.particles);
    f.group.add(this.gore.group, this.trail.mesh, this.impacts.group);
    const cls = f.look.cls;
    this.charges = COMBAT[cls].special.charges ?? 0;
    if (!f.ctx.calm) this.spawnBoss();
  }

  private get cls() {
    return COMBAT[this.f.look.cls];
  }

  /** A class move adjusted for the chosen weapon (faster sabre, longer spear...). */
  private scaled(m: MeleeMove): MeleeMove {
    const w = weaponOf(this.f.look);
    return { ...m, damage: m.damage * w.damage, reach: m.reach * w.reach, hit: m.hit / w.speed, total: m.total / w.speed };
  }

  /** While a big hit freezes the action for an instant, animations slow to a crawl. */
  get timeScale() {
    return this.hitPause > 0 ? 0.15 : 1;
  }

  // ---------- MonsterWorld ----------

  get difficulty() {
    return this.f.ctx.run.difficulty;
  }

  get time() {
    return this.f.time;
  }

  get hero() {
    return this.f.hero;
  }

  get fleeTo() {
    const e = this.f.plan.exit;
    return { x: e.c, z: e.at - 1.2 };
  }

  heroDown() {
    return this.f.phase === 'dead' || this.f.ctx.run.hp <= 0;
  }

  heroInRoomWith(x: number, z: number) {
    const a = roomAt(this.f.plan, this.hero.x, this.hero.z), b = roomAt(this.f.plan, x, z);
    return !!a && a === b;
  }

  collide(x: number, z: number, r: number) {
    return this.f.collide(x, z, r);
  }

  nav() {
    const key = this.f.solidsVersion;
    if (!this.navCache || this.navCache.key !== String(key)) {
      const gone = new Set(this.f.pieces.filter((r) => r.gone).map((r) => r.p.id));
      this.navCache = { key: String(key), nav: buildNav(this.f.plan, gone) };
    }
    return this.navCache.nav;
  }

  visibleAt(x: number, z: number) {
    const room = roomAt(this.f.plan, x, z);
    return !room || this.f.house.isRevealed(room.id) || this.heroInRoomWith(x, z);
  }

  openDoorsNear(x: number, z: number) {
    for (const d of this.f.house.doors) {
      if (d.opened || d.door.kind !== 'door') continue;
      const dx = d.door.axis === 'h' ? d.door.c : d.door.at, dz = d.door.axis === 'h' ? d.door.at : d.door.c;
      if (Math.hypot(x - dx, z - dz) < 1.3) {
        this.f.house.openDoor(d, x, z);
        SFX.door();
      }
    }
  }

  monsterSays(m: Monster, text: string, shout = false) {
    if (!this.visibleAt(m.x, m.z)) return;
    const pitch = m.minion ? 700 : 170;
    this.f.ctx.bubbles.say(m.rig.headTop, text, { shout, onChar: (ch) => SFX.voice(pitch, ch) });
  }

  pow(x: number, y: number, z: number, text: string, color = '#ffd23f', size = 1) {
    this.f.ctx.bubbles.pow(v.set(x, y, z), text, color, size);
  }

  sound(name: 'growl' | 'swipe' | 'bite' | 'squeal' | 'poof' | 'whistle' | 'land' | 'clang', m: Monster) {
    const d = Math.hypot(m.x - this.hero.x, m.z - this.hero.z);
    const vol = Math.max(0.05, 1 - d / 16) * (m.minion ? 0.5 : 1);
    SFX.monster(name, vol, m.minion);
  }

  spray(x: number, y: number, z: number, dx: number, dz: number, amount: number) {
    this.gore.spray(x, y, z, dx, dz, amount);
  }

  fling(obj: THREE.Object3D, dx: number, dz: number) {
    this.gore.fling(obj, dx, dz);
  }

  smoke(x: number, z: number) {
    this.f.particles.burst({ x, y: 0.6, z, count: 30, color: 0x9a9490, speed: 2, up: 1.5, size: 0.3, life: 1.2, gravity: -0.5 });
  }

  shake(amount: number) {
    this.f.shakeBy(amount);
  }

  hint() {
    if (this.f.hasKey) return null;
    const k = this.f.keyPiece;
    return keyHint(this.difficulty, this.f.plan.rooms[k.p.room].type, k.p.kind);
  }

  private counted = new Set<string>();

  record(m: Monster) {
    if (m.minion) return;
    // Tally beaten and fled monsters for the end screen (once each).
    const stats = this.f.ctx.run.stats;
    const tag = `${m.name}:${m.state}:${this.f.ctx.floor}`;
    if ((m.state === 'dead' || m.state === 'flee') && !this.counted.has(tag)) {
      this.counted.add(tag);
      if (m.state === 'dead') stats.beaten++;
      else stats.fled++;
    }
    this.f.ctx.run.monsters[m.name] = { hp: m.hp, injuries: [...m.injuries], dead: m.state === 'dead' };
  }

  minionCount() {
    return this.monsters.filter((m) => m.minion && m.alive).length;
  }

  spawnMinion(near: Monster) {
    const nav = this.nav();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = near.x + Math.cos(a) * 1.2, z = near.z + Math.sin(a) * 1.2;
      if (nav.isBlocked(x, z)) continue;
      const rig = buildRat();
      unclipped(rig.root);
      this.f.group.add(rig.root);
      const m = new Monster(RAT_DEF, rig, this, x, z, { hp: 1, fleeHp: 0, appearance: 1, injuries: [], minion: true });
      m.hear(this.hero.x, this.hero.z);
      this.smoke(x, z);
      this.monsters.push(m);
      return;
    }
  }

  /** The floor's monster, if this floor has one (and it isn't dead already). */
  private spawnBoss() {
    const run = this.f.ctx.run;
    const { name, appearance } = monsterFor(run.difficulty, this.f.ctx.floor);
    const def = MONSTERS[name];
    const state = run.monsters[name];
    if (!def || state?.dead) return;
    // On easy a monster only shows up once, so it brings a smaller health bar.
    const scaledDef = { ...def, maxHp: def.maxHp * AGGRESSION[run.difficulty].hp };
    const hp = state?.hp ?? scaledDef.maxHp;
    // Somewhere far from where you come in.
    const plan = this.f.plan;
    const start = plan.rooms[plan.startRoom].rect;
    const sx = (start.x0 + start.x1) / 2, sz = (start.z0 + start.z1) / 2;
    const rooms = plan.rooms.filter((r) => r.id !== plan.startRoom).sort((a, b) => {
      const da = Math.hypot((a.rect.x0 + a.rect.x1) / 2 - sx, (a.rect.z0 + a.rect.z1) / 2 - sz);
      const db = Math.hypot((b.rect.x0 + b.rect.x1) / 2 - sx, (b.rect.z0 + b.rect.z1) / 2 - sz);
      return db - da;
    });
    const room = rooms[Math.floor(Math.random() * Math.min(3, rooms.length))];
    const p = this.nav().nearestFree((room.rect.x0 + room.rect.x1) / 2, (room.rect.z0 + room.rect.z1) / 2);
    const rig = MONSTER_MODELS[name](state?.injuries ?? []);
    // Monsters are never sliced by the dollhouse cut: you always see them whole.
    unclipped(rig.root);
    this.f.group.add(rig.root);
    const m = new Monster(scaledDef, rig, this, p.x, p.z, { hp, fleeHp: fleeAt(scaledDef, run.difficulty, appearance), appearance, injuries: state?.injuries ?? [] });
    m.yaw = Math.random() * 6;
    this.monsters.push(m);
  }

  get boss() {
    return this.monsters.find((m) => !m.minion) ?? null;
  }

  /** Something loud (a smash, a fight) at (x, z): monsters nearby come to look. */
  noise(x: number, z: number) {
    for (const m of this.monsters) m.hear(x, z);
  }

  // ---------- the hero ----------

  /** A monster's blow reaches the hero. */
  hitHero(m: Monster, damage: number, dx: number, dz: number, push = 0, ranged = false): HitResult {
    const f = this.f, h = this.hero;
    if (this.heroDown() || f.phase !== 'play') return 'none';
    if (this.act?.kind === 'dodge' && this.act.t < DODGE.invulnerable) {
      this.pow(h.x, 1.5, h.z, 'WHOOSH', '#ffffff', 0.7);
      return 'dodged';
    }
    if (this.invulnerable > 0) return 'none';
    // Blocking, and facing the monster?
    const facing = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - h.yaw)) < 1.75;
    if (this.blocking && facing) {
      if (f.time - this.blockStart < PARRY.window) {
        if (!ranged) m.stun(PARRY.stun);
        this.stamina = Math.min(STAMINA.max, this.stamina + 15);
        this.pow(h.x, 1.6, h.z, 'PARRY!', '#7fe0ff', 1.1);
        SFX.parry();
        this.shake(0.2);
        return 'parried';
      }
      const through = damage * this.cls.block;
      this.stamina -= STAMINA.blockHit * damage;
      this.staminaWait = STAMINA.delay;
      this.pow(h.x, 1.5, h.z, 'CLANG!', '#d0d8e0', 0.8);
      SFX.block();
      this.push(dx, dz, 0.25);
      if (this.stamina <= 0) {
        // Guard broken: knocked off balance.
        this.stamina = 0;
        this.blocking = false;
        this.act = { kind: 'hurt', t: -0.4 };
        f.say('Whoa!');
      }
      if (through > 0.05) this.damageHero(through, dx, dz, false);
      return 'blocked';
    }
    this.damageHero(damage, dx, dz, true);
    if (push) this.push(dx, dz, push);
    return 'hit';
  }

  // ---------- things monsters throw ----------

  throwAt(m: Monster, a: MonsterAttack, x: number, z: number) {
    const p = a.projectile!;
    for (let i = 0; i < p.count; i++) {
      // Spread a volley around the target.
      const off = p.count > 1 ? (i - (p.count - 1) / 2) * p.spread : (Math.random() - 0.5) * p.spread;
      const ang = Math.atan2(x - m.x, z - m.z) + off;
      const dist = Math.hypot(x - m.x, z - m.z);
      const tx = p.kind === 'blade' ? m.x + Math.sin(ang) * Math.max(5, dist + 1.5) : m.x + Math.sin(ang) * dist;
      const tz = p.kind === 'blade' ? m.z + Math.cos(ang) * Math.max(5, dist + 1.5) : m.z + Math.cos(ang) * dist;
      const mesh = makeThrown(p.kind);
      this.f.group.add(mesh);
      let marker: THREE.Mesh | null = null;
      if (p.kind !== 'blade') {
        // Shows where it will land.
        marker = new THREE.Mesh(new THREE.RingGeometry(p.kind === 'crate' ? 0.65 : 0.45, p.kind === 'crate' ? 0.85 : 0.6, 24), glow(p.kind === 'crate' ? 0xff3020 : 0x60ff40, 1.5));
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(tx, 0.03, tz);
        this.f.group.add(marker);
      }
      const time = Math.hypot(tx - m.x, tz - m.z) / p.speed;
      this.thrown.push({ kind: p.kind, owner: m, x: m.x, z: m.z, y: 1.2, sx: m.x, sz: m.z, tx, tz, t: 0, time, damage: a.damage, mesh, marker, hit: false, returning: false });
    }
    SFX.whoosh(p.kind === 'crate');
  }

  dirt(x: number, z: number) {
    if (Math.random() < 0.5) this.f.particles.burst({ x, y: 0.05, z, count: 2, color: 0x7a5a3a, speed: 1.5, up: 2.5, size: 0.08, life: 0.5 });
    if (Math.random() < 0.15) this.gore.crack(x, z);
  }

  shimmer(x: number, z: number) {
    if (Math.random() < 0.25) this.f.particles.burst({ x: x + (Math.random() - 0.5) * 0.4, y: 0.3 + Math.random() * 0.9, z: z + (Math.random() - 0.5) * 0.4, count: 1, color: 0xc0ffc0, intensity: 1.6, speed: 0.2, up: 0.3, size: 0.04, life: 0.4, gravity: 0 });
  }

  private updateThrown(dt: number) {
    const f = this.f, h = this.hero;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const p = this.thrown[i];
      p.t += dt;
      let gone = false;
      if (p.kind === 'blade') {
        // Out and back like a boomerang, spinning flat; it hurts on the way out and back.
        const k = p.t / p.time;
        if (!p.returning && k >= 1) { p.returning = true; p.t = 0; p.hit = false; p.sx = p.x; p.sz = p.z; }
        const owner = p.owner;
        if (p.returning) {
          const kk = Math.min(1, p.t / p.time);
          p.x = p.sx + (owner.x - p.sx) * kk;
          p.z = p.sz + (owner.z - p.sz) * kk;
          if (kk >= 1 || !owner.alive) gone = true;
        } else {
          p.x = p.sx + (p.tx - p.sx) * k;
          p.z = p.sz + (p.tz - p.sz) * k;
        }
        p.y = 0.9;
        p.mesh.rotation.y += dt * 25;
        if (!p.hit && Math.hypot(h.x - p.x, h.z - p.z) < 0.45) {
          p.hit = true;
          const d = Math.hypot(h.x - p.x, h.z - p.z) || 1;
          this.hitHero(owner, p.damage, (h.x - p.x) / d, (h.z - p.z) / d, 0, true);
        }
        if (f.solidAt(p.x, p.z, 0) && !p.returning) { p.returning = true; p.t = 0; p.sx = p.x; p.sz = p.z; }
      } else {
        const k = Math.min(1, p.t / p.time);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.z = p.sz + (p.tz - p.sz) * k;
        p.y = 1.2 * (1 - k) + Math.sin(k * Math.PI) * (p.kind === 'crate' ? 2.2 : 1.2);
        p.mesh.rotation.x += dt * (p.kind === 'crate' ? 6 : 0);
        if (p.marker) p.marker.scale.setScalar(1 + Math.sin(p.t * 18) * 0.08);
        if (k >= 1) {
          gone = true;
          const r = p.kind === 'crate' ? 0.9 : 0.6;
          const d = Math.hypot(h.x - p.x, h.z - p.z);
          if (d < r + 0.3) this.hitHero(p.owner, p.damage, (h.x - p.x) / (d || 1), (h.z - p.z) / (d || 1), p.kind === 'crate' ? 0.6 : 0, true);
          if (p.kind === 'crate') {
            SFX.smash();
            this.shake(0.3);
            this.pow(p.x, 1, p.z, 'CRASH!', '#ffd23f', 1);
            f.particles.burst({ x: p.x, y: 0.4, z: p.z, count: 24, color: 0xa07a4a, speed: 4, up: 4, size: 0.13, life: 1.1 });
          } else {
            SFX.acid();
            this.pow(p.x, 0.8, p.z, 'SPLOTCH', '#80ff60', 0.8);
            f.particles.burst({ x: p.x, y: 0.2, z: p.z, count: 12, color: 0x70e040, intensity: 1.4, speed: 2.5, up: 2, size: 0.07, life: 0.6 });
            this.addPuddle(p.x, p.z);
          }
        }
      }
      p.mesh.position.set(p.x, p.y, p.z);
      if (gone) {
        p.mesh.removeFromParent();
        p.marker?.removeFromParent();
        this.thrown.splice(i, 1);
      }
    }
    // Acid puddles burn while you stand in them (jumping/dodging through is fine).
    this.puddleTick -= dt;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.t -= dt;
      (q.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, q.t);
      q.mesh.scale.setScalar(1 + Math.sin(f.time * 6 + i) * 0.04);
      if (q.t <= 0) { q.mesh.removeFromParent(); this.puddles.splice(i, 1); continue; }
      if (this.puddleTick <= 0 && Math.hypot(h.x - q.x, h.z - q.z) < q.r && this.act?.kind !== 'dodge' && f.phase === 'play') {
        this.puddleTick = 0.5;
        this.damageHero(0.5, 0, 0, false);
        this.pow(h.x, 1.2, h.z, 'HSSS!', '#80ff60', 0.7);
        SFX.acid();
      }
    }
    if (this.puddleTick <= 0) this.puddleTick = 0;
  }

  private addPuddle(x: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60d030).multiplyScalar(1.3), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025, z);
    mesh.renderOrder = 2;
    this.f.group.add(mesh);
    this.puddles.push({ x, z, r: 0.65, t: 5, mesh });
  }

  private damageHero(damage: number, dx: number, dz: number, flinch: boolean) {
    const f = this.f, h = this.hero, run = f.ctx.run;
    run.hp = Math.max(0, run.hp - damage);
    f.ctx.hud.setHp(run.hp, this.cls.maxHp);
    this.gore.spray(h.x, 0.8, h.z, dx, dz, 0.6 + damage * 0.3);
    this.impacts.spawn(h.x - dx * 0.15, 0.85, h.z - dz * 0.15, 0.6);
    f.heroRig.flinch(flinch ? 1 : 0.4);
    if (flinch) {
      this.act = { kind: 'hurt', t: 0 };
      this.invulnerable = HURT.invulnerable;
      this.push(dx, dz, HURT.push);
      this.pow(h.x, 1.6, h.z, pickOf(['OUCH!', 'OOF!', 'YOW!']), '#ff5a4a', 0.9);
      SFX.hurt();
      this.shake(0.3);
    }
    if (run.hp <= 0) f.heroDies();
  }

  private push(dx: number, dz: number, d: number) {
    const h = this.hero;
    [h.x, h.z] = this.f.collide(h.x + dx * d, h.z + dz * d, HERO.radius);
  }

  /** Turn to the nearest monster in front, if there is one close enough. */
  private aim(range: number, cone = 1.8) {
    const h = this.hero;
    let best: Monster | null = null, bestD = range;
    for (const m of this.monsters) {
      if (!m.alive || !this.visibleAt(m.x, m.z)) continue;
      const d = Math.hypot(m.x - h.x, m.z - h.z);
      const ang = Math.abs(wrapAngle(Math.atan2(m.x - h.x, m.z - h.z) - h.yaw));
      if (d < bestD && ang < cone) { bestD = d; best = m; }
    }
    if (best) h.yaw = Math.atan2(best.x - h.x, best.z - h.z);
    return best;
  }

  private spend(cost: number) {
    if (this.stamina < cost * 0.5) {
      if (Math.random() < 0.3) this.f.say('*pant pant*');
      return false;
    }
    this.stamina -= cost;
    this.staminaWait = STAMINA.delay;
    return true;
  }

  private startMelee(base: MeleeMove, index: number, heavy: boolean, c: HeroControls) {
    const move = this.scaled(base);
    if (!this.spend(move.stamina)) return;
    const h = this.hero;
    if (Math.hypot(c.moveX, c.moveZ) > 0.3) h.yaw = Math.atan2(c.moveX, c.moveZ);
    const target = this.aim(move.reach + 1.6);
    this.act = { kind: 'melee', move, t: 0, hit: false, index, queued: false, heavy, target };
    SFX.whoosh(heavy);
  }

  private startTimed(kind: 'shoot' | 'cast' | 'bash' | 'slam', total: number, at: number) {
    this.act = { kind, t: 0, done: false, total, at };
  }

  /** Read the buttons: start moves, chain combos, hold block. Call before the hero moves. */
  control(c: HeroControls) {
    const f = this.f;
    if (f.phase !== 'play' || f.searching) {
      this.blocking = false;
      return;
    }
    const a = this.act;
    const cls = this.cls;
    const thief = f.look.cls === 'thief';
    // Chain the next hit of a combo if pressed before this one ends.
    if (a?.kind === 'melee' && !a.heavy && c.light && a.index < cls.combo.length - 1 && a.t > a.move.hit * 0.6) a.queued = true;
    if (a) { this.blocking = false; return; }

    const wasBlocking = this.blocking;
    this.blocking = c.block && this.stamina > 0;
    if (this.blocking && !wasBlocking) this.blockStart = f.time;
    if (this.blocking) {
      this.aim(6, Math.PI);
      if (c.dodge) this.blocking = false;
      else return;
    }

    if (c.dodge && this.spend(STAMINA.dodge)) {
      const h = this.hero;
      let dx = c.moveX, dz = c.moveZ;
      if (Math.hypot(dx, dz) < 0.3) { dx = -Math.sin(h.yaw); dz = -Math.cos(h.yaw); }
      const l = Math.hypot(dx, dz);
      this.act = { kind: 'dodge', t: 0, dx: dx / l, dz: dz / l };
      SFX.dodge();
      return;
    }
    if (c.light) {
      if (thief && f.ctx.run.arrows > 0) {
        this.aim(CROSSBOW.range, 0.7);
        this.startTimed('shoot', CROSSBOW.reload + 0.12, 0.12);
        return;
      }
      this.startMelee(cls.combo[0], 0, false, c);
      return;
    }
    if (c.heavy) {
      this.startMelee(cls.heavy, 0, true, c);
      return;
    }
    if (c.special) this.special();
  }

  private special() {
    const f = this.f;
    const sp = this.cls.special;
    if (sp.kind === 'blast') {
      if (this.charges <= 0) { f.say('Out of magic!'); return; }
      this.aim(BLAST.range, 0.6);
      this.charges--;
      this.startTimed('cast', 0.45, 0.15);
      return;
    }
    if (this.specialCool > 0) return;
    this.specialCool = sp.cooldown;
    if (sp.kind === 'bash') { this.aim(2.5); this.startTimed('bash', 0.5, 0.18); SFX.whoosh(false); }
    else if (sp.kind === 'slam') { this.startTimed('slam', 0.85, 0.45); f.say('RAAAH!', true); }
    else {
      // Smoke bomb: vanish backwards; monsters lose you for a moment.
      const h = this.hero;
      this.smoke(h.x, h.z);
      this.pow(h.x, 1.4, h.z, 'POOF!', '#e0e0e0', 1);
      SFX.smoke();
      for (const m of this.monsters) if (m.alive && Math.hypot(m.x - h.x, m.z - h.z) < 9) m.blind = SMOKE.blind;
      const dx = -Math.sin(h.yaw), dz = -Math.cos(h.yaw);
      [h.x, h.z] = f.collide(h.x + dx * SMOKE.dash, h.z + dz * SMOKE.dash, HERO.radius);
    }
  }

  /** Pose for the hero right now, or null to let walking/idle decide. */
  /** Pose for the hero right now, how far through it, and when in it the blow lands. */
  pose(): { pose: Pose; p: number; hit: number } | null {
    const a = this.act;
    if (!a) return this.blocking ? { pose: 'block', p: 0, hit: 0 } : null;
    switch (a.kind) {
      case 'melee': return { pose: a.move.pose, p: a.t / a.move.total, hit: a.move.hit / a.move.total };
      case 'shoot':
      case 'cast':
      case 'bash':
      case 'slam': return { pose: a.kind, p: a.t / a.total, hit: a.at / a.total };
      case 'dodge': return { pose: 'dodge', p: a.t / DODGE.time, hit: 0 };
      case 'hurt': return { pose: 'hurt', p: 0, hit: 0 };
    }
  }

  /** How fast the hero may walk right now (1 = normal; 0 = rooted by an action). */
  get moveFactor() {
    if (this.act) return 0;
    return this.cls.speed * (this.blocking ? 0.35 : 1);
  }

  update(dt: number) {
    const f = this.f, h = this.hero;
    // A tiny freeze on big hits sells the impact.
    if (this.hitPause > 0) { this.hitPause -= dt; dt *= 0.15; }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.specialCool = Math.max(0, this.specialCool - dt);
    const max = this.cls.special.charges ?? 0;
    if (this.charges < max) {
      this.chargeT += dt;
      if (this.chargeT >= BLAST.recharge) { this.chargeT = 0; this.charges++; }
    }
    this.staminaWait -= dt;
    if (this.staminaWait <= 0 && !this.blocking) this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * dt);

    const a = this.act;
    if (a) {
      a.t += dt;
      switch (a.kind) {
        case 'melee': {
          const m = a.move;
          // Step into the blow as it lands (further if the target is just out of reach).
          if (a.t > m.hit - 0.1 && a.t < m.hit + 0.04) {
            let step = (m.lunge ?? 0) + 0.15;
            if (a.target?.alive) {
              const gap = Math.hypot(a.target.x - h.x, a.target.z - h.z) - a.target.def.radius - m.reach * 0.7;
              step += Math.max(0, Math.min(0.45, gap));
              h.yaw = Math.atan2(a.target.x - h.x, a.target.z - h.z);
            }
            const s = (step / 0.14) * dt;
            [h.x, h.z] = f.collide(h.x + Math.sin(h.yaw) * s, h.z + Math.cos(h.yaw) * s, HERO.radius);
          }
          if (!a.hit && a.t >= m.hit) { a.hit = true; this.meleeHit(m, a.heavy); }
          if (a.t >= m.total) {
            this.act = null;
            if (a.queued) {
              const next = this.scaled(this.cls.combo[a.index + 1]);
              if (this.spend(next.stamina)) {
                const target = this.aim(next.reach + 1.6);
                this.act = { kind: 'melee', move: next, t: 0, hit: false, index: a.index + 1, queued: false, heavy: false, target };
                SFX.whoosh(a.index + 1 === this.cls.combo.length - 1);
              }
            }
          }
          break;
        }
        case 'shoot':
        case 'cast':
        case 'bash':
        case 'slam': {
          if (!a.done && a.t >= a.at) { a.done = true; this.fire(a.kind); }
          if (a.t >= a.total) this.act = null;
          break;
        }
        case 'dodge': {
          const k = 1 - a.t / DODGE.time;
          const s = DODGE.speed * (0.4 + 0.6 * k) * dt;
          [h.x, h.z] = f.collide(h.x + a.dx * s, h.z + a.dz * s, HERO.radius);
          if (a.t >= DODGE.time) this.act = null;
          break;
        }
        case 'hurt':
          if (a.t >= HURT.time) this.act = null;
          break;
      }
    }

    for (const m of this.monsters) m.update(dt);
    this.updateThrown(dt);
    // The swoosh follows the real weapon tip through the strike.
    const act = this.act;
    const hitAt = act?.kind === 'melee' ? act.move.hit : act && 'at' in act ? act.at : -1;
    this.trail.recording = !!act && (act.kind === 'melee' || act.kind === 'slam' || act.kind === 'bash') && act.t > hitAt - 0.1 && act.t < hitAt + 0.08;
    const rig = f.heroRig;
    rig.hand.getWorldPosition(this.handPos);
    rig.tip.getWorldPosition(this.tipPos);
    this.trail.update(dt, this.handPos, this.tipPos);
    this.impacts.update(dt);
    this.updateProjectiles(dt);
    this.gore.update(dt);
    this.hud(dt);
  }

  private meleeHit(move: MeleeMove, heavy: boolean) {
    const f = this.f, h = this.hero;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    let landed = false;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.x - h.x, dz = m.z - h.z, d = Math.hypot(dx, dz);
      if (d > move.reach + m.def.radius + HERO.radius * 0.5) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - h.yaw)) > (move.arc * Math.PI) / 180) continue;
      const nx = dx / (d || 1), nz = dz / (d || 1);
      if (m.takeHit(move.damage, nx, nz, { push: move.push, stun: move.stun, heavy })) {
        landed = true;
        this.impacts.spawn(m.x - nx * 0.15, 0.75, m.z - nz * 0.15, heavy ? 0.95 : 0.65);
        const words = heavy ? HEAVY_WORDS : f.look.cls === 'wizard' || f.look.cls === 'thief' ? BLADE_WORDS : BLUNT_WORDS;
        this.pow(m.x, 1.2, m.z, pickOf(words), heavy ? '#ff7a3a' : '#ffd23f', heavy ? 1.1 : 0.85);
      }
    }
    // Smash crates and vases that are in the way.
    for (const r of f.pieces) {
      if (r.gone || r.searched || FURNITURE[r.p.kind].search !== 'smash' || !r.model.group.visible) continue;
      const cx = (r.p.box.x0 + r.p.box.x1) / 2, cz = (r.p.box.z0 + r.p.box.z1) / 2;
      const dx = cx - h.x, dz = cz - h.z;
      if (Math.hypot(dx, dz) > move.reach + 0.6) continue;
      if (dx * fx + dz * fz < 0) continue;
      f.smash(r);
      landed = true;
    }
    if (landed) {
      SFX.hit(heavy);
      this.shake(heavy ? 0.35 : 0.15);
      this.hitPause = heavy ? 0.09 : 0.04;
      this.noise(h.x, h.z);
    }
  }

  private fire(kind: 'shoot' | 'cast' | 'bash' | 'slam') {
    const f = this.f, h = this.hero;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    if (kind === 'shoot' || kind === 'cast') {
      const bolt = kind === 'shoot';
      if (bolt) f.ctx.run.arrows--;
      const mesh = bolt ? makeBolt() : makeBlast();
      f.group.add(mesh);
      const speed = bolt ? CROSSBOW.speed : BLAST.speed;
      this.projectiles.push({
        kind: bolt ? 'bolt' : 'blast', x: h.x + fx * 0.5, z: h.z + fz * 0.5, vx: fx * speed, vz: fz * speed,
        dist: 0, range: bolt ? CROSSBOW.range : BLAST.range, damage: bolt ? CROSSBOW.damage : BLAST.damage, mesh,
      });
      if (bolt) SFX.bolt();
      else SFX.blast();
      return;
    }
    if (kind === 'bash') {
      for (const m of this.monsters) {
        if (!m.alive) continue;
        const dx = m.x - h.x, dz = m.z - h.z, d = Math.hypot(dx, dz);
        if (d > BASH.reach + m.def.radius || Math.abs(wrapAngle(Math.atan2(dx, dz) - h.yaw)) > 1.1) continue;
        m.takeHit(BASH.damage, dx / d, dz / d, { push: 0.6, stun: BASH.stun });
        this.pow(m.x, 1.3, m.z, 'BONK!', '#ffd23f', 1);
        SFX.block();
      }
      return;
    }
    // Slam: the floor shakes, everything around flies.
    this.shake(0.6);
    this.pow(h.x + fx, 0.8, h.z + fz, 'KRA-KOOM!', '#ff9a3a', 1.3);
    SFX.slam();
    f.particles.burst({ x: h.x + fx * 0.6, y: 0.1, z: h.z + fz * 0.6, count: 40, color: 0x9a8a70, speed: 5, up: 3, size: 0.12, life: 0.9 });
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.x - h.x, dz = m.z - h.z, d = Math.hypot(dx, dz);
      if (d > SLAM.radius + m.def.radius) continue;
      m.takeHit(SLAM.damage, dx / (d || 1), dz / (d || 1), { push: SLAM.push, stun: SLAM.stun, heavy: true });
    }
    for (const r of f.pieces) {
      if (r.gone || r.searched || FURNITURE[r.p.kind].search !== 'smash' || !r.model.group.visible) continue;
      if (Math.hypot(r.p.x - h.x, r.p.z - h.z) < SLAM.radius + 0.4) f.smash(r);
    }
    this.noise(h.x, h.z);
  }

  private updateProjectiles(dt: number) {
    const f = this.f;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = Math.hypot(p.vx, p.vz) * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.dist += step;
      let done = p.dist > p.range || f.solidAt(p.x, p.z, 0.02);
      for (const m of this.monsters) {
        if (done || !m.alive) continue;
        if (Math.hypot(m.x - p.x, m.z - p.z) > m.def.radius + 0.15) continue;
        const l = Math.hypot(p.vx, p.vz);
        m.takeHit(p.damage, p.vx / l, p.vz / l, { push: p.kind === 'blast' ? 0.5 : 0.15, stun: p.kind === 'blast' ? 0.35 : 0 });
        this.impacts.spawn(p.x, 1, p.z, 0.6);
        this.pow(m.x, 1.2, m.z, p.kind === 'blast' ? 'ZAP!' : 'THUNK!', p.kind === 'blast' ? '#c9a0ff' : '#ffd23f', 0.9);
        SFX.hit(p.kind === 'blast');
        done = true;
      }
      if (p.kind === 'blast') f.particles.burst({ x: p.x, y: 1.0, z: p.z, count: 1, color: 0xb070ff, intensity: 3, speed: 0.3, up: 0.3, size: 0.07, life: 0.4, gravity: 0 });
      p.mesh.position.set(p.x, 1.0, p.z);
      p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
      if (done) {
        f.particles.burst({ x: p.x, y: 1, z: p.z, count: p.kind === 'blast' ? 14 : 4, color: p.kind === 'blast' ? 0xb070ff : 0x8a6a3a, intensity: p.kind === 'blast' ? 3 : 1, speed: 2.5, up: 1, size: 0.07, life: 0.5 });
        p.mesh.removeFromParent();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Keep the health bar, stamina and special readouts current. */
  private hud(dt: number) {
    const hud = this.f.ctx.hud;
    hud.setStamina(this.stamina / STAMINA.max);
    const sp = this.cls.special;
    const thief = this.f.look.cls === 'thief';
    if (sp.kind === 'blast') hud.setSpecial('✦'.repeat(this.charges) + '·'.repeat((sp.charges ?? 0) - this.charges), this.charges > 0 ? 1 : this.chargeT / BLAST.recharge);
    else hud.setSpecial(thief ? `➶ ${this.f.ctx.run.arrows}` : '★', 1 - this.specialCool / sp.cooldown);
    const b = this.boss;
    if (b && (b.engaged || b.state === 'flee')) this.barT = 3;
    else this.barT -= dt;
    if (b && this.barT > 0 && b.state !== 'gone') hud.monster(b.name, b.hp / b.def.maxHp, b.fleeHp / b.def.maxHp);
    else hud.monster(null, 0, 0);
  }

  dispose() {
    for (const m of this.monsters) m.dispose();
    for (const p of this.projectiles) p.mesh.removeFromParent();
    for (const p of this.thrown) { p.mesh.removeFromParent(); p.marker?.removeFromParent(); }
    for (const q of this.puddles) q.mesh.removeFromParent();
  }
}

function pickOf<T>(list: readonly T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeBolt() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), toon(0x8a6a3a));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), toon(0xb8bcc4));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.22;
  g.add(tip);
  ink(g);
  return unclipped(g);
}

function makeThrown(kind: 'crate' | 'acid' | 'blade') {
  const g = new THREE.Group();
  if (kind === 'crate') {
    g.add(block(0.55, 0.55, 0.55, 0xa07a4a, 0, -0.275, 0));
    for (const s of [-1, 1]) g.add(block(0.57, 0.08, 0.02, 0x7a5a32, 0, -0.04, s * 0.28));
  } else if (kind === 'acid') {
    const glob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glow(0x70f040, 1.6));
    glob.scale.set(1, 0.8, 1.3);
    g.add(glob);
  } else {
    const blade = new THREE.Shape();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      blade.lineTo(Math.cos(a) * 0.32, Math.sin(a) * 0.32);
      blade.lineTo(Math.cos(a + 0.5) * 0.08, Math.sin(a + 0.5) * 0.08);
    }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: false }), toon(0xc8ccd4));
    m.rotation.x = -Math.PI / 2;
    g.add(m);
  }
  ink(g);
  return unclipped(g);
}

function makeBlast() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glow(0xb070ff, 3)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0xffffff, 4)));
  return g;
}
