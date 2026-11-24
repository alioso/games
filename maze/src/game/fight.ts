// The fight scene. Caught by the monster (or you go for it), the screen flashes and it's you and it,
// side on, in a little clearing of its own: walk, jump, duck, block, hit. With just a stick it's a
// hard fight; once the ruby's woken the wand, its magic (a bolt, or a big stunning blast) gives you
// the upper hand. The monster's attacks all show what's coming: its claw winds back before a swipe,
// the ring spins on its fingers before it's thrown (high: duck, low: jump), it rises before it slams
// down where its shadow is, and once it's hurt its eye flashes before orbs roll along the ground.
// Win and it bursts into smoke; lose and it's a heart gone.
import * as THREE from 'three';
import { Particles } from '@engine/particles';
import type { Theme } from '../data/mazes';
import type { Pose } from '../entities/heroModel';
import type { Walker } from '../entities/walker';
import type { MonsterModel } from '../entities/monsterModel';
import { canvasTex, flowersAt, leafTex, texMat, tuftsAt } from '../world/decor';
import { ball, cyl, glow, toon, toonOwn } from '../world/toon';
import type { PadInput } from './controls';
import { SFX } from './sounds';

/** Where the arena is (well away from the maze). */
const AX = -400;
const HALF = 6;
const GRAV = 16, JUMP = 6.2;

export const FIGHT = {
  heroHp: 100,
  monsterHp: 100,
  stick: 7,
  wand: 10,
  bolt: 13,
  blast: 32,
  /** How long holding magic charges a blast. */
  charge: 0.8,
  swipe: 18,
  ring: 15,
  slam: 22,
  orb: 14,
};

type MoveKind = 'hit' | 'bolt' | 'blast' | 'fizzle';
interface Act { kind: MoveKind; t: number; total: number; hitAt: number; done: boolean; combo: number }
type MonAttack = 'swipe' | 'ring' | 'slam' | 'orbs';
type MonState = 'enter' | 'neutral' | 'tell' | 'attack' | 'recover' | 'hurt' | 'stun' | 'dead';

interface Shot {
  kind: 'bolt' | 'blast' | 'ring' | 'orb';
  mine: boolean;
  x: number;
  y: number;
  vx: number;
  mesh: THREE.Object3D;
  t: number;
  /** The ring comes back. */
  back?: boolean;
  hit?: boolean;
}

export interface FightEvent { kind: 'pow'; text: string; x: number; y: number; color: string }

export class Fight {
  readonly group = new THREE.Group();
  phase: 'intro' | 'fight' | 'won' | 'lost' = 'intro';
  private t = 0;
  private endT = 0;
  readonly hero = { x: -2.5, y: 0, vy: 0, face: 1, crouch: false, block: false, act: null as Act | null, hurtT: 0, downT: 0, inv: 0, hp: FIGHT.heroHp, holdMagic: 0, combo: 0, comboT: 0, boltCool: 0 };
  readonly mon = { x: 2.5, y: 0, face: -1, hp: FIGHT.monsterHp, state: 'enter' as MonState, t: 0, attack: null as MonAttack | null, cool: 1.2, high: false, slamX: 0, hits: 0, stunFor: 0 };
  private shots: Shot[] = [];
  private sparks = new Particles(600, true);
  private smoke = new Particles(300);
  private shadow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  private hitPause = 0;
  private shake = 0;
  readonly events: FightEvent[] = [];
  private saved: { walker: THREE.Vector3; walkerYaw: number; mon: THREE.Vector3; monYaw: number; parent: THREE.Object3D | null; mparent: THREE.Object3D | null };

  constructor(private walker: Walker, private model: MonsterModel, theme: Theme, readonly youStarted: boolean) {
    this.saved = {
      walker: walker.root.position.clone(), walkerYaw: walker.yaw, mon: model.root.position.clone(), monYaw: model.root.rotation.y,
      parent: walker.root.parent, mparent: model.root.parent,
    };
    this.buildArena(theme);
    this.group.add(walker.root, model.root, this.sparks.mesh, this.smoke.mesh);
    // The shadow marking where a slam lands.
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x200818, transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.position.set(AX, 0.03, 0);
    this.group.add(this.shadow);
    model.root.visible = true;
    if (youStarted) {
      // You got the jump on it: it's reeling.
      this.mon.state = 'stun';
      this.mon.stunFor = 1.4;
      this.mon.x = 1.6;
    } else {
      this.hero.hurtT = 0.4;
    }
    SFX.fightStart();
  }

