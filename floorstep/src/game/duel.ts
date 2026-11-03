// Fight scenes. When a monster sees you, the camera swings to the side of the room and it's a
// one-on-one fight on a line, like the old arcade fighting games: walk, jump, crouch, block high
// or low, dodge, combos and specials. Nobody leaves until the monster runs away or dies, or you fall.
import * as THREE from 'three';
import { clamp, damp } from '@engine/math';
import { AGGRESSION, BASH, BLAST, COMBAT, CROSSBOW, type MeleeMove, PARRY, SLAM, STAMINA } from '../data/combat';
import { weaponOf } from '../data/heroes';
import type { MonsterAttack } from '../data/monsters';
import type { Pose } from '../entities/heroModel';
import { type MonsterPose, type MonsterRig, buildRat } from '../entities/monsterModel';
import { CUT_Z, block, glow, ink, toon, unclipped } from '../world/toon';
import { rectOverlap, roomAt } from '../world/plan';
import type { HeroControls } from './controls';
import type { Floor, PieceRT } from './floor';
import type { Monster } from './monster';
import { SFX } from './sounds';

type Height = 'high' | 'mid' | 'low' | 'overhead';

/** A hero move in a fight scene. */
interface Move {
  pose: Pose;
  hit: number;
  total: number;
  damage: number;
  reach: number;
  height: Height;
  stamina: number;
  push: number;
  stun: number;
  heavy: boolean;
  /** Steps forward this far as it strikes. */
  step: number;
  /** Knocks the monster up off its feet. */
  launch?: boolean;
  unblockable?: boolean;
  /** What happens at the hit moment (default: a blow in front). */
  kind?: 'melee' | 'bolt' | 'blast' | 'slam' | 'bash' | 'smoke';
  /** Position in the light combo (0, 1, 2). */
  combo?: number;
}

type MonState = 'enter' | 'neutral' | 'attack' | 'recover' | 'hurt' | 'stun' | 'guard' | 'down' | 'flee' | 'dead';

interface Shot {
  kind: 'bolt' | 'blast' | 'crate' | 'acid' | 'blade';
  mine: boolean;
  x: number;
  y: number;
  vx: number;
  /** Arcs: from sx to tx over `time`. */
  sx: number;
  tx: number;
  t: number;
  time: number;
  damage: number;
  mesh: THREE.Object3D;
  marker: THREE.Mesh | null;
  returning?: boolean;
  hit?: boolean;
}

interface Rat {
  rig: MonsterRig;
  x: number;
  dir: number;
  t: number;
  dead: number;
  bit: boolean;
}

