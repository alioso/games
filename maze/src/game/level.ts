// Playing one maze: walk in from the courtyard, find the ruby, take it (it rises, bursts with light,
// and the light pours into your wand), then find your way back out through the entrance. The camera
// looks down from high above and a little behind; only what you can see is lit.
import * as THREE from 'three';
import { Particles } from '@engine/particles';
import type { Character } from '../data/characters';
import { type Layout, type MazeDef, generate, shiftAfterRuby } from '../data/mazes';
import { Walker } from '../entities/walker';
import { KeeperView } from '../entities/keeper';
import { KEEPERS, RIDDLES, type Riddle } from '../data/riddles';
import type { TrapView } from '../world/traps';
import { Monster } from './monster';
import { Fight, type FightEvent } from './fight';
import { Darkness, darkenAll, setDarkOff } from '../world/darkness';
import { MazeWorld, tileMid, tileStart, tileSize } from '../world/maze';
import type { PadInput } from './controls';
import { SFX } from './sounds';

export type LevelPhase = 'intro' | 'explore' | 'ruby' | 'fight' | 'failed' | 'done';

export interface LevelEvent {
  kind: 'banner';
  text: string;
  sub?: string;
  color?: string;
  time?: number;
}

/** Walking speeds (m/s): a brisk walk, and creeping. */
const RUN = 3.6, CREEP = 1.4;
const RADIUS = 0.3;

export class Level {
  readonly group = new THREE.Group();
  readonly layout: Layout;
  readonly world: MazeWorld;
  readonly walker: Walker;
  readonly dark: Darkness;
  phase: LevelPhase = 'intro';
  private phaseT = 0;
  hasRuby = false;
  hearts = 3;
  readonly events: LevelEvent[] = [];
  private vel = new THREE.Vector2();
  private stepRun = 0;
  private sparks = new Particles(600, true);
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  /** The ruby's flight (when taken). */
  private rubyFrom = new THREE.Vector3();
  /** The ground shaking (seconds left). */
  private shake = 0;
  private shifted = false;
  /** Tools: walk here by itself. */
  autoTarget: THREE.Vector3 | null = null;
  /** The riddle keepers at their gates. */
  readonly keepers: KeeperView[] = [];
  /** Can't be hurt again for a moment after a trap (seconds left). */
  private safe = 0;
  /** How long you've been in the wasps' way (they sting after a moment). */
  private waspT = 0;
  /** In the mud (it slows you right down). */
  inMud = false;
  /** A speech bubble: who's talking, what they say, for how long. */
  bubble: { text: string; at: THREE.Object3D; t: number } | null = null;
  /** A red flash on screen when you're hurt (seconds left). */
  hurtFlash = 0;
  readonly monster: Monster;
  /** Dark smoke when the monster vanishes. */
  private smoke = new Particles(300);
  /** When it comes back after vanishing. */
  private monsterBack: { t: number; go: () => void } | null = null;
  /** Creeping right now (for the monster's ears). */
  private creeping = false;
  private movingNow = false;
  /** The fight scene, while one's on. */
  fight: Fight | null = null;
  /** Comic words from the fight (for the HUD). */
  readonly pows: FightEvent[] = [];

  constructor(readonly def: MazeDef, readonly number: number, character: Character) {
    this.layout = generate(def);
    this.world = new MazeWorld(this.layout);
    this.group.add(this.world.group);
    this.walker = new Walker(character);
    this.walker.root.position.copy(this.world.start);
    this.walker.yaw = Math.PI;
    this.group.add(this.walker.root);
    this.group.add(this.sparks.mesh);
    // The keepers (a different one at each gate; riddles drawn at random each time you play).
    const people = [...KEEPERS].sort(() => Math.random() - 0.5);
    this.layout.keepers.forEach((k, i) => {
      const [tx, ty] = k.tile;
      const alongX = ty % 2 === 0;
      const v = new KeeperView(people[i % people.length], k.tile, tileMid(tx), tileMid(ty), alongX ? tileSize(tx) : tileSize(ty), alongX);
      this.keepers.push(v);
      this.group.add(v.root);
      this.world.blockers.add(ty * this.layout.tw + tx);
    });
    // The monster: somewhere far from the way in, away from the ruby (a new place every try).
    const spots: [number, number][] = [];
    for (let cy = 0; cy < def.h; cy++) for (let cx = 0; cx < def.w; cx++) {
      const x = tileMid(cx * 2 + 1), z = tileMid(cy * 2 + 1);
      if (Math.hypot(x - this.world.start.x, z - this.world.start.z) > Math.max(def.w, def.h) * 1.4 && Math.hypot(x - this.world.rubyPos.x, z - this.world.rubyPos.z) > 7) spots.push([x, z]);
    }
    const [mx, mz] = spots[Math.floor(Math.random() * spots.length)] ?? [this.world.rubyPos.x, this.world.rubyPos.z - 8];
    this.monster = new Monster(this.world, mx, mz, (ax, az, bx, bz) => this.dark.clearLine(ax, az, bx, bz));
    this.group.add(this.monster.model.root);
    this.group.add(this.smoke.mesh);
    this.world.onNewMeshes = (o) => darkenAll(o);
    darkenAll(this.group);
    this.dark = new Darkness(this.world);
  }