  /** A little stage that looks like where you are: hedges behind and at the sides, gravel, lanterns, the moon. */
  private buildArena(theme: Theme) {
    const g = this.group;
    void theme;
    const floor = canvasTex(null, 512, 128, (c) => {
      c.fillStyle = '#c8b48a';
      c.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = ['rgba(120,100,70,0.5)', 'rgba(255,250,230,0.5)', 'rgba(150,130,100,0.6)'][i % 3];
        c.beginPath(); c.arc(Math.random() * 512, Math.random() * 128, 1 + Math.random() * 2, 0, Math.PI * 2); c.fill();
      }
    }, false);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 6, 6).rotateX(-Math.PI / 2), toonOwn(0xffffff, 0, floor));
    ground.position.set(AX, 0, 0.5);
    ground.receiveShadow = true;
    g.add(ground);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), toon(0x3e6a30));
    grass.position.set(AX, -0.01, 0);
    g.add(grass);
    // Hedges: a long one behind, one at each end.
    const leaf = texMat('leaf', leafTex);
    const hedge = (w: number, d: number, x: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, 1.8, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 0.9, uv.getY(i) * 2);
      const m = new THREE.Mesh(geo, leaf);
      m.position.set(AX + x, 0.9, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      const n = Math.round(Math.max(w, d) / 0.5);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        const b = ball(0.34, toon([0x3e7e30, 0x4a9038, 0x356e2a][i % 3]), AX + x + (w > d ? u * w : 0), 1.8, z + (w > d ? 0 : u * d));
        b.scale.y = 0.6;
        g.add(b);
      }
    };
    hedge(HALF * 2 + 4, 0.9, 0, -1.6);
    hedge(0.9, 4, -HALF - 1.2, 0.4);
    hedge(0.9, 4, HALF + 1.2, 0.4);
    // Lanterns on posts along the back.
    for (const x of [-4, 0, 4]) {
      g.add(cyl(0.06, 0.07, 2.4, toon(0x6a4428), AX + x, 0, -1.0, 8));
      g.add(cyl(0.1, 0.1, 0.22, glow(0xffc060, 1.8), AX + x, 2.3, -0.92, 8));
      const l = new THREE.PointLight(0xffb050, 3, 6, 1.6);
      l.position.set(AX + x, 2.3, -0.6);
      g.add(l);
    }
    // The moon and a dark sky behind.
    const sky = canvasTex(null, 4, 128, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, '#0a0c24');
      grd.addColorStop(1, '#2a2a50');
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 128);
    }, false);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), new THREE.MeshBasicMaterial({ map: sky, fog: false }));
    back.position.set(AX, 10, -12);
    g.add(back);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), glow(0xfff4d0, 1.3));
    moon.position.set(AX + 5, 7, -11.5);
    g.add(moon);
    for (let i = 0; i < 40; i++) {
      const st = new THREE.Mesh(new THREE.CircleGeometry(0.04 + Math.random() * 0.05, 5), glow(0xffffff, 1.5));
      st.position.set(AX + (Math.random() - 0.5) * 40, 4 + Math.random() * 12, -11.8);
      g.add(st);
    }
    const fl: [number, number, number][] = [], tf: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) (i % 2 ? fl : tf).push([AX + (Math.random() - 0.5) * (HALF * 2 + 2), 0, -1.05 + Math.random() * 0.25]);
    g.add(flowersAt(fl), tuftsAt(tf));
    // Light: moonlight from the front-side, a soft sky.
    g.add(new THREE.HemisphereLight(0xb8c8ff, 0x3a4a2a, 1.4));
    const moonLight = new THREE.DirectionalLight(0xdde4ff, 2.2);
    moonLight.position.set(AX - 4, 8, 7);
    moonLight.target.position.set(AX, 0, 0);
    moonLight.castShadow = true;
    const sc = moonLight.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 8; sc.bottom = -4; sc.near = 1; sc.far = 30;
    moonLight.shadow.mapSize.set(1024, 1024);
    g.add(moonLight, moonLight.target);
  }

  private get powered() {
    return this.walker.powered;
  }

  /** Comic words where something happens. */
  private pow(x: number, y: number, text: string, color = '#fff') {
    this.events.push({ kind: 'pow', text, x: AX + x, y, color });
  }

  // ---------- you ----------

  private startAct(kind: MoveKind, combo = 0) {
    const h = this.hero;
    const total = kind === 'hit' ? (combo === 2 ? 0.55 : 0.4) : kind === 'blast' ? 0.6 : kind === 'bolt' ? 0.42 : 0.5;
    const hitAt = kind === 'hit' ? (combo === 2 ? 0.22 : 0.14) : 0.18;
    h.act = { kind, t: 0, total, hitAt, done: false, combo };
  }

  private heroControl(dt: number, input: PadInput) {
    const h = this.hero;
    if (h.downT > 0 || h.hurtT > 0) return;
    const busy = !!h.act;
    // Block (held), duck (down), jump (up, or the map button).
    h.block = input.b.sneak.down && !busy && h.y === 0;
    h.crouch = input.moveZ > 0.5 && h.y === 0 && !busy;
    if ((input.moveZ < -0.5 || input.b.map.pressed) && h.y === 0 && !h.crouch && !h.block && (!busy || h.act!.t > h.act!.total * 0.7)) {
      h.vy = JUMP;
      h.y = 0.001;
      SFX.jump();
    }
    // Walk (slower while blocking or ducking; you keep facing the monster).
    if (!h.crouch && (!busy || h.y > 0)) {
      const sp = h.block ? 1.2 : 3.2;
      h.x += input.moveX * sp * dt;
    }
    h.x = Math.max(-HALF, Math.min(HALF, h.x));
    h.face = this.mon.x >= h.x ? 1 : -1;
    // Hit: up to three in a row if you press again as one lands.
    h.comboT -= dt;
    if (input.b.action.pressed && !h.block) {
      if (!busy) {
        const combo = h.comboT > 0 ? (h.combo + 1) % 3 : 0;
        h.combo = combo;
        this.startAct('hit', combo);
      } else if (h.act!.kind === 'hit' && h.act!.t > h.act!.hitAt) {
        // Queue the next one.
        h.comboT = 0.35;
      }
    }
    // Magic: tap for a bolt, hold for a blast. A plain stick just fizzles.
    h.boltCool -= dt;
    if (input.b.magic.down && !busy) h.holdMagic += dt;
    if (input.b.magic.released && !busy) {
      if (!this.powered) this.startAct('fizzle');
      else if (h.holdMagic >= FIGHT.charge) this.startAct('blast');
      else if (h.boltCool <= 0) { this.startAct('bolt'); h.boltCool = 0.6; }
      h.holdMagic = 0;
    }
    if (!input.b.magic.down) h.holdMagic = 0;
    if (h.holdMagic > 0.25 && this.powered && Math.random() < dt * 30) {
      const tip = this.walker.tipWorld();
      this.sparks.burst({ x: tip.x, y: tip.y, z: tip.z, count: 1, color: h.holdMagic >= FIGHT.charge ? 0xffd040 : 0xff4060, intensity: 4, speed: 0.6, size: 0.05, life: 0.3, gravity: 0 });
    }
  }

  private updateHero(dt: number) {
    const h = this.hero;
    if (h.y > 0 || h.vy > 0) {
      h.vy -= GRAV * dt;
      h.y += h.vy * dt;
      if (h.y <= 0) { h.y = 0; h.vy = 0; }
    }
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.downT = Math.max(0, h.downT - dt);
    h.inv = Math.max(0, h.inv - dt);
    const a = h.act;
    if (a) {
      a.t += dt;
      if (!a.done && a.t >= a.hitAt) { a.done = true; this.resolve(a); }
      if (a.t >= a.total) {
        h.act = null;
        // Pressed again in time: the next hit of the combo.
        if (a.kind === 'hit' && h.comboT > 0 && a.combo < 2) { h.combo = a.combo + 1; this.startAct('hit', h.combo); h.comboT = 0.35; }
        else if (a.kind === 'hit') h.comboT = a.combo < 2 ? 0.3 : 0;
      }
    }
  }

  /** The moment your move lands (or flies). */
  private resolve(a: Act) {
    const h = this.hero, m = this.mon;
    const tip = this.walker.tipWorld();
    switch (a.kind) {
      case 'hit': {
        SFX.swish();
        const reach = 1.25, d = (m.x - h.x) * h.face;
        if (d > -0.2 && d < reach && Math.abs(h.y - m.y) < 1.4 && m.state !== 'dead') {
          const dmg = (this.powered ? FIGHT.wand : FIGHT.stick) * (a.combo === 2 ? 1.5 : 1);
          this.hitMonster(dmg, a.combo === 2 ? 0.6 : 0, a.combo === 2 ? 0.35 : 0.12);
          SFX.whack(this.powered);
          this.pow(m.x - h.face * 0.3, 1.6, a.combo === 2 ? (this.powered ? 'KA-ZAP!' : 'THWACK!') : this.powered ? 'ZAP!' : ['BONK!', 'WHAP!'][a.combo % 2], this.powered ? '#ff7090' : '#ffe080');
          if (this.powered) this.sparks.burst({ x: AX + m.x, y: 1.1, z: 0.1, count: 14, color: 0xff4060, intensity: 4, speed: 2.5, size: 0.05, life: 0.4, gravity: 2 });
        }
        break;
      }
      case 'bolt':
      case 'blast': {
        const big = a.kind === 'blast';
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(big ? 0.28 : 0.11, 0), glow(big ? 0xffd040 : 0xff3050, 3)));
        mesh.add(new THREE.Mesh(new THREE.SphereGeometry(big ? 0.4 : 0.17, 12, 8), new THREE.MeshBasicMaterial({ color: big ? 0xffa040 : 0xff6080, transparent: true, opacity: 0.35, toneMapped: false })));
        mesh.position.set(tip.x, tip.y, 0.1);
        this.group.add(mesh);
        this.shots.push({ kind: a.kind, mine: true, x: tip.x - AX, y: Math.max(0.6, tip.y), vx: h.face * (big ? 8 : 11), mesh, t: 0 });
        SFX.zap(big);
        break;
      }
      case 'fizzle':
        this.smoke.burst({ x: tip.x, y: tip.y, z: 0.1, count: 8, color: 0x8a8070, speed: 0.6, up: 0.6, size: 0.07, life: 0.7, gravity: -0.5 });
        this.pow(h.x + h.face * 0.4, 1.7, 'pfft...', '#c8c0b0');
        SFX.fizzle();
        break;
    }
  }

  private hitMonster(dmg: number, stun: number, push: number) {
    const m = this.mon;
    if (m.state === 'dead') return;
    m.hp = Math.max(0, m.hp - dmg);
    m.hits++;
    m.x += this.hero.face * push;
    m.x = Math.max(-HALF, Math.min(HALF, m.x));
    this.hitPause = 0.06;
    this.model.setEyeGlow(0);
    this.shadow.material.opacity = 0;
    if (m.hp <= 0) { this.setM('dead'); this.finish('won'); return; }
    if (stun > 0) { this.setM('stun'); m.stunFor = stun; }
    // Light hits don't stop an attack once it's going; they do stop a wind-up now and then.
    else if (m.state === 'tell' && Math.random() < 0.3) this.setM('hurt');
    else if (m.state === 'neutral' || m.state === 'recover') this.setM('hurt');
    SFX.monsterHurt();
  }

  private hitHero(dmg: number, from: number, opts: { blockable?: boolean; knock?: number } = {}) {
    const h = this.hero;
    if (h.inv > 0 || h.downT > 0 || this.phase !== 'fight') return false;
    const facing = Math.sign(from - h.x) === h.face || from === h.x;
    if (h.block && facing && opts.blockable !== false) {
      h.hp = Math.max(1, h.hp - dmg * 0.15);
      h.x -= h.face * 0.25;
      this.pow(h.x + h.face * 0.4, 1.5, 'BLOCKED!', '#a0d0ff');
      SFX.block();
      this.sparks.burst({ x: AX + h.x + h.face * 0.35, y: 1.0, z: 0.2, count: 10, color: 0xa0d0ff, intensity: 3, speed: 2, size: 0.04, life: 0.3, gravity: 0 });
      return true;
    }
    h.hp = Math.max(0, h.hp - dmg);
    h.act = null;
    h.holdMagic = 0;
    h.hurtT = 0.4;
    h.inv = 0.7;
    h.x -= Math.sign(from - h.x || 1) * (opts.knock ?? 0.6);
    h.x = Math.max(-HALF, Math.min(HALF, h.x));
    this.shake = 0.3;
    this.hitPause = 0.08;
    SFX.ouch(this.walker.character.voice);
    this.pow(h.x, 1.6, ['OOF!', 'OW!', 'YIKES!'][Math.floor(Math.random() * 3)], '#ff8070');
    if (h.hp <= 0) { h.downT = 99; this.finish('lost'); }
    return true;
  }

  // ---------- the monster ----------

  private setM(s: MonState) {
    this.mon.state = s;
    this.mon.t = 0;
  }

  /** Choose what to do next, by how far away you are (and how hurt it is). */
  private pickAttack(): MonAttack {
    const m = this.mon, d = Math.abs(this.hero.x - m.x);
    const hurt = m.hp < FIGHT.monsterHp * 0.5;
    const r = Math.random();
    if (hurt && r < 0.25) return 'orbs';
    if (d < 2.2) return r < 0.65 ? 'swipe' : 'slam';
    return r < 0.6 ? 'ring' : 'slam';
  }

  private updateMonster(dt: number) {
    const m = this.mon, h = this.hero;
    m.t += dt;
    const d = h.x - m.x;
    if (m.state !== 'dead' && m.state !== 'attack') m.face = d >= 0 ? 1 : -1;
    let handTarget: THREE.Vector3 | null = null;
    let lift = 0;
    switch (m.state) {
      case 'enter':
        if (m.t > 0.8) this.setM('neutral');
        break;
      case 'neutral': {
        // Drift to a good distance (close for a swipe, back for the ring), then attack.
        m.cool -= dt;
        const want = m.hp < FIGHT.monsterHp * 0.5 ? 2.8 : 1.7;
        const gap = Math.abs(d) - want;
        if (Math.abs(gap) > 0.3) m.x += Math.sign(d) * Math.sign(gap) * 1.6 * dt;
        if (m.cool <= 0) {
          m.attack = this.pickAttack();
          m.high = Math.random() < 0.5;
          if (m.attack === 'slam') m.slamX = h.x;
          this.setM('tell');
          SFX.tell(m.attack);
        }
        break;
      }
      case 'tell': {
        // The warning: claw wound back, ring spinning, rising up, or the eye flaring.
        const tellFor = m.attack === 'swipe' ? 0.55 : m.attack === 'ring' ? 0.7 : m.attack === 'slam' ? 0.8 : 0.75;
        if (m.attack === 'swipe') handTarget = new THREE.Vector3(0.6, 1.8, -0.6);
        if (m.attack === 'ring') { this.model.tingle = 1; handTarget = new THREE.Vector3(0.7, m.high ? 1.6 : 0.6, 0.3); }
        if (m.attack === 'slam') {
          lift = (m.t / tellFor) * 1.6;
          m.x += (m.slamX - m.x) * Math.min(1, dt * 3);
          this.shadow.position.x = AX + m.slamX;
          this.shadow.material.opacity = 0.25 + 0.4 * (m.t / tellFor);
        }
        if (m.attack === 'orbs') this.model.setEyeGlow(Math.min(1, m.t / tellFor));
        if (m.t >= tellFor) this.startMonsterAttack();
        break;
      }
      case 'attack':
        lift = this.monsterAttack(dt);
        handTarget = m.attack === 'swipe' ? new THREE.Vector3(0.2, 1.0, 1.4) : null;
        break;
      case 'recover':
        if (m.t > 0.5) { this.setM('neutral'); m.cool = 0.6 + Math.random() * 0.9; }
        break;
      case 'hurt':
        if (m.t > 0.3) { this.setM('neutral'); m.cool = Math.max(m.cool, 0.4); }
        break;
      case 'stun':
        handTarget = new THREE.Vector3(0.6, 0.5, 0.2);
        if (Math.random() < dt * 8) this.sparks.burst({ x: AX + m.x + Math.sin(m.t * 6) * 0.3, y: 2.0, z: Math.cos(m.t * 6) * 0.3, count: 1, color: 0xffe060, intensity: 3, speed: 0.2, size: 0.05, life: 0.4, gravity: 0 });
        if (m.t > m.stunFor) { this.setM('neutral'); m.cool = 0.5; }
        break;
      case 'dead':
        break;
    }
    m.x = Math.max(-HALF, Math.min(HALF, m.x));
    m.y = lift;
    if (m.state !== 'attack' && m.state !== 'tell') this.model.tingle = Math.max(0, this.model.tingle - dt * 2);
    this.model.handTarget = handTarget;
    this.model.handStiff = m.state === 'attack' ? 160 : 40;
  }

  private startMonsterAttack() {
    const m = this.mon;
    this.setM('attack');
    switch (m.attack) {
      case 'ring': {
        // Off it goes: the ring itself, spinning, high or low.
        this.model.ring.visible = false;
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 24), new THREE.MeshToonMaterial({ color: 0xf0c020, emissive: 0x806000 }));
        const y = m.high ? 1.25 : 0.3;
        mesh.position.set(AX + m.x, y, 0.1);
        this.group.add(mesh);
        this.shots.push({ kind: 'ring', mine: false, x: m.x + m.face * 0.5, y, vx: m.face * 7.5, mesh, t: 0 });
        SFX.ringThrow();
        break;
      }
      case 'orbs':
        for (let k = 0; k < 3; k++) {
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), glow(0xb060ff, 2.2));
          mesh.position.set(AX + m.x, 0.3, 0.1);
          mesh.visible = false;
          this.group.add(mesh);
          this.shots.push({ kind: 'orb', mine: false, x: m.x + m.face * 0.3, y: 0.3, vx: m.face * 4.2, mesh, t: -k * 0.55 });
        }
        SFX.orbs();
        break;
      case 'swipe':
        SFX.claw();
        break;
    }
  }

  /** The attack playing out; returns how high it's floating. */
  private monsterAttack(dt: number) {
    const m = this.mon, h = this.hero;
    let lift = 0;
    switch (m.attack) {
      case 'swipe':
        // The claw lunges forward: it hits if you're in front within reach.
        if (m.t > 0.08 && m.t < 0.22) {
          const d = (h.x - m.x) * m.face;
          if (d > -0.2 && d < 2.0 && h.y < 1.2) this.hitHero(FIGHT.swipe, m.x, { knock: 0.9 });
        }
        if (m.t > 0.45) this.setM('recover');
        break;
      case 'slam': {
        // Drops like a stone where its shadow was.
        const u = Math.min(1, m.t / 0.18);
        lift = 1.6 * (1 - u * u);
        if (m.t >= 0.18 && m.t - dt < 0.18) {
          this.shake = 0.5;
          SFX.slam();
          this.smoke.burst({ x: AX + m.x, y: 0.1, z: 0.1, count: 30, color: 0xb8a888, speed: 3, up: 0.6, size: 0.1, life: 0.6, gravity: 2 });
          this.pow(m.x, 0.8, 'KRUMP!', '#d0c0ff');
          if (Math.abs(h.x - m.x) < 0.95 && h.y < 0.5) this.hitHero(FIGHT.slam, m.x, { blockable: false, knock: 1.2 });
          this.shadow.material.opacity = 0;
        }
        if (m.t > 0.7) this.setM('recover');
        break;
      }
      case 'ring':
        // Waits for its ring to come back.
        if (!this.shots.some((s) => s.kind === 'ring')) { this.model.ring.visible = true; this.setM('recover'); }
        break;
      case 'orbs':
        this.model.setEyeGlow(Math.max(0, 1 - m.t));
        if (m.t > 1.4) this.setM('recover');
        break;
    }
    return lift;
  }

  // ---------- things flying ----------

  private updateShots(dt: number) {
    const h = this.hero, m = this.mon;
    for (const s of this.shots) {
      s.t += dt;
      if (s.t < 0) continue;
      s.mesh.visible = true;
      if (s.kind === 'ring') {
        // Out, then back to the hand.
        if (!s.back && (Math.abs(s.x - m.x) > 7 || s.x < -HALF - 0.5 || s.x > HALF + 0.5)) s.back = true;
        if (s.back) s.vx = Math.sign(m.x - s.x) * 8;
        s.mesh.rotation.y += dt * 20;
        s.mesh.rotation.x = 1.2;
        if (s.back && Math.abs(s.x - m.x) < 0.4) { s.hit = true; continue; }
      }
      if (s.kind === 'orb') s.mesh.rotation.z -= s.vx * dt * 3;
      s.x += s.vx * dt;
      s.mesh.position.set(AX + s.x, s.y + (s.kind === 'orb' ? Math.abs(Math.sin(s.t * 6)) * 0.12 : 0), 0.1);
      if (s.mine) {
        if (Math.random() < 0.6) this.sparks.burst({ x: AX + s.x, y: s.y, z: 0.1, count: 1, color: s.kind === 'blast' ? 0xffc040 : 0xff4060, intensity: 3, speed: 0.3, size: 0.05, life: 0.3, gravity: 0 });
        if (m.state !== 'dead' && Math.abs(s.x - m.x) < (s.kind === 'blast' ? 0.6 : 0.45) && Math.abs(s.y - (m.y + 1.0)) < 1.1) {
          s.hit = true;
          const big = s.kind === 'blast';
          this.hitMonster(big ? FIGHT.blast : FIGHT.bolt, big ? 1.6 : 0, big ? 1.2 : 0.3);
          this.sparks.burst({ x: AX + s.x, y: s.y, z: 0.1, count: big ? 50 : 18, color: big ? 0xffd040 : 0xff4060, intensity: 4, speed: big ? 4 : 2.5, size: 0.06, life: 0.6, gravity: 1 });
          this.pow(m.x, 1.9, big ? 'KA-BOOM!' : 'ZZAP!', big ? '#ffd040' : '#ff7090');
          if (big) this.shake = 0.4;
          SFX.zapHit(big);
        }
        if (Math.abs(s.x) > HALF + 2) s.hit = true;
      } else if (s.kind !== 'ring' || !s.back || Math.abs(s.x - h.x) > 0.01) {
        // Coming at you: duck a high ring, jump a low one or an orb, or block.
        const heroTop = h.crouch ? 0.7 : 1.35;
        const overlapX = Math.abs(s.x - h.x) < 0.35;
        const overlapY = s.y + 0.15 > h.y && s.y - 0.15 < h.y + heroTop;
        if (overlapX && overlapY && h.inv <= 0) {
          const blocked = this.hitHero(s.kind === 'ring' ? FIGHT.ring : FIGHT.orb, s.x - s.vx, { knock: 0.7 });
          if (s.kind === 'orb') s.hit = true;
          else if (blocked) s.back = true;
        }
      }
    }
    for (const s of this.shots.filter((x) => x.hit)) s.mesh.removeFromParent();
    this.shots = this.shots.filter((x) => !x.hit);
  }

  private finish(result: 'won' | 'lost') {
    this.phase = result;
    this.endT = 0;
    if (result === 'won') {
      SFX.monsterDie();
      this.model.root.visible = false;
      const m = this.mon;
      this.smoke.burst({ x: AX + m.x, y: 1.0, z: 0.1, count: 90, color: 0x2a2a34, speed: 3, up: 1.5, size: 0.2, life: 1.6, gravity: -1 });
      this.sparks.burst({ x: AX + m.x, y: 1.0, z: 0.1, count: 40, color: 0xf0c020, intensity: 3, speed: 4, size: 0.05, life: 1, gravity: 3 });
    } else {
      SFX.fail();
    }
  }

  /** True once it's over and it's time to go back to the maze. */
  get over() {
    return (this.phase === 'won' || this.phase === 'lost') && this.endT > 2.8;
  }

  /** Tools: something else at the controls (a test player). */
  bot: ((f: Fight) => PadInput) | null = null;

  update(dt: number, input: PadInput) {
    if (this.bot) input = this.bot(this);
    this.t += dt;
    if (this.hitPause > 0) { this.hitPause -= dt; return; }
    if (this.phase === 'intro') {
      if (this.t > 0.9) this.phase = 'fight';
    } else if (this.phase === 'fight') {
      this.heroControl(dt, input);
      this.updateMonster(dt);
      this.updateShots(dt);
    } else {
      this.endT += dt;
      this.updateShots(dt);
    }
    this.updateHero(dt);
  }

  /** Put everyone where they are, pose them, and work the camera. */
  render(dt: number, camera: THREE.PerspectiveCamera) {
    const h = this.hero, m = this.mon;
    // You.
    this.walker.root.position.set(AX + h.x, h.y, 0);
    this.walker.yaw = h.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    let pose: Pose = 'idle', p = 0, hitAt = 0.35;
    if (this.phase === 'lost' || h.downT > 0) pose = 'down';
    else if (this.phase === 'won') pose = 'joy';
    else if (h.hurtT > 0) pose = 'hurt';
    else if (h.act) {
      const a = h.act;
      p = a.t / a.total;
      hitAt = a.hitAt / a.total;
      pose = a.kind === 'hit' ? (a.combo === 2 ? 'heavy' : a.combo === 1 ? 'swing2' : 'swing1') : 'cast';
    } else if (h.y > 0) pose = 'jump';
    else if (h.block) pose = h.crouch ? 'crouchblock' : 'block';
    else if (h.crouch) pose = 'crouch';
    else if (h.holdMagic > 0.2) pose = 'cast';
    this.walker.fightPose(dt, pose, p, hitAt, h.y, 0);
    // It.
    this.model.root.position.set(AX + m.x, m.y, 0);
    this.model.root.rotation.y = m.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (m.state === 'stun') this.model.root.rotation.z = Math.sin(this.t * 8) * 0.12;
    else this.model.root.rotation.z = 0;
    if (m.state === 'hurt') this.model.root.position.x += Math.sin(this.t * 60) * 0.04;
    this.model.update(dt, m.state === 'neutral' ? 1 : 0, 1);
    this.sparks.update(dt);
    this.smoke.update(dt);
    // Camera: side on, a little above, framing the two of you; swinging in from above at the start.
    const mid = Math.max(-HALF + 2.5, Math.min(HALF - 2.5, (h.x + m.x) / 2));
    const span = Math.abs(h.x - m.x);
    const wantPos = new THREE.Vector3(AX + mid, 2.4 + span * 0.08, 7.2 + span * 0.35);
    const wantLook = new THREE.Vector3(AX + mid, 1.0, 0);
    const c = this.cam;
    if (!c.init) { c.pos.set(AX + mid, 9, 6); c.look.copy(wantLook); c.init = true; }
    const k = 1 - Math.exp(-dt * (this.phase === 'intro' ? 4 : 5));
    c.pos.lerp(wantPos, k);
    c.look.lerp(wantLook, k);
    camera.position.copy(c.pos);
    if (this.shake > 0) {
      this.shake -= dt;
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    camera.lookAt(c.look);
  }

  /** Back to the maze: everyone where they were. */
  dispose() {
    this.walker.root.position.copy(this.saved.walker);
    this.walker.yaw = this.saved.walkerYaw;
    this.model.root.position.copy(this.saved.mon);
    this.model.root.rotation.set(0, this.saved.monYaw, 0);
    this.model.handTarget = null;
    this.model.handStiff = 30;
    this.model.ring.visible = true;
    this.model.setEyeGlow(0);
    this.saved.parent?.add(this.walker.root);
    this.saved.mparent?.add(this.model.root);
    this.walker.fightPose(0, 'idle');
    this.group.removeFromParent();
  }
}