const GRAVITY = 15;
const JUMP = 5.6;
const HERO_R = 0.3;
const BLADE_WORDS = ['SHLIK!', 'SLASH!', 'SNIKT!'];
const BLUNT_WORDS = ['THWACK!', 'BONK!', 'WHAP!'];
const HEAVY_WORDS = ['KRUNCH!', 'WHAM!', 'KA-POW!'];
const v = new THREE.Vector3();
const pickOf = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export class Duel {
  readonly lineZ: number;
  readonly minX: number;
  readonly maxX: number;
  /** 'intro' (camera swings round), 'fight', then 'won' / 'fled' / 'lost'. */
  phase: 'intro' | 'fight' | 'won' | 'fled' | 'lost' = 'intro';
  private t = 0;
  private endT = 0;

  readonly h = {
    x: 0, y: 0, vx: 0, vy: 0, face: 1, air: false, crouch: false, block: false, blockStart: -10,
    act: null as { move: Move; t: number; hit: boolean; queued: boolean } | null,
    dash: null as { t: number; dir: number; roll: boolean } | null,
    hurtT: 0, downT: 0, inv: 0, airAttacked: false, prevUp: false,
  };
  readonly m = {
    x: 0, y: 0, vx: 0, vy: 0, face: -1, state: 'enter' as MonState, t: 0, attack: null as MonsterAttack | null, hitIndex: 0,
    cool: 1.2, plan: 'close' as 'close' | 'wait' | 'back', planT: 0, turnT: 0, lockX: 0, sub: 0, subT: 0, hidden: false,
    hitTimes: [] as number[], stateFor: 0, dashHit: false, summonT: 10,
  };
  private shots: Shot[] = [];
  private puddles: { x: number; t: number; mesh: THREE.Mesh }[] = [];
  private puddleTick = 0;
  private rats: Rat[] = [];
  private marker: THREE.Mesh;
  private hidden: PieceRT[] = [];
  private camFrom = new THREE.Vector3();
  private lookFrom = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private hitPause = 0;
  private trailOn = false;
  private poseT = 0;
  private lastPose: Pose = 'idle';

  constructor(private f: Floor, readonly monster: Monster) {
    const plan = f.plan;
    const room = roomAt(plan, f.hero.x, f.hero.z) ?? roomAt(plan, monster.x, monster.z) ?? plan.rooms[0];
    const r = room.rect;
    this.lineZ = (r.z0 + r.z1) / 2;
    this.minX = r.x0 + 0.55;
    this.maxX = r.x1 - 0.55;
    const h = this.h, m = this.m;
    // Line the two up across the room, keeping who's on which side.
    const mid = clamp((f.hero.x + monster.x) / 2, this.minX + 1.6, this.maxX - 1.6);
    const side = Math.sign(monster.x - f.hero.x) || 1;
    h.x = mid - side * 1.6;
    m.x = mid + side * 1.6;
    h.face = side;
    m.face = -side;
    monster.inDuel = true;
    monster.hidden = false;
    // Anything between the camera and the fighters goes away for the fight.
    const band = { x0: r.x0 - 1, x1: r.x1 + 1, z0: this.lineZ - 0.45, z1: this.lineZ + 7 };
    for (const p of f.pieces) {
      if (!p.model.group.visible || p.p.kind === 'rug') continue;
      if (rectOverlap(p.p.box, band)) { p.model.group.visible = false; this.hidden.push(p); }
    }
    // Residents in the way step out of the picture too.
    for (const l of f.residents?.list ?? []) if (rectOverlap(l.box, band)) l.body.root.visible = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 28), glow(0xff3020, 1.5));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    f.group.add(this.marker);
    f.camera.getWorldPosition(this.camFrom);
    this.lookFrom.set(f.hero.x, 0, f.hero.z);
    f.ctx.bubbles.prompt(null, '', '');
    f.ctx.bubbles.ring(null);
    f.ctx.hud.banner('FIGHT!', `${f.look.name} vs ${monster.name}`, 1.6);
    setTimeout(() => f.say(f.line('fightStart', {}, ['Here we go!'])), 700);
    SFX.monster('growl', 1, false);
    monster.rig.move = 'idle';
  }

  private get cls() {
    return COMBAT[this.f.look.cls];
  }

  /** The hero's moves, adjusted for the chosen weapon. */
  private moves() {
    const cls = this.cls, w = weaponOf(this.f.look);
    const s = (m: MeleeMove, height: Height, extra: Partial<Move> = {}): Move => ({
      pose: m.pose, hit: m.hit / w.speed, total: m.total / w.speed, damage: m.damage * w.damage, reach: m.reach * w.reach,
      height, stamina: m.stamina, push: m.push ?? 0.2, stun: m.stun ?? 0, heavy: false, step: m.lunge ?? 0, ...extra,
    });
    const L = cls.combo[0], H = cls.heavy;
    return {
      combo: cls.combo.map((m, i) => s(m, i === 2 ? 'mid' : 'high', { combo: i, heavy: i === 2 })),
      heavy: s(H, 'mid', { heavy: true }),
      sweep: s({ ...L, pose: 'swing1', hit: 0.15, total: 0.45 }, 'low', { pose: 'sweep', damage: L.damage * w.damage * 0.9 }),
      rising: s({ ...H, hit: 0.18, total: 0.62 }, 'mid', { pose: 'rising', damage: H.damage * w.damage * 0.75, launch: true, heavy: true, stamina: 18 }),
      lunge: s({ ...H, hit: 0.3, total: 0.75 }, 'mid', { pose: 'thrust', damage: H.damage * w.damage * 0.85, step: 1.1, heavy: true, stamina: 20 }),
      airLight: s({ ...L, hit: 0.08, total: 0.32 }, 'overhead', { pose: 'airslash', damage: L.damage * w.damage * 1.2 }),
      airHeavy: s({ ...H, hit: 0.14, total: 0.42 }, 'overhead', { pose: 'airslash', damage: H.damage * w.damage * 0.8, heavy: true }),
    };
  }

  // ---------- the hero ----------

  private start(move: Move) {
    const st = this.f.combat;
    if (st.stamina < move.stamina * 0.5) {
      if (Math.random() < 0.3) this.f.say(this.f.line('pant', {}, ['*pant pant*']));
      return;
    }
    st.stamina -= move.stamina;
    st.staminaWait = STAMINA.delay;
    this.h.act = { move, t: 0, hit: false, queued: false };
    SFX.whoosh(move.heavy);
    // The monster sees it coming and may put its guard up.
    this.monsterSeesAttack();
  }

  private heroControl(c: HeroControls) {
    const h = this.h, f = this.f;
    const up = c.moveZ < -0.6;
    const jump = (up && !h.prevUp) || c.interact;
    h.prevUp = up;
    if (h.hurtT > 0 || h.downT > 0 || h.dash) { h.block = false; return; }
    const M = this.moves();
    const fwd = c.moveX * h.face > 0.5;
    const back = c.moveX * h.face < -0.5;
    const a = h.act;
    // Chain the light combo.
    if (a && a.move.combo !== undefined && a.move.combo < 2 && c.light && a.t > a.move.hit * 0.6) a.queued = true;
    if (a) return;

    if (h.air) {
      // One attack per jump.
      if (!h.airAttacked && (c.light || c.heavy)) {
        h.airAttacked = true;
        this.start(c.heavy ? M.airHeavy : M.airLight);
      }
      return;
    }
    h.crouch = c.moveZ > 0.55;
    const wasBlocking = h.block;
    h.block = c.block && f.combat.stamina > 0;
    if (h.block && !wasBlocking) h.blockStart = this.t;
    if (h.block && !c.dodge) return;

    if (c.dodge && f.combat.stamina >= STAMINA.dodge * 0.5) {
      f.combat.stamina -= STAMINA.dodge;
      f.combat.staminaWait = STAMINA.delay;
      // Forward rolls right past the monster; otherwise a quick hop back.
      h.dash = fwd ? { t: 0, dir: h.face, roll: true } : { t: 0, dir: -h.face, roll: false };
      h.inv = fwd ? 0.42 : 0.24;
      h.block = false;
      SFX.dodge();
      return;
    }
    if (jump) {
      h.air = true;
      h.vy = JUMP;
      h.vx = fwd ? 2.8 * h.face : back ? -2.6 * h.face : 0;
      h.airAttacked = false;
      h.crouch = false;
      SFX.dodge();
      return;
    }
    if (c.light) {
      if (h.crouch) return this.start(M.sweep);
      if (f.look.cls === 'thief' && f.ctx.run.arrows > 0 && !fwd) {
        return this.start({ ...M.combo[0], pose: 'shoot', hit: 0.12, total: CROSSBOW.reload + 0.12, kind: 'bolt', stamina: 4, combo: undefined });
      }
      return this.start(M.combo[0]);
    }
    if (c.heavy) {
      if (h.crouch) return this.start(M.rising);
      return this.start(fwd ? M.lunge : M.heavy);
    }
    if (c.special) this.special();
  }

  private special() {
    const f = this.f, cb = f.combat;
    const sp = this.cls.special;
    const base = { hit: 0.18, total: 0.5, damage: 0, reach: 0, height: 'mid' as Height, stamina: 0, push: 0, stun: 0, heavy: false, step: 0 };
    if (sp.kind === 'blast') {
      if (cb.charges <= 0) { f.say(f.line('noMagic', {}, ['Out of magic!'])); return; }
      cb.charges--;
      this.start({ ...base, pose: 'cast', hit: 0.15, total: 0.45, kind: 'blast', damage: BLAST.damage });
      return;
    }
    if (cb.specialCool > 0) return;
    cb.specialCool = sp.cooldown;
    if (sp.kind === 'bash') this.start({ ...base, pose: 'bash', kind: 'bash', damage: BASH.damage, reach: BASH.reach, stun: BASH.stun, unblockable: true, step: 0.3 });
    else if (sp.kind === 'slam') { this.start({ ...base, pose: 'slam', hit: 0.45, total: 0.85, kind: 'slam', damage: SLAM.damage, reach: SLAM.radius, stun: SLAM.stun, unblockable: true, height: 'low', heavy: true }); f.say(f.line('battleCry', {}, ['RAAAH!']), true); }
    else this.start({ ...base, pose: 'cast', hit: 0.12, total: 0.4, kind: 'smoke' });
  }

  private updateHero(dt: number) {
    const h = this.h, f = this.f, m = this.m;
    h.inv = Math.max(0, h.inv - dt);
    if (h.hurtT > 0) h.hurtT -= dt;
    if (h.downT > 0) {
      h.downT -= dt;
      if (h.downT <= 0) h.inv = 0.5;
    }
    // Facing: always toward the monster, when your feet are on the ground and you're free.
    if (!h.air && !h.act && !h.dash && h.hurtT <= 0 && m.state !== 'flee') h.face = Math.sign(m.x - h.x) || h.face;

    if (h.dash) {
      h.dash.t += dt;
      const dur = h.dash.roll ? 0.45 : 0.3;
      h.x += h.dash.dir * (h.dash.roll ? 6.2 : 5.5) * (1 - h.dash.t / dur) * dt * 1.6;
      if (h.dash.t >= dur) h.dash = null;
    } else if (h.act) {
      const a = h.act, mv = a.move;
      a.t += dt;
      // Step into the blow.
      if (!h.air && a.t > mv.hit - 0.1 && a.t < mv.hit + 0.04) {
        let step = mv.step + 0.12;
        const gap = (m.x - h.x) * h.face - this.monsterR() - mv.reach * 0.7;
        if (gap > 0 && mv.kind === undefined) step += Math.min(0.4, gap);
        h.x += h.face * (step / 0.14) * dt;
      }
      if (!a.hit && a.t >= mv.hit) { a.hit = true; this.resolve(mv); }
      if (a.t >= mv.total) {
        h.act = null;
        if (a.queued && mv.combo !== undefined) {
          const next = this.moves().combo[mv.combo + 1];
          if (next) this.start(next);
        }
      }
    } else if (!h.air && h.hurtT <= 0 && h.downT <= 0 && !h.block && !h.crouch) {
      const c = this.lastControls;
      const fwd = c.moveX * h.face > 0;
      const speed = (fwd ? 2.9 : 2.3) * this.cls.speed;
      h.vx = damp(h.vx, c.moveX * speed, 12, dt);
    } else if (!h.air) {
      h.vx = damp(h.vx, 0, 12, dt);
    }
    if (h.air) {
      h.vy -= GRAVITY * dt;
      h.y += h.vy * dt;
      if (h.y <= 0) {
        h.y = 0;
        h.air = false;
        h.vy = 0;
        if (h.act?.move.pose === 'airslash') h.act = null;
        SFX.step();
      }
    }
    h.x += h.vx * dt;
    if (h.hurtT > 0 || h.downT > 0) h.vx = damp(h.vx, 0, 6, dt);
    // Bodies don't overlap on the ground (you can jump or roll over/past).
    const gap = this.monsterR() + HERO_R;
    if (!h.air && !h.dash?.roll && !m.hidden && m.y < 0.5 && m.state !== 'flee' && m.state !== 'dead' && Math.abs(h.x - m.x) < gap) {
      const side = Math.sign(h.x - m.x) || -m.face;
      h.x = m.x + side * gap;
    }
    h.x = clamp(h.x, this.minX, this.maxX);
    // Stamina comes back when you're not blocking.
    const cb = f.combat;
    cb.staminaWait -= dt;
    if (cb.staminaWait <= 0 && !h.block) cb.stamina = Math.min(STAMINA.max, cb.stamina + STAMINA.regen * dt);
  }

  private monsterR() {
    return this.monster.def.radius * 0.8;
  }

  /** The hero's blow lands (or the shot flies, the smoke goes off...). */
  private resolve(mv: Move) {
    const h = this.h, m = this.m, f = this.f;
    switch (mv.kind) {
      case 'bolt':
      case 'blast': {
        const bolt = mv.kind === 'bolt';
        if (bolt) f.ctx.run.arrows--;
        const mesh = bolt ? makeBolt() : makeBlast();
        f.group.add(mesh);
        const speed = bolt ? CROSSBOW.speed : BLAST.speed;
        this.shots.push({ kind: mv.kind, mine: true, x: h.x + h.face * 0.4, y: h.y + 0.95, vx: h.face * speed, sx: 0, tx: 0, t: 0, time: 0, damage: bolt ? CROSSBOW.damage : BLAST.damage, mesh, marker: null });
        if (bolt) SFX.bolt();
        else SFX.blast();
        return;
      }
      case 'smoke': {
        // Vanish in smoke and pop up behind it.
        this.f.combat.smoke(h.x, this.lineZ);
        this.pow(h.x, 1.4, 'POOF!', '#e0e0e0', 1);
        SFX.smoke();
        h.x = clamp(m.x - m.face * 1.1, this.minX, this.maxX);
        h.face = Math.sign(m.x - h.x) || h.face;
        m.turnT = 0.6;
        this.f.combat.smoke(h.x, this.lineZ);
        return;
      }
      case 'slam': {
        this.f.shakeBy(0.6);
        this.pow(h.x + h.face, 0.8, 'KRA-KOOM!', '#ff9a3a', 1.3);
        SFX.slam();
        f.particles.burst({ x: h.x + h.face * 0.6, y: 0.1, z: this.lineZ, count: 40, color: 0x9a8a70, speed: 5, up: 3, size: 0.12, life: 0.9 });
        if (Math.abs(m.x - h.x) < mv.reach + this.monsterR() && m.y < 0.4) this.hitMonster(mv, Math.sign(m.x - h.x));
        this.hitRats(mv, true);
        return;
      }
    }
    // A blow in front.
    const dx = (m.x - h.x) * h.face;
    let landed = false;
    const lowMiss = mv.height === 'low' && m.y > 0.4;
    if (!m.hidden && dx > -0.25 && dx < mv.reach + this.monsterR() + 0.1 && !lowMiss && m.state !== 'dead' && m.state !== 'flee') {
      this.hitMonster(mv, h.face);
      landed = true;
    }
    if (this.hitRats(mv, false)) landed = true;
    if (!landed) SFX.whoosh(false);
  }

  private hitRats(mv: Move, around: boolean) {
    const h = this.h;
    let any = false;
    for (const r of this.rats) {
      if (r.dead > 0) continue;
      const dx = (r.x - h.x) * h.face;
      if ((around ? Math.abs(r.x - h.x) : dx) < (around ? mv.reach : mv.reach + 0.3) && (around || dx > -0.2)) {
        r.dead = 0.01;
        any = true;
        this.f.combat.gore.spray(r.x, 0.2, this.lineZ, Math.sign(r.x - h.x), 0, 0.5);
        this.pow(r.x, 0.7, 'SQUEAK!', '#ffffff', 0.6);
      }
    }
    return any;
  }

  /** Something the hero did connects with the monster (unless it blocks or it's armoured there). */
  private hitMonster(mv: { damage: number; heavy: boolean; height: Height; push: number; stun: number; launch?: boolean; unblockable?: boolean }, dir: number) {
    const m = this.m, f = this.f, mon = this.monster;
    if (m.hidden || m.state === 'dead' || m.state === 'flee') return;
    const at = (x: number) => (this.f.combat.impacts.spawn(x, 0.9 + m.y, this.lineZ + 0.1, mv.heavy ? 0.95 : 0.65));
    // Its guard is up: low blows get under it, the rest clonk off.
    if (m.state === 'guard' && !mv.unblockable && mv.height !== 'low') {
      this.pow(m.x, 1.4, 'CLONK!', '#d0d8e0', 0.9);
      SFX.block();
      this.h.vx = -dir * 2;
      at(m.x - dir * 0.2);
      return;
    }
    let damage = mv.damage;
    // Armour (Sieger): from the front it just clangs, unless it's off balance.
    const fromFront = Math.sign(this.h.x - m.x) === m.face;
    if (mon.def.armor !== undefined && fromFront && m.state !== 'stun' && m.state !== 'recover' && m.state !== 'down') {
      damage *= mon.def.armor;
      this.pow(m.x, 1.5, 'CLANG!', '#d0d8e0', 0.9);
      SFX.monster('clang', 1, false);
      if (Math.random() < 0.35) this.f.combat.monsterSays(mon, pickOf(mon.def.lines.taunt));
    } else {
      const words = mv.heavy ? HEAVY_WORDS : this.f.look.cls === 'wizard' || this.f.look.cls === 'thief' ? BLADE_WORDS : BLUNT_WORDS;
      this.pow(m.x, 1.3 + m.y, pickOf(words), mv.heavy ? '#ff7a3a' : '#ffd23f', mv.heavy ? 1.1 : 0.85);
    }
    at(m.x - dir * 0.2);
    SFX.hit(mv.heavy);
    f.shakeBy(mv.heavy ? 0.35 : 0.15);
    this.hitPause = mv.heavy ? 0.09 : 0.04;
    const res = mon.wound(damage, dir, mv.heavy);
    if (res === 'flee') { this.setM('flee'); m.face = dir; return; }
    if (res === 'dead') { this.setM('dead'); return; }
    // Reactions: little hits don't stop a wind-up; big ones, stuns and launchers do.
    const winding = m.state === 'attack';
    m.vx += dir * mv.push * 5;
    if (mv.launch) {
      m.vy = 5;
      m.y = Math.max(m.y, 0.05);
      this.setM('down', 1.0);
      m.attack = null;
      this.hideMarker();
    } else if (mv.stun) {
      this.setM('stun', mv.stun);
      m.attack = null;
      this.hideMarker();
    } else if (mv.heavy || !winding) {
      if (m.state !== 'stun' && m.state !== 'down' && m.state !== 'recover') {
        this.setM('hurt', mv.heavy ? 0.45 : 0.25);
        m.attack = null;
        this.hideMarker();
      }
    }
    // Pecked at over and over? It snaps back with a quick counter.
    m.hitTimes = m.hitTimes.filter((t) => this.t - t < 1.4);
    m.hitTimes.push(this.t);
    if (m.hitTimes.length >= 3 && m.state !== 'stun' && m.state !== 'down') {
      m.hitTimes = [];
      const swipe = mon.def.attacks.find((x) => x.kind === 'melee') ?? mon.def.attacks[0];
      this.beginAttack({ ...swipe, tell: 0.26, hits: [0.26], recover: 0.5 });
      this.f.combat.monsterSays(mon, 'Grr! Enough!', true);
    }
  }

  /** The hero gets hit (or ducks, jumps it, blocks it, parries it...). */
  private hitHero(damage: number, height: Height, dir: number, opts: { unblockable?: boolean; push?: number; ranged?: boolean } = {}) {
    const h = this.h, f = this.f, cb = f.combat, mon = this.monster;
    if (this.phase !== 'fight' || f.ctx.run.hp <= 0) return;
    if (h.inv > 0) { this.pow(h.x, 1.6, 'WHOOSH', '#ffffff', 0.7); return; }
    if (height === 'low' && h.y > 0.25) return;
    if (height === 'high' && h.crouch && !h.air) { this.pow(h.x, 1.0, 'DUCK!', '#ffffff', 0.6); return; }
    const canBlock = h.block && !h.air && !opts.unblockable && (height === 'low' ? h.crouch : height === 'overhead' ? !h.crouch : true);
    if (canBlock) {
      if (this.t - h.blockStart < PARRY.window) {
        if (!opts.ranged && Math.abs(this.m.x - h.x) < 2.5) { this.setM('stun', PARRY.stun); this.m.attack = null; this.hideMarker(); }
        cb.stamina = Math.min(STAMINA.max, cb.stamina + 15);
        this.pow(h.x, 1.7, 'PARRY!', '#7fe0ff', 1.1);
        if (Math.random() < 0.4) f.say(f.line('parry', {}, ['Ha!']));
        SFX.parry();
        f.shakeBy(0.2);
        return;
      }
      const through = damage * this.cls.block;
      cb.stamina -= STAMINA.blockHit * damage;
      cb.staminaWait = STAMINA.delay;
      this.pow(h.x, 1.5, 'CLANG!', '#d0d8e0', 0.8);
      SFX.block();
      h.vx = dir * 2.5;
      if (cb.stamina <= 0) {
        cb.stamina = 0;
        h.block = false;
        h.hurtT = 0.6;
        f.say(f.line('whoa', {}, ['Whoa!']));
      }
      if (through > 0.05) cb.damageHero(through, dir, 0, false);
      return;
    }
    // Ouch.
    cb.damageHero(damage, dir, 0, false);
    f.heroRig.flinch(1);
    this.pow(h.x, 1.6, pickOf(['OUCH!', 'OOF!', 'YOW!']), '#ff5a4a', 0.9);
    SFX.hurt();
    f.shakeBy(0.3);
    h.act = null;
    h.block = false;
    h.vx = dir * (2.5 + (opts.push ?? 0) * 3);
    if (damage >= 2) {
      // Big hits knock you flat.
      h.downT = 0.75;
      h.vy = 2.5;
      h.air = true;
    } else h.hurtT = 0.35;
    if (Math.random() < 0.2) this.f.combat.monsterSays(mon, pickOf(mon.def.lines.taunt));
  }

  // ---------- the monster ----------

  private setM(s: MonState, stateFor = 0) {
    this.m.state = s;
    this.m.t = 0;
    this.m.stateFor = stateFor;
  }

  private tell() {
    return (this.m.attack?.tell ?? 0) * AGGRESSION[this.f.ctx.run.difficulty].tell;
  }

  /** When the hero starts a swing, the monster may raise its guard (more often on harder levels). */
  private monsterSeesAttack() {
    const m = this.m;
    if (m.state !== 'neutral' || Math.abs(m.x - this.h.x) > 2.6) return;
    const chance = { easy: 0.08, medium: 0.22, hard: 0.35 }[this.f.ctx.run.difficulty];
    if (Math.random() < chance) this.setM('guard', 0.55);
  }

  private pickAttack(d: number) {
    const mon = this.monster;
    const options = mon.def.attacks.filter((a) => a.from <= mon.appearance && d >= a.range[0] - 0.2 && d <= a.range[1] + 0.3);
    if (!options.length) return null;
    const total = options.reduce((s, a) => s + (a.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const a of options) if ((r -= a.weight ?? 1) <= 0) return a;
    return options[0];
  }

  private beginAttack(a: MonsterAttack, tellScale = 1) {
    const m = this.m;
    m.attack = tellScale === 1 ? a : { ...a, tell: a.tell * tellScale, hits: a.hits.map((h) => h - a.tell * (1 - tellScale)) };
    m.hitIndex = 0;
    m.sub = 0;
    m.subT = 0;
    m.dashHit = false;
    m.lockX = this.h.x;
    this.monster.rig.move = a.id;
    this.setM('attack');
    if (a.kind === 'leap') this.f.combat.monsterSays(this.monster, pickOf(['Hup!', 'From above!', 'Incoming!']), true);
    if (a.kind === 'dash' && a.wallStun) this.f.combat.monsterSays(this.monster, 'CHAAARGE!', true);
  }

  private showMarker(x: number, size = 1) {
    this.marker.visible = true;
    this.marker.position.set(x, 0.03, this.lineZ);
    this.marker.scale.setScalar(size * (1 + Math.sin(this.t * 18) * 0.08));
  }

  private hideMarker() {
    this.marker.visible = false;
  }

  private updateMonster(dt: number) {
    const m = this.m, h = this.h, mon = this.monster, def = mon.def;
    m.t += dt;
    m.cool -= dt;
    const tune = AGGRESSION[this.f.ctx.run.difficulty];
    const d = Math.abs(h.x - m.x);
    const toHero = Math.sign(h.x - m.x) || m.face;
    // It turns to face you, slowly if it's a big armoured lump.
    if (m.state === 'neutral' || m.state === 'guard') {
      if (toHero !== m.face) {
        m.turnT += dt;
        if (m.turnT > (def.armor !== undefined ? 0.7 : 0.2)) { m.face = toHero; m.turnT = 0; }
      } else m.turnT = 0;
    }
    // Knock-back slides, and gravity for anything airborne.
    m.vx = damp(m.vx, 0, 6, dt);
    if (m.state !== 'attack' || m.attack?.kind !== 'leap') {
      if (m.y > 0 || m.vy > 0) {
        m.vy -= GRAVITY * dt;
        m.y = Math.max(0, m.y + m.vy * dt);
        if (m.y === 0) m.vy = 0;
      }
    }
    m.x += m.vx * dt;

    switch (m.state) {
      case 'enter':
        if (m.t > 1.2) { this.setM('neutral'); m.cool = 0.5; }
        break;
      case 'neutral': {
        // Gribbles' rats.
        if (def.minions && mon.appearance >= 3) {
          m.summonT -= dt;
          if (m.summonT <= 0 && this.rats.filter((r) => r.dead === 0).length < 2) {
            m.summonT = def.minions.every;
            SFX.monster('whistle', 1, false);
            this.f.combat.monsterSays(mon, 'Come, my pretties!', true);
            this.spawnRat(this.minX - 0.3, 1);
            this.spawnRat(this.maxX + 0.3, -1);
          }
        }
        if (m.cool <= 0) {
          const a = this.pickAttack(d);
          if (a) { this.beginAttack(a); break; }
        }
        m.planT -= dt;
        if (m.planT <= 0) {
          m.planT = 0.5 + Math.random() * 0.9;
          const melee = def.attacks.find((a) => a.kind === 'melee');
          const want = (melee?.reach ?? 1.2) * 0.85;
          m.plan = d > want + 0.6 ? (Math.random() < 0.8 ? 'close' : 'wait') : d < want - 0.3 ? 'back' : Math.random() < 0.5 ? 'wait' : Math.random() < 0.5 ? 'back' : 'close';
        }
        const speed = m.plan === 'close' ? def.walk : m.plan === 'back' ? -def.walk * 0.8 : 0;
        m.x += toHero * speed * dt;
        mon.rig.move = 'idle';
        break;
      }
      case 'guard':
        if (m.t > m.stateFor) this.setM('neutral');
        break;
      case 'attack':
        this.updateAttack(dt);
        if ((m.state as MonState) === 'recover') m.cool = (0.9 + Math.random() * 0.9) * tune.cooldown;
        break;
      case 'recover':
        if (m.t > (m.attack?.recover ?? 0.6)) { this.setM('neutral'); m.plan = 'back'; m.planT = 0.5; }
        break;
      case 'hurt':
      case 'stun':
        if (m.t > m.stateFor) this.setM('neutral');
        break;
      case 'down':
        if (m.t > m.stateFor && m.y === 0) this.setM('neutral');
        break;
      case 'flee': {
        // Runs off the side of the screen and is gone.
        m.x += m.face * def.run * 1.2 * dt;
        if (m.x < this.minX - 0.2 || m.x > this.maxX + 0.2 || m.t > 2) {
          mon.vanish();
          this.pow(m.x, 1.2, 'POOF!', '#ffffff', 0.9);
          this.finish('fled');
        }
        return;
      }
      case 'dead':
        if (m.t > 2.2) this.finish('won');
        return;
    }
    if (!m.hidden) m.x = clamp(m.x, this.minX, this.maxX);
  }

  private updateAttack(dt: number) {
    const m = this.m, h = this.h, a = m.attack!;
    const tell = this.tell();
    const shift = tell - a.tell;
    const dmg = a.damage * AGGRESSION[this.f.ctx.run.difficulty].damage;
    const height: Height = a.height ?? 'mid';
    const inFront = (reach: number) => {
      const dx = (h.x - m.x) * m.face;
      return (a.spin ? Math.abs(h.x - m.x) : dx) < reach + HERO_R && (a.spin || dx > -0.3);
    };
    const done = () => { this.hideMarker(); m.hidden = false; this.setM('recover'); };
    if (m.t < tell) {
      if (m.t < tell * 0.7) m.lockX = h.x;
      if (a.kind === 'leap') this.showMarker(m.lockX, a.reach / 0.75);
      return;
    }
    switch (a.kind) {
      case 'melee': {
        while (m.hitIndex < a.hits.length && m.t >= a.hits[m.hitIndex] + shift) {
          SFX.monster(a.id === 'bite' || a.id === 'tongue' ? 'bite' : a.id === 'slam' ? 'land' : 'swipe', 1, false);
          if (a.id === 'slam') this.f.shakeBy(0.3);
          m.x += m.face * 0.15;
          if (inFront(a.reach)) this.hitHero(dmg, height, m.face, { push: a.push, unblockable: a.unblockable });
          m.hitIndex++;
        }
        if (m.hitIndex >= a.hits.length && m.t >= a.hits[a.hits.length - 1] + shift + 0.15) done();
        return;
      }
      case 'dash': {
        const t = m.t - tell;
        if (t < (a.duration ?? 0.35)) {
          const before = m.x;
          m.x = clamp(m.x + m.face * (a.speed ?? 6.5) * dt, this.minX, this.maxX);
          if (a.wallStun && Math.abs(m.x - before) < (a.speed ?? 8) * dt * 0.3 && t > 0.08) {
            SFX.monster('land', 1, false);
            this.f.shakeBy(0.45);
            this.pow(m.x, 1.5, 'BONK!', '#ffd23f', 1.1);
            this.f.combat.monsterSays(this.monster, pickOf(['Ow, my horn...', 'Who put a wall there?', 'Stars... pretty...']));
            this.setM('stun', a.wallStun);
            m.attack = null;
            return;
          }
          if (!m.dashHit && Math.abs(h.x - m.x) < a.reach + HERO_R) {
            m.dashHit = true;
            this.hitHero(dmg, height, m.face, { push: a.push });
          }
          return;
        }
        done();
        return;
      }
      case 'leap': {
        const t0 = tell, t1 = a.hits[0] + shift;
        const k = Math.min(1, (m.t - t0) / (t1 - t0));
        this.showMarker(m.lockX, a.reach / 0.75);
        if (k < 1) {
          m.x = damp(m.x, m.lockX, 5, dt);
          m.y = Math.sin(k * Math.PI) * (a.jump ?? 1.6);
          return;
        }
        if (m.hitIndex === 0) {
          m.hitIndex = 1;
          m.y = 0;
          SFX.monster('land', 1, false);
          this.f.shakeBy(0.35);
          if (Math.abs(h.x - m.x) < a.reach + HERO_R) this.hitHero(dmg, height, Math.sign(h.x - m.x) || m.face);
        }
        if (m.t >= t1 + 0.15) done();
        return;
      }
      case 'throw': {
        while (m.hitIndex < a.hits.length && m.t >= a.hits[m.hitIndex] + shift) {
          this.throwThings(a, dmg);
          m.hitIndex++;
        }
        if (m.t >= a.hits[a.hits.length - 1] + shift + 0.2) done();
        return;
      }
      case 'burrow': {
        // Dives under the floorboards, tunnels under you (watch the cracks), bursts up.
        m.subT += dt;
        if (m.sub === 0) {
          m.sub = 1;
          m.subT = 0;
          m.hidden = true;
          this.f.combat.smoke(m.x, this.lineZ);
          this.pow(m.x, 0.8, 'KRRSSH', '#c8a070', 0.9);
          SFX.monster('land', 1, false);
        } else if (m.sub === 1) {
          const dx = h.x - m.x;
          m.x += Math.sign(dx) * Math.min(Math.abs(dx), (a.speed ?? 3) * dt);
          this.f.combat.dirt(m.x, this.lineZ);
          if (Math.abs(dx) < 0.3 || m.subT > (a.duration ?? 2.5)) { m.sub = 2; m.subT = 0; m.lockX = m.x; }
        } else if (m.sub === 2) {
          this.showMarker(m.lockX, a.reach / 0.75);
          this.f.combat.dirt(m.x, this.lineZ);
          if (m.subT > 0.6 * AGGRESSION[this.f.ctx.run.difficulty].tell) {
            m.sub = 3;
            m.subT = 0;
            m.hidden = false;
            this.hideMarker();
            this.f.shakeBy(0.5);
            this.pow(m.x, 1.2, 'KA-BLAM!', '#ff9a3a', 1.2);
            this.f.combat.smoke(m.x, this.lineZ);
            m.vy = 4;
            m.y = 0.05;
            if (Math.abs(h.x - m.x) < a.reach + HERO_R) this.hitHero(dmg, 'mid', Math.sign(h.x - m.x) || 1, { unblockable: true });
          }
        } else if (m.subT > 0.5) done();
        return;
      }
      case 'vanish':
      case 'teleport': {
        // Fade out (a shimmer or a puff), then appear on your other side and strike.
        m.subT += dt;
        if (m.sub === 0) {
          m.sub = 1;
          m.subT = 0;
          m.hidden = true;
          if (a.kind === 'teleport') { this.f.combat.smoke(m.x, this.lineZ); SFX.monster('poof', 1, false); }
          else this.pow(m.x, 1.3, 'fsssht', '#a0e0a0', 0.7);
        }
        const wait = a.kind === 'teleport' ? 0.45 : (a.hide ?? 3) * 0.5;
        if (a.kind === 'vanish') {
          m.x = damp(m.x, h.x - h.face * 1.1, 1.5, dt);
          this.f.combat.shimmer(m.x, this.lineZ);
        }
        if (m.subT > wait) {
          m.x = clamp(h.x - h.face * 1.1, this.minX, this.maxX);
          if (Math.abs(m.x - h.x) < 0.6) m.x = clamp(h.x + h.face * 1.1, this.minX, this.maxX);
          m.face = Math.sign(h.x - m.x) || m.face;
          m.hidden = false;
          if (a.kind === 'teleport') this.f.combat.smoke(m.x, this.lineZ);
          this.f.combat.monsterSays(this.monster, pickOf(['Behind you.', 'Boo.', 'Peekaboo!']), true);
          const next = this.monster.def.attacks.find((x) => x.id === a.follow);
          if (next) this.beginAttack(next, 0.6);
          else done();
        }
        return;
      }
    }
  }

  private throwThings(a: MonsterAttack, dmg: number) {
    const m = this.m, h = this.h, p = a.projectile!;
    for (let i = 0; i < p.count; i++) {
      const mesh = makeThrown(p.kind);
      this.f.group.add(mesh);
      if (p.kind === 'blade') {
        // Spinning blades fly across at head height and come back: duck!
        const delay = i * 0.25;
        this.shots.push({ kind: 'blade', mine: false, x: m.x, y: 1.3, vx: m.face * p.speed, sx: m.x, tx: m.x + m.face * 6, t: -delay, time: 6 / p.speed, damage: dmg, mesh, marker: null });
        continue;
      }
      // Lobbed: lands where you are (a ring shows where).
      const tx = clamp(h.x + (Math.random() - 0.5) * p.spread * 1.5, this.minX, this.maxX);
      const marker = new THREE.Mesh(new THREE.RingGeometry(p.kind === 'crate' ? 0.6 : 0.42, p.kind === 'crate' ? 0.82 : 0.58, 24), glow(p.kind === 'crate' ? 0xff3020 : 0x60ff40, 1.5));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(tx, 0.03, this.lineZ);
      this.f.group.add(marker);
      this.shots.push({ kind: p.kind, mine: false, x: m.x, y: 1.2, vx: 0, sx: m.x, tx, t: 0, time: Math.max(0.5, Math.abs(tx - m.x) / p.speed), damage: dmg, mesh, marker });
    }
    SFX.whoosh(p.kind === 'crate');
  }

  private spawnRat(x: number, dir: number) {
    const rig = buildRat();
    unclipped(rig.root);
    this.f.group.add(rig.root);
    this.rats.push({ rig, x, dir, t: 0, dead: 0, bit: false });
  }

  private updateShots(dt: number) {
    const h = this.h, m = this.m, f = this.f;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      let gone = false;
      if (s.mine) {
        s.x += s.vx * dt;
        if (s.kind === 'blast') f.particles.burst({ x: s.x, y: s.y, z: this.lineZ, count: 1, color: 0xb070ff, intensity: 3, speed: 0.3, up: 0.3, size: 0.07, life: 0.4, gravity: 0 });
        if (!m.hidden && m.state !== 'dead' && m.state !== 'flee' && Math.abs(s.x - m.x) < this.monsterR() + 0.15 && s.y > m.y && s.y < m.y + 1.8) {
          this.hitMonster({ damage: s.damage, heavy: s.kind === 'blast', height: 'mid', push: s.kind === 'blast' ? 0.5 : 0.15, stun: s.kind === 'blast' ? 0.35 : 0 }, Math.sign(s.vx));
          this.pow(s.x, 1.2, s.kind === 'blast' ? 'ZAP!' : 'THUNK!', s.kind === 'blast' ? '#c9a0ff' : '#ffd23f', 0.9);
          gone = true;
        }
        if (s.x < this.minX - 0.5 || s.x > this.maxX + 0.5) gone = true;
      } else if (s.kind === 'blade') {
        if (s.t < 0) { s.mesh.visible = false; continue; }
        s.mesh.visible = true;
        const k = s.t / s.time;
        if (!s.returning && k >= 1) { s.returning = true; s.t = 0; s.sx = s.x; s.hit = false; }
        if (s.returning) {
          const kk = Math.min(1, s.t / s.time);
          s.x = s.sx + (m.x - s.sx) * kk;
          if (kk >= 1) gone = true;
        } else s.x = clamp(s.sx + (s.tx - s.sx) * k, this.minX - 0.5, this.maxX + 0.5);
        s.mesh.rotation.y += dt * 25;
        if (!s.hit && Math.abs(s.x - h.x) < 0.4) {
          s.hit = true;
          this.hitHero(s.damage, 'high', Math.sign(h.x - s.x) || 1, { ranged: true });
        }
      } else {
        const k = Math.min(1, s.t / s.time);
        s.x = s.sx + (s.tx - s.sx) * k;
        s.y = 1.2 * (1 - k) + Math.sin(k * Math.PI) * (s.kind === 'crate' ? 2.2 : 1.3);
        s.mesh.rotation.x += dt * (s.kind === 'crate' ? 6 : 0);
        if (s.marker) s.marker.scale.setScalar(1 + Math.sin(s.t * 18) * 0.08);
        if (k >= 1) {
          gone = true;
          const r = s.kind === 'crate' ? 0.85 : 0.55;
          if (Math.abs(h.x - s.x) < r + HERO_R && h.y < 0.8) this.hitHero(s.damage, 'overhead', Math.sign(h.x - s.x) || 1, { ranged: true, push: s.kind === 'crate' ? 0.5 : 0 });
          if (s.kind === 'crate') {
            SFX.smash();
            f.shakeBy(0.3);
            this.pow(s.x, 1, 'CRASH!', '#ffd23f', 1);
            f.particles.burst({ x: s.x, y: 0.4, z: this.lineZ, count: 24, color: 0xa07a4a, speed: 4, up: 4, size: 0.13, life: 1.1 });
          } else {
            SFX.acid();
            this.pow(s.x, 0.8, 'SPLOTCH', '#80ff60', 0.8);
            this.addPuddle(s.x);
          }
        }
      }
      s.mesh.position.set(s.x, s.y, this.lineZ);
      if (gone) {
        s.mesh.removeFromParent();
        s.marker?.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
    // Acid burns while you stand in it (jump over it!).
    this.puddleTick -= dt;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.t -= dt;
      (q.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, q.t);
      if (q.t <= 0) { q.mesh.removeFromParent(); this.puddles.splice(i, 1); continue; }
      if (this.puddleTick <= 0 && Math.abs(h.x - q.x) < 0.6 && h.y < 0.1 && !h.dash) {
        this.puddleTick = 0.5;
        f.combat.damageHero(0.5, 0, 0, false);
        this.pow(h.x, 1.2, 'HSSS!', '#80ff60', 0.7);
        SFX.acid();
      }
    }
    if (this.puddleTick < 0) this.puddleTick = 0;
    // Rats scurry in from the sides and nip your ankles (jump them or squash them).
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const r = this.rats[i];
      r.t += dt;
      if (r.dead > 0) {
        r.dead += dt;
        r.rig.animate(dt, 'dead', 0, r.dead, 0);
        if (r.dead > 1) { r.rig.root.removeFromParent(); this.rats.splice(i, 1); }
        continue;
      }
      const dx = h.x - r.x;
      r.dir = Math.sign(dx) || r.dir;
      if (Math.abs(dx) > 0.45) r.x += r.dir * 3.2 * dt;
      else if (!r.bit) {
        r.bit = true;
        SFX.monster('bite', 0.6, true);
        this.hitHero(0.5, 'low', r.dir, {});
        setTimeout(() => (r.bit = false), 900);
      }
      r.rig.root.position.set(r.x, 0, this.lineZ + 0.15);
      r.rig.root.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      r.rig.animate(dt, Math.abs(dx) > 0.45 ? 'run' : 'tell', 1, r.t, 0.5);
    }
  }

  private addPuddle(x: number) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60d030).multiplyScalar(1.3), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025, this.lineZ);
    this.f.group.add(mesh);
    this.puddles.push({ x, t: 4, mesh });
  }

  private pow(x: number, y: number, text: string, color: string, size = 1) {
    this.f.ctx.bubbles.pow(v.set(x, y, this.lineZ), text, color, size);
  }

  private finish(result: 'won' | 'fled' | 'lost') {
    if (this.phase === 'won' || this.phase === 'fled' || this.phase === 'lost') return;
    this.phase = result;
    this.endT = 0;
    this.hideMarker();
    const hud = this.f.ctx.hud;
    if (result === 'won') { hud.banner('K.O.!', `${this.monster.name} is done for`, 2); SFX.joy(); }
    else if (result === 'fled') hud.banner('IT RAN AWAY!', 'It\'ll be back...', 2);
    if (result !== 'lost') setTimeout(() => this.f.say(this.f.line(result === 'won' ? 'fightWin' : 'fightFled', {}, ['Phew.'])), 2300);
  }

  // ---------- each frame ----------

  private lastControls: HeroControls = { moveX: 0, moveZ: 0, interact: false, light: false, heavy: false, block: false, dodge: false, special: false, pause: false };

  /** Returns false once the fight scene is over. */
  update(dt: number, c: HeroControls) {
    this.t += dt;
    if (this.hitPause > 0) { this.hitPause -= dt; dt *= 0.15; }
    this.lastControls = c;
    const f = this.f;
    if (f.ctx.run.hp <= 0 && this.phase === 'fight') this.phase = 'lost';
    if (this.phase === 'intro') {
      if (this.t > 1.1) this.phase = 'fight';
    } else if (this.phase === 'fight') {
      this.heroControl(c);
      this.updateHero(dt);
      this.updateMonster(dt);
    } else {
      // The fight's over: let the dust settle, then back to exploring.
      this.endT += dt;
      this.h.act = null;
      this.updateHero(dt);
      if (this.m.state === 'dead') this.m.t += dt;
      if (this.phase !== 'lost' && this.endT > 1.8) return false;
    }
    this.updateShots(dt);
    const cb = f.combat;
    cb.specialCool = Math.max(0, cb.specialCool - dt);
    const a = this.h.act;
    this.trailOn = !!a && a.move.kind === undefined && a.t > a.move.hit - 0.1 && a.t < a.move.hit + 0.08;
    // Keep the floor's idea of where the hero is up to date.
    f.hero.x = this.h.x;
    f.hero.z = this.lineZ;
    f.hero.yaw = this.h.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    return true;
  }

  get trailRecording() {
    return this.trailOn;
  }

  /** Pose the fighters and place the camera at the side of the stage. */
  render(dt: number, camera: THREE.PerspectiveCamera) {
    const h = this.h, m = this.m, f = this.f, rig = f.heroRig;
    // Turned a little toward the camera, so we see faces, like in the arcade games.
    const yawOf = (face: number) => (face > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4);
    rig.root.position.set(h.x, h.y, this.lineZ);
    rig.root.rotation.y = yawOf(h.face);
    let pose: Pose = 'idle', p = 0, hit = 0.35;
    const speed = Math.min(1, Math.abs(h.vx) / 2.9);
    if (f.ctx.run.hp <= 0) pose = 'dead';
    else if (h.downT > 0) pose = 'down';
    else if (h.hurtT > 0) pose = 'hurt';
    else if (h.dash) { pose = 'dodge'; p = h.dash.t / (h.dash.roll ? 0.45 : 0.3); }
    else if (h.act) { pose = h.act.move.pose; p = h.act.t / h.act.move.total; hit = h.act.move.hit / h.act.move.total; }
    else if (h.air) pose = 'jump';
    else if (h.block) pose = h.crouch ? 'crouchblock' : 'block';
    else if (h.crouch) pose = 'crouch';
    else if (this.phase === 'won' && this.endT > 0.4) pose = 'cheer';
    else pose = speed > 0.1 ? 'walk' : 'idle';
    if (pose !== this.lastPose) { this.poseT = 0; this.lastPose = pose; }
    this.poseT += dt;
    rig.animate(this.hitPause > 0 ? dt * 0.15 : dt, pose, { speed, stride: Math.abs(h.vx) * dt, turn: 0 }, this.poseT, p, hit);

    // The monster.
    let mp: MonsterPose = 'idle', mpp = 0;
    switch (m.state) {
      case 'enter': mp = 'idle'; break;
      case 'neutral': mp = m.plan !== 'wait' ? 'walk' : 'idle'; break;
      case 'guard': mp = 'recover'; break;
      case 'attack': {
        const tell = this.tell();
        if (m.t < tell) { mp = 'tell'; mpp = m.t / tell; }
        else mp = m.attack?.kind === 'leap' && m.y > 0.05 ? 'tell' : 'strike';
        break;
      }
      case 'recover': mp = 'recover'; break;
      case 'hurt': mp = 'hurt'; break;
      case 'stun': mp = 'stun'; break;
      case 'down': mp = 'hurt'; break;
      case 'flee': mp = 'flee'; break;
      case 'dead': mp = 'dead'; break;
    }
    const mt = m.state === 'dead' || m.state === 'stun' || m.state === 'hurt' ? m.t : this.t;
    this.monster.display(dt, m.x, m.y, this.lineZ, m.state === 'flee' ? (m.face > 0 ? Math.PI / 2 : -Math.PI / 2) : yawOf(m.face), mp, m.state === 'neutral' && m.plan !== 'wait' ? 0.5 : m.state === 'flee' ? 1 : 0, mt, mpp, !m.hidden);
    if (m.state === 'guard') this.monster.rig.move = 'shove';

    // Camera: from the side, framing both fighters, coming in from the top-down view at the start.
    const dist = clamp(Math.abs(h.x - m.x) * 0.75 + 4.2, 4.8, 7.5);
    // Keep the view inside the room (no peeking past its walls into the dark outside).
    const halfView = dist * Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.aspect * 0.85;
    const lo = this.minX - 0.55 + halfView, hi = this.maxX + 0.55 - halfView;
    const mid = (h.x + clamp(m.x, this.minX, this.maxX)) / 2;
    const tx = lo < hi ? clamp(mid, lo, hi) : (this.minX + this.maxX) / 2;
    const want = v.set(tx, 1.7 + dist * 0.07, this.lineZ + dist);
    const look = new THREE.Vector3(tx, 0.85, this.lineZ);
    const k = this.phase === 'intro' ? Math.min(1, this.t / 0.9) : 1;
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(this.camFrom, want, e);
    this.camLook.lerpVectors(this.lookFrom, look, e);
    if (k >= 1) {
      camera.position.copy(want);
      this.camLook.copy(look);
    }
    camera.lookAt(this.camLook);
    // Everything south of the fight line is cut away for the side view.
    CUT_Z.constant = damp(CUT_Z.constant, this.lineZ + 0.7, 6, dt);
  }

  /** Put the house back the way it was. */
  dispose() {
    const f = this.f;
    for (const p of this.hidden) p.model.group.visible = true;
    for (const s of this.shots) { s.mesh.removeFromParent(); s.marker?.removeFromParent(); }
    for (const q of this.puddles) q.mesh.removeFromParent();
    for (const r of this.rats) r.rig.root.removeFromParent();
    this.marker.removeFromParent();
    this.monster.inDuel = false;
    f.camera.getWorldPosition(v);
    f.resumeCamera(v);
  }

  // ---------- a robot player, for the test tools ----------

  /** Fights like a careful player: blocks or jumps the wind-ups, hits back when it's open. */
  botControls(): HeroControls {
    const h = this.h, m = this.m;
    const c: HeroControls = { moveX: 0, moveZ: 0, interact: false, light: false, heavy: false, block: false, dodge: false, special: false, pause: false };
    if (this.phase !== 'fight') return c;
    const d = Math.abs(m.x - h.x);
    const toward = Math.sign(m.x - h.x) || h.face;
    const a = m.attack;
    if (m.state === 'attack' && a) {
      const shift = this.tell() - a.tell;
      const next = a.hits[m.hitIndex];
      const tth = next === undefined ? 0 : next + shift - m.t;
      const height = a.height ?? 'mid';
      if (a.kind === 'burrow' || a.kind === 'leap' || (a.kind === 'throw' && a.projectile?.kind !== 'blade')) {
        c.moveX = -toward; // get away from the marked spot
        if (Math.abs(this.marker.position.x - h.x) < 0.5 && this.marker.visible) c.dodge = true;
        return c;
      }
      if (a.kind === 'dash' && a.wallStun) { if (tth < 0.25) c.interact = true; return c; }
      if (tth < 0.35 && d < a.reach + 1.2) {
        if (height === 'low') { if (tth < 0.2) c.interact = true; }
        else if (height === 'high') c.moveZ = 1;
        else c.block = true;
        if (height === 'overhead') c.moveZ = 0;
      }
      return c;
    }
    const open = m.state === 'recover' || m.state === 'stun' || m.state === 'down';
    const reach = this.moves().combo[0].reach + this.monsterR();
    if (open && d < reach + 0.2) {
      if (m.state === 'stun' && this.f.combat.stamina > 40) c.heavy = true;
      else c.light = true;
      return c;
    }
    // Specials: blasts from afar, bash/slam/smoke when it's close and open.
    const sp = this.cls.special.kind, cb = this.f.combat;
    if (sp === 'blast' && cb.charges > 0 && d > 2.2 && Math.random() < 0.05) { c.special = true; return c; }
    if (sp !== 'blast' && cb.specialCool <= 0 && open && d < 1.6) { c.special = true; return c; }
    if (open) { c.moveX = toward; return c; }
    if (m.state === 'guard' && d < reach + 0.3) { c.moveZ = 1; c.light = true; return c; }
    if (this.monster.def.armor !== undefined && d < 2.5 && Math.random() < 0.02) { c.moveX = toward; c.interact = true; return c; }
    const want = 2.0;
    c.moveX = d > want + 0.4 ? toward : d < want - 0.4 ? -toward : 0;
    return c;
  }
}

function makeBolt() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), toon(0x8a6a3a));
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  ink(g);
  return unclipped(g);
}

function makeBlast() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glow(0xb070ff, 3)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0xffffff, 4)));
  return g;
}

function makeThrown(kind: 'crate' | 'acid' | 'blade') {
  const g = new THREE.Group();
  if (kind === 'crate') {
    g.add(block(0.55, 0.55, 0.55, 0xa07a4a, 0, -0.275, 0));
  } else if (kind === 'acid') {
    const glob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glow(0x70f040, 1.6));
    glob.scale.set(1.3, 0.8, 1);
    g.add(glob);
  } else {
    const blade = new THREE.Shape();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      blade.lineTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
      blade.lineTo(Math.cos(a + 0.5) * 0.08, Math.sin(a + 0.5) * 0.08);
    }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: false }), toon(0xc8ccd4));
    m.rotation.x = -Math.PI / 2;
    g.add(m);
  }
  ink(g);
  return unclipped(g);
}