  get hero() {
    return this.walker.root.position;
  }

  private setPhase(p: LevelPhase) {
    this.phase = p;
    this.phaseT = 0;
  }

  update(dt: number, input: PadInput) {
    this.phaseT += dt;
    let speed = 0, stride = 0;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 0.4) {
          this.events.push({ kind: 'banner', text: this.def.name.toUpperCase(), sub: 'Find the ruby · then come back out this way', time: 3 });
          this.setPhase('explore');
        }
        break;
      case 'explore': {
        // Walk (camera-relative: up the screen is into the maze). Creep while holding the button.
        let mx = input.moveX, mz = input.moveZ;
        if (this.autoTarget) {
          const dx = this.autoTarget.x - this.hero.x, dz = this.autoTarget.z - this.hero.z, d = Math.hypot(dx, dz);
          if (d < 0.15) this.autoTarget = null;
          else { mx = dx / d; mz = dz / d; }
        }
        const creep = input.b.sneak.down;
        this.creeping = creep;
        const top = (creep ? CREEP : RUN) * (this.inMud ? 0.3 : 1);
        const want = new THREE.Vector2(mx, mz).multiplyScalar(top);
        this.vel.lerp(want, Math.min(1, dt * (want.lengthSq() > 0.01 ? 10 : 14)));
        const before = this.hero.clone();
        this.hero.x += this.vel.x * dt;
        this.hero.z += this.vel.y * dt;
        this.world.collide(this.hero, RADIUS);
        const moved = Math.hypot(this.hero.x - before.x, this.hero.z - before.z);
        speed = Math.min(1, moved / dt / RUN);
        stride = moved;
        if (this.vel.lengthSq() > 0.04) {
          const want = Math.atan2(this.vel.x, this.vel.y);
          let d = want - this.walker.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.walker.yaw += d * Math.min(1, dt * 12);
        }
        // Footsteps (squelches in the mud).
        this.stepRun += moved;
        if (this.stepRun > (this.inMud ? 0.25 : creep ? 0.5 : 0.75)) { this.stepRun = 0; if (this.inMud) SFX.squelch(); else SFX.step(creep); }
        this.movingNow = moved / dt > 0.3;
        // Go for the monster yourself (A, when it's right there and you can see it).
        if (input.b.action.pressed && this.canFight()) { this.startFight(true); break; }
        this.traps(dt, moved / dt);
        if (this.phase !== 'explore') break;
        this.monsterStep(dt);
        if (this.phase !== 'explore') break;
        // The ruby: walk up to it.
        if (!this.hasRuby && Math.hypot(this.hero.x - this.world.rubyPos.x, this.hero.z - this.world.rubyPos.z) < 1.1) this.takeRuby();
        // Out with it: past the arch into the courtyard.
        if (this.hasRuby && this.hero.z > this.world.depth + 1.2) {
          SFX.fanfare();
          this.walker.setPose('cheer');
          this.events.push({ kind: 'banner', text: 'YOU MADE IT OUT!', sub: `${this.def.name} · ruby ${this.number} of 3`, time: 4, color: '#ff5070' });
          this.setPhase('done');
        }
        break;
      }
      case 'ruby':
        this.rubyScene(dt);
        break;
      case 'fight': {
        const f = this.fight!;
        f.update(dt, input);
        this.pows.push(...f.events);
        f.events.length = 0;
        if (f.over) this.endFight();
        break;
      }
      case 'failed':
      case 'done':
        break;
    }
    if (this.phase !== 'fight') this.walker.update(dt, speed, stride);
    for (const k of this.keepers) k.update(dt, this.hero);
    if (this.safe > 0) this.safe -= dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  /** The monster thinks and moves; it may notice you, or catch you. */
  private monsterStep(dt: number) {
    const m = this.monster;
    if (this.monsterBack && (this.monsterBack.t -= dt) <= 0) { this.monsterBack.go(); this.monsterBack = null; }
    const caught = m.update(dt, { x: this.hero.x, z: this.hero.z, creeping: this.creeping, moving: this.movingNow });
    if (m.noticed) {
      SFX.tingle();
      const text = m.how === 'saw' ? 'IT SEES YOU!' : m.how === 'heard' ? 'IT HEARD YOU!' : 'IT SMELT YOU!';
      this.events.push({ kind: 'banner', text, sub: 'Run!', time: 1.8, color: '#c8b0ff' });
    }
    if (caught) this.startFight(false);
  }

  /** Is the monster close enough (and in sight) to go for it? */
  canFight() {
    const m = this.monster;
    if (!m.model.root.visible || m.state === 'gone' || this.phase !== 'explore') return false;
    const d = Math.hypot(m.pos.x - this.hero.x, m.pos.z - this.hero.z);
    return d < 2.6 && this.dark.clearLine(this.hero.x, this.hero.z, m.pos.x, m.pos.z);
  }

  /** Into the fight scene. */
  private startFight(youStarted: boolean) {
    this.vel.set(0, 0);
    this.fight = new Fight(this.walker, this.monster.model, this.def.theme, youStarted);
    this.group.add(this.fight.group);
    this.world.group.visible = false;
    setDarkOff(true);
    SFX.buzz(0);
    this.setPhase('fight');
  }

  /**
   * Back from the fight. Won: it's gone a good while. Lost: a heart, thrown clear, and it vanishes for
   * a bit. Either way it turns up again somewhere far off.
   */
  private endFight() {
    const f = this.fight!;
    const won = f.phase === 'won';
    f.dispose();
    this.fight = null;
    this.world.group.visible = true;
    setDarkOff(false);
    this.setPhase('explore');
    this.monsterBack = { t: won ? 30 : 8, go: this.monster.vanish(this.hero) };
    if (won) {
      this.events.push({ kind: 'banner', text: 'YOU BEAT IT!', sub: 'It\'ll be back... somewhere far away', time: 2.6, color: '#ffd040' });
      this.safe = 1.5;
    } else {
      // Thrown clear of where it caught you.
      const m = this.monster.pos;
      const dx = this.hero.x - m.x, dz = this.hero.z - m.z, d = Math.hypot(dx, dz) || 1;
      for (let k = 0; k < 10; k++) { this.hero.x += (dx / d) * 0.2; this.hero.z += (dz / d) * 0.2; this.world.collide(this.hero, RADIUS); }
      this.safe = 0;
      this.hurt('KNOCKED OUT!', 'It got the better of you this time');
    }
  }

  /** Is this spot inside a trap's area (shrunk a little, so brushing the edge doesn't count)? */
  private inside(t: TrapView, m = 0.1) {
    const [x0, z0, x1, z1] = t.area, h = this.hero;
    return h.x > x0 + m && h.x < x1 - m && h.z > z0 + m && h.z < z1 - m;
  }

  /**
   * The traps: walking through thorns costs a heart; wasps sting you if you hurry past their nest
   * (creep by slowly and they leave you be); mud just slows you right down.
   */
  private traps(dt: number, speed: number) {
    this.inMud = false;
    let buzz = 0, waspy = false;
    for (const t of this.world.traps) {
      const d = Math.hypot(this.hero.x - t.x, this.hero.z - t.z);
      switch (t.trap.kind) {
        case 'thorns':
          if (this.inside(t, 0.05)) this.hurt('OUCH! THORNS!');
          break;
        case 'wasps':
          buzz = Math.max(buzz, Math.max(0, 1 - d / 5));
          if (d < 1.6) {
            waspy = true;
            if (speed > CREEP * 1.25) this.waspT += dt;
            if (this.waspT > 0.35) { this.waspT = 0; this.hurt('STUNG BY WASPS!', 'Creep past the nest slowly next time'); }
          }
          break;
        case 'mud':
          if (this.inside(t, 0.3)) this.inMud = true;
          break;
      }
    }
    if (!waspy) this.waspT = Math.max(0, this.waspT - dt);
    SFX.buzz(buzz);
  }

  /** Hurt by a trap: lose a heart (then a moment where nothing can hurt you); none left and you're out. */
  private hurt(text: string, sub = '') {
    if (this.safe > 0 || this.phase !== 'explore') return;
    this.hearts--;
    this.safe = 2;
    this.hurtFlash = 0.5;
    this.walker.flinch();
    SFX.ouch(this.walker.character.voice);
    if (this.hearts <= 0) {
      this.events.push({ kind: 'banner', text: 'OUT OF HEARTS!', sub: 'Back to the start of the maze', time: 3, color: '#ff5050' });
      SFX.fail();
      this.setPhase('failed');
      return;
    }
    this.events.push({ kind: 'banner', text, sub: sub || `${this.hearts} ${this.hearts === 1 ? 'heart' : 'hearts'} left`, time: 1.8, color: '#ff7060' });
  }

  /** A keeper near enough to talk to (and still waiting to ask their riddle). */
  talkTarget() {
    if (this.phase !== 'explore') return null;
    return this.keepers.find((k) => k.state === 'waiting' && Math.hypot(k.root.position.x - this.hero.x, k.root.position.z - this.hero.z) < 1.9) ?? null;
  }

  /** A keeper you've already got wrong, nearby (to say they won't budge). */
  refusedNear() {
    return this.keepers.find((k) => k.state === 'refused' && Math.hypot(k.root.position.x - this.hero.x, k.root.position.z - this.hero.z) < 1.9) ?? null;
  }

  private asked = new Set<Riddle>();
  /** (Tools: the riddle just asked.) */
  lastRiddle: Riddle | null = null;
  /** A riddle nobody's asked yet this time. */
  riddleFor(_k: KeeperView): Riddle {
    const left = RIDDLES.filter((r) => !this.asked.has(r));
    const r = left[Math.floor(Math.random() * left.length)] ?? RIDDLES[0];
    this.asked.add(r);
    this.lastRiddle = r;
    return r;
  }

  /** The keeper says something (a bubble over their head, and their voice). */
  say(k: KeeperView, text: string, time = 3) {
    this.bubble = { text, at: k.root, t: time };
    SFX.mumble(k.keeper.voice, text.length);
  }

  /** You answered: right opens the gate, wrong and they stay put. */
  answer(k: KeeperView, right: boolean) {
    if (right) {
      k.open();
      this.world.blockers.delete(k.tile[1] * this.layout.tw + k.tile[0]);
      this.say(k, k.keeper.yes);
      SFX.right();
    } else {
      k.refuse();
      this.say(k, k.keeper.no);
      SFX.wrong();
    }
  }

  /** Found it! */
  private takeRuby() {
    this.hasRuby = true;
    this.vel.set(0, 0);
    const r = this.world.rubyPos;
    this.walker.yaw = Math.atan2(r.x - this.hero.x, r.z - this.hero.z);
    this.rubyFrom.copy(this.world.ruby.position);
    this.world.ruby.userData.free = true;
    SFX.rubyRise();
    this.setPhase('ruby');
  }

  /**
   * The ruby moment: it rises and spins faster and faster (1.4 s), bursts into light, and the light
   * streams into the wand's tip (0.9 s); the wand wakes and you hold it up high.
   */
  private rubyScene(dt: number) {
    const t = this.phaseT, ruby = this.world.ruby;
    if (t < 1.4) {
      const u = t / 1.4;
      ruby.position.set(this.rubyFrom.x, this.rubyFrom.y + u * u * 1.1, this.rubyFrom.z);
      ruby.rotation.y += dt * (2 + u * 24);
      ruby.scale.setScalar(1 + u * 0.5);
      if (Math.random() < 0.5) this.sparks.burst({ x: ruby.position.x, y: ruby.position.y, z: ruby.position.z, count: 2, color: 0xff4060, intensity: 3, speed: 1.2, size: 0.05, life: 0.6, gravity: -1 });
    } else if (ruby.visible) {
      // Burst!
      ruby.visible = false;
      SFX.rubyBurst();
      this.sparks.burst({ x: ruby.position.x, y: ruby.position.y, z: ruby.position.z, count: 80, color: 0xff3050, intensity: 4, speed: 3.5, size: 0.07, life: 1, gravity: 1 });
      this.sparks.burst({ x: ruby.position.x, y: ruby.position.y, z: ruby.position.z, count: 40, color: 0xffd0d8, intensity: 4, speed: 2, size: 0.05, life: 0.8, gravity: 0 });
      this.walker.setPose('raise');
    } else if (t < 2.4) {
      // A stream of light from where the ruby was into the wand.
      const tip = this.walker.tipWorld();
      const u = (t - 1.4) / 1.0;
      for (let k = 0; k < 4; k++) {
        const s = Math.random();
        const p = new THREE.Vector3().lerpVectors(ruby.position, tip, Math.min(1, u + s * 0.3));
        p.y += Math.sin(s * Math.PI) * 0.5 * (1 - u);
        this.sparks.burst({ x: p.x, y: p.y, z: p.z, count: 1, color: 0xff5070, intensity: 4, speed: 0.2, size: 0.05, life: 0.35, gravity: 0 });
      }
    } else if (!this.walker.powered) {
      this.walker.power();
      SFX.wandAwake();
      const tip = this.walker.tipWorld();
      this.sparks.burst({ x: tip.x, y: tip.y, z: tip.z, count: 60, color: 0xffd040, intensity: 4, speed: 2.5, size: 0.05, life: 0.9, gravity: 1 });
      this.events.push({ kind: 'banner', text: 'THE WAND AWAKENS!', sub: 'Now find your way back out', time: 3, color: '#ff5070' });
    } else if (t > 3.6 && !this.shifted) {
      this.shiftMaze();
    } else if (t > 6 && !this.world.shifting) {
      this.walker.setPose('walk');
      this.setPhase('explore');
    }
    // Sparkles off the wand while it's held up.
    if (this.walker.powered && Math.random() < 0.4) {
      const tip = this.walker.tipWorld();
      this.sparks.burst({ x: tip.x, y: tip.y, z: tip.z, count: 1, color: 0xffa0b0, intensity: 3, speed: 0.6, size: 0.04, life: 0.5, gravity: -0.5 });
    }
  }

  /** The maze shifts behind you: hedges grow across the way you came, and you forget those parts. */
  private shiftMaze() {
    this.shifted = true;
    const { closed, opened } = shiftAfterRuby(this.layout);
    this.world.shift(closed, opened);
    const tw = this.layout.tw;
    for (const k of [...closed, ...opened]) this.dark.forget(tileMid(k % tw), tileMid(Math.floor(k / tw)), 4.5);
    this.shake = 2;
    SFX.rumble();
    this.events.push({ kind: 'banner', text: 'THE MAZE SHIFTS!', sub: 'Hedges have moved · find a new way out', time: 3.2, color: '#8ae060' });
  }

  /** Each frame: the dark, sparkles, the camera. */
  render(dt: number, camera: THREE.PerspectiveCamera) {
    if (this.fight) { this.fight.render(dt, camera); return; }
    this.world.update(dt);
    this.dark.update(dt, this.hero.x, this.hero.z);
    this.sparks.update(dt);
    this.smoke.update(dt);
    const md = this.monster.model.root.visible ? Math.hypot(this.monster.pos.x - this.hero.x, this.monster.pos.z - this.hero.z) : 99;
    SFX.monster(md, this.monster.state === 'chase' || this.monster.state === 'alert', dt);
    if (this.walker.powered && Math.random() < dt * 3) {
      const tip = this.walker.tipWorld();
      this.sparks.burst({ x: tip.x, y: tip.y, z: tip.z, count: 1, color: 0xff6080, intensity: 3, speed: 0.3, size: 0.03, life: 0.6, gravity: -0.3 });
    }
    const r = this.world.rubyPos;
    SFX.update(dt, this.hasRuby ? 0 : Math.max(0, 1 - Math.hypot(this.hero.x - r.x, this.hero.z - r.z) / 14));
    this.updateCamera(dt, camera);
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera) {
    const h = this.hero;
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
    let rate = 4;
    if (this.phase === 'ruby') {
      // In close for the ruby.
      wantPos.set(h.x, 6, h.z + 5.5);
      wantLook.set(h.x, 1, h.z - 0.5);
      rate = 2;
    } else {
      wantPos.set(h.x, 15, h.z + 7.5);
      wantLook.set(h.x, 0, h.z - 0.6);
    }
    const c = this.cam;
    if (!c.init) { c.pos.copy(wantPos); c.look.copy(wantLook); c.init = true; }
    const k = 1 - Math.exp(-dt * rate);
    c.pos.lerp(wantPos, k);
    c.look.lerp(wantLook, k);
    camera.position.copy(c.pos);
    if (this.shake > 0) {
      this.shake -= dt;
      const a = Math.min(1, this.shake) * 0.12;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
    }
    camera.lookAt(c.look);
  }

  /** Has this tile been seen (for the map)? */
  seenTile(tx: number, ty: number) {
    return this.dark.wasSeen(tileStart(tx) + tileSize(tx) / 2, tileStart(ty) + tileSize(ty) / 2);
  }

  dispose() {
    if (this.fight) { this.fight.dispose(); setDarkOff(false); }
    this.world.dispose();
    this.group.removeFromParent();
  }
}
