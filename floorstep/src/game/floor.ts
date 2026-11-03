// One floor of the house being played: the hero walks, opens doors, searches furniture,
// finds the key, fights (see combat.ts) and climbs to the next floor.
import * as THREE from 'three';
import { Particles } from '@engine/particles';
import { damp, dampAngle, wrapAngle } from '@engine/math';
import { COMBAT } from '../data/combat';
import { FURNITURE } from '../data/furniture';
import { ANIMALS, type HeroLook } from '../data/heroes';
import { KIND_LINES, LINES, ROOM_LINES, fill, pick } from '../data/lines';
import { CAMERA, HERO, HOUSE } from '../data/tuning';
import { buildHero, type HeroRig, type Pose } from '../entities/heroModel';
import { Critters } from '../entities/critters';
import { Cat } from '../entities/cat';
import { Youser } from '../entities/youser';
import { makeFurniture, type FurnitureModel } from '../world/furnitureModels';
import { House, type DoorRT } from '../world/house';
import { type FloorPlan, type Piece, type Rect, doorsReachable, generateFloor, inRect, rectDist, rectOverlap, roomAt, solidBoxes } from '../world/plan';
import { CUT_Y, CUT_Z, applySection, ink, toon, unclipped } from '../world/toon';
import type { Bubbles } from '../ui/bubbles';
import type { Hud } from '../ui/hud';
import { Combat } from './combat';
import type { HeroControls } from './controls';
import type { RunState } from './run';
import { SFX } from './sounds';

export interface FloorCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bubbles: Bubbles;
  hud: Hud;
  look: HeroLook;
  floor: number;
  total: number;
  seed: number;
  /** Shared with the whole run: health, bolts and monster wounds carry over between floors. */
  run: RunState;
  onExit: () => void;
  /** The hero fell. */
  onDefeat: () => void;
  /** No monster (the floor behind the title screen). */
  calm?: boolean;
}

export interface PieceRT {
  p: Piece;
  model: FurnitureModel;
  searched: boolean;
  openT: number;
  openTarget: number;
  wiggle: number;
  /** Bookcases slide along their wall. */
  slide: { x0: number; z0: number; dx: number; dz: number; t: number } | null;
  gone: boolean;
  pop: number;
}

interface Search {
  piece: PieceRT;
  t: number;
  dur: number;
  beat: number;
}

const POOL = 6;
const tmp = new THREE.Vector3();

function makeKey() {
  const g = new THREE.Group();
  const gold = toon(0xf2c14e, 0.35);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 18), gold);
  ring.position.y = 0.3;
  g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), gold);
  shaft.position.y = 0.02;
  g.add(shaft);
  for (const y of [-0.1, -0.02]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05), gold);
    tooth.position.set(0.06, y, 0);
    g.add(tooth);
  }
  ink(g);
  return g;
}

export class Floor {
  readonly group = new THREE.Group();
  readonly plan: FloorPlan;
  readonly house: House;
  readonly pieces: PieceRT[] = [];
  readonly hero = { x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: Math.PI };
  phase: 'arrive' | 'play' | 'exit' | 'done' | 'dead' | 'reunion' = 'arrive';
  hasKey = false;
  exitOpen = false;
  time = 0;

  private rig: HeroRig;
  /** Where the hero model is drawn facing (smoothed, so turns flow). */
  private drawYaw = Math.PI;
  private lastX = 0;
  private lastZ = 0;
  private pose: Pose = 'walk';
  private poseT = 0;
  private poseHold = 0;
  private solids: Rect[] = [];
  private search: Search | null = null;
  readonly particles = new Particles(800);
  readonly combat: Combat;
  /** Bumped whenever walls or furniture move, so path-finding can refresh. */
  solidsVersion = 0;
  private deadT = 0;
  private critters: Critters;
  private lights: THREE.PointLight[] = [];
  private lantern = new THREE.PointLight(0xffd0a0, 2.2, 5.5, 1.6);
  private moon = new THREE.DirectionalLight(0xa8b8ff, 0.9);
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private camZoom = 1;
  private entered = new Set<number>();
  private searches = 0;
  private idle = 0;
  private stepT = 0;
  private ambientT = { wind: 0, creak: 12, mouse: 20, crackle: 0 };
  private keyMesh: THREE.Group | null = null;
  private keyAnim = 0;
  /** The house cat (if it lives on this floor) and, on the top floor, Youser. */
  cat: Cat | null = null;
  private catOn: PieceRT | null = null;
  youser: Youser | null = null;
  private reunion = { t: 0, step: 'cage' as 'cage' | 'hop' | 'jump' | 'hug', hopT: 0, x: 0, z: 0, fromX: 0, fromZ: 0 };
  private heroVec = new THREE.Vector3();
  private autoT = 0;

  constructor(readonly ctx: FloorCtx) {
    this.plan = generateFloor(ctx.seed, ctx.floor);
    this.house = new House(this.plan);
    this.group.add(this.house.group);
    ctx.scene.add(this.group);

    for (const p of this.plan.pieces) {
      const model = makeFurniture(p.kind, p.id + ctx.seed);
      const def = FURNITURE[p.kind];
      model.group.position.set(p.x, 0, p.z);
      model.group.rotation.y = p.rot;
      model.group.visible = false;
      this.group.add(model.group);
      this.pieces.push({ p, model, searched: def.search === 'none', openT: 0, openTarget: 0, wiggle: 0, slide: null, gone: false, pop: 1 });
    }
    this.rebuildSolids();

    applySection(this.group);
    this.rig = buildHero(ctx.look);
    unclipped(this.rig.root);
    this.group.add(this.rig.root);
    this.critters = new Critters((x, z) => this.solidAt(x, z, 0.08));
    this.group.add(this.critters.group, this.particles.mesh);
    this.combat = new Combat(this);
    this.placeCat();
    if (ctx.floor === ctx.total && !ctx.calm) this.placeYouser();

    // Lights: a moon through the roof for shadows, a pool of room lights, the hero's own glow.
    const hemi = new THREE.HemisphereLight(0xb0bce0, 0x40302a, 1.15);
    this.group.add(hemi);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.near = 1;
    sc.far = 40;
    this.moon.shadow.bias = -0.0008;
    this.group.add(this.moon, this.moon.target);
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.add(this.lantern);

    const a = this.plan.arrival;
    this.hero.x = a.c;
    this.hero.z = a.at + 2.1;
    this.hero.y = this.house.groundY(this.hero.x, this.hero.z);
    this.revealRoom(this.plan.startRoom);
    this.entered.add(this.plan.startRoom);
    CUT_Y.constant = HOUSE.cutHeight;
    CUT_Z.constant = this.cutTarget();
    this.snapCamera();
    ctx.hud.setFloor(ctx.floor, ctx.total);
    ctx.hud.setHp(ctx.run.hp, this.maxHp);
    ctx.hud.setKey(false);
    ctx.hud.objective(ctx.floor === ctx.total && !ctx.calm ? 'Find the key and free Youser!' : 'Find the key!');
  }

  // ---------- helpers ----------

  get heroRig() {
    return this.rig;
  }

  get look() {
    return this.ctx.look;
  }

  get maxHp() {
    return COMBAT[this.ctx.look.cls].maxHp;
  }

  shakeBy(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  private rebuildSolids() {
    this.solidsVersion++;
    const gone = new Set(this.pieces.filter((r) => r.gone).map((r) => r.p.id));
    this.solids = solidBoxes(this.plan, gone);
    if (!this.exitOpen) {
      const e = this.plan.exit, hw = HOUSE.doorWidth / 2;
      this.solids.push({ x0: e.c - hw, x1: e.c + hw, z0: e.at - 0.12, z1: e.at + 0.12 });
    }
  }

  solidAt(x: number, z: number, r: number) {
    if (!inRect(this.plan.bounds, x, z, -0.05)) return true;
    return this.solids.some((b) => inRect(b, x, z, r));
  }

  collide(x: number, z: number, r: number): [number, number] {
    for (let it = 0; it < 3; it++) {
      for (const b of this.solids) {
        const cx = Math.max(b.x0, Math.min(x, b.x1));
        const cz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: leave by the nearest side.
          const opts: [number, number, number][] = [[b.x0 - r, z, x - b.x0], [b.x1 + r, z, b.x1 - x], [x, b.z0 - r, z - b.z0], [x, b.z1 + r, b.z1 - z]];
          opts.sort((a, c) => a[2] - c[2]);
          [x, z] = opts[0];
        }
      }
    }
    return [x, z];
  }

  say(text: string, shout = false) {
    const pitch = ANIMALS[this.ctx.look.animal].voice * (this.ctx.look.sex === 'f' ? 1.25 : 1);
    this.ctx.bubbles.say(this.rig.headTop, text, { shout, onChar: (ch) => SFX.voice(pitch, ch) });
  }

  private setPose(p: Pose, hold = 0) {
    if (this.pose !== p) this.poseT = 0;
    this.pose = p;
    this.poseHold = hold;
  }

  private revealRoom(id: number) {
    if (id < 0 || !this.house.reveal(id)) return;
    for (const r of this.pieces) {
      if (r.p.room !== id) continue;
      r.model.group.visible = true;
      r.pop = 0;
    }
  }

  private pieceCenter(r: PieceRT, y = 0.8) {
    const b = r.p.box;
    return tmp.set((b.x0 + b.x1) / 2, FURNITURE[r.p.kind].place === 'hung' ? 1.5 : Math.min(y, FURNITURE[r.p.kind].size[2] + 0.3), (b.z0 + b.z1) / 2);
  }

  /** The thing the hero would search by pressing the button now. */
  private target(): PieceRT | 'exit' | null {
    const h = this.hero;
    const e = this.plan.exit;
    const facing = (x: number, z: number) => {
      const a = Math.atan2(x - h.x, z - h.z) - h.yaw;
      return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    };
    let best: PieceRT | 'exit' | null = null, bestD = Infinity;
    if (!this.exitOpen) {
      const d = Math.hypot(h.x - e.c, h.z - (e.at + 0.4));
      if (d < 1.25) { best = 'exit'; bestD = d - 0.6 + facing(e.c, e.at) * 0.25; }
    }
    const here = roomAt(this.plan, h.x, h.z);
    for (const r of this.pieces) {
      if (r.searched || r.gone || !r.model.group.visible || r.p.room !== here?.id) continue;
      const d = rectDist(r.p.box, h.x, h.z) - HERO.radius;
      if (d > HERO.reach) continue;
      // Prefer what you're facing.
      const c = this.pieceCenter(r);
      const score = d + facing(c.x, c.z) * 0.25;
      if (score < bestD) { bestD = score; best = r; }
    }
    return best;
  }

  // ---------- update ----------

  update(dt: number, c: HeroControls) {
    this.time += dt;
    this.poseT += dt;
    const h = this.hero;
    let mx = c.moveX, mz = c.moveZ;
    let speedMul = 1;

    if (this.phase === 'arrive') {
      // Walk up the stairs into the house.
      this.autoT += dt;
      mx = 0;
      mz = -1;
      speedMul = 0.7;
      if (h.z <= this.plan.arrival.at - 0.9) {
        this.phase = 'play';
        this.say(fill(pick(LINES.arrive), { floor: this.ctx.floor }));
      }
    } else if (this.phase === 'exit') {
      this.autoT += dt;
      mx = 0;
      mz = -1;
      speedMul = 0.65;
      if (this.autoT > 1.6 && this.phase === 'exit') {
        this.phase = 'done';
        SFX.stairs();
        this.ctx.onExit();
      }
    } else if (this.phase === 'done' || this.phase === 'dead' || this.phase === 'reunion') {
      mx = mz = 0;
    }
    if (this.phase === 'dead') {
      this.deadT += dt;
      if (this.deadT > 2.6 && this.deadT - dt <= 2.6) this.ctx.onDefeat();
    }

    // Fighting: the combat module reads the buttons and may root the hero in place.
    if (this.phase === 'play' && !this.search) this.combat.control(c);
    const fight = this.combat.pose();
    if (this.phase === 'play') speedMul *= this.combat.moveFactor;

    const busy = this.poseHold > 0 || !!this.search || !!fight || this.phase === 'dead' || this.phase === 'reunion';
    if (this.poseHold > 0) this.poseHold -= dt;

    // Searching: hold still until it's done; walking away cancels.
    if (this.search) {
      if (Math.hypot(mx, mz) > 0.5 && this.search.t > 0.1) this.cancelSearch();
      else this.stepSearch(dt);
      mx = mz = 0;
    } else if (busy) {
      mx = mz = 0;
    }

    // Movement with a little acceleration, so it feels weighty, not twitchy.
    const tvx = mx * HERO.speed * speedMul, tvz = mz * HERO.speed * speedMul;
    const k = 1 - Math.exp(-HERO.accel * dt * 0.5);
    h.vx += (tvx - h.vx) * k;
    h.vz += (tvz - h.vz) * k;
    // Never let a bad input (NaN) knock the hero out of the world.
    if (!Number.isFinite(h.vx) || !Number.isFinite(h.vz)) h.vx = h.vz = 0;
    let nx = h.x + h.vx * dt, nz = h.z + h.vz * dt;
    if (this.phase === 'play' || this.phase === 'arrive') [nx, nz] = this.collide(nx, nz, HERO.radius);
    h.vx = (nx - h.x) / dt;
    h.vz = (nz - h.z) / dt;
    h.x = nx;
    h.z = nz;
    h.y = damp(h.y, this.house.groundY(h.x, h.z), 14, dt);
    const sp = Math.hypot(h.vx, h.vz);
    if (sp > 0.3 && !fight) h.yaw = dampAngle(h.yaw, Math.atan2(h.vx, h.vz), 12, dt);
    // Standing around: slowly turn to face the camera, like comic characters do.
    else if (!busy && this.poseT > 1.2 && this.pose === 'idle') h.yaw = dampAngle(h.yaw, 0.25, 2.5, dt);
    if (fight) this.setPose(fight.pose);
    else if (this.phase === 'dead') this.setPose('dead');
    else if (!busy) this.setPose(sp > 0.3 ? 'walk' : 'idle');
    if (sp > 0.5) {
      this.stepT -= dt * sp;
      if (this.stepT <= 0) { this.stepT = 1.0; SFX.step(); }
    }

    if (this.phase === 'play') {
      this.idle = Math.hypot(c.moveX, c.moveZ) > 0.1 || this.search || fight || this.combat.boss?.engaged ? 0 : this.idle + dt;
      if (this.idle > 14) { this.idle = -10; this.say(pick(LINES.idle)); }
      this.updateRooms();
      this.updateInteract(c);
      if (this.exitOpen && h.z < this.plan.exit.at - 0.5) {
        this.phase = 'exit';
        this.autoT = 0;
        this.ctx.bubbles.prompt(null, '', '');
      }
    }

    this.combat.update(dt);
    this.updatePieces(dt);
    this.critters.update(dt);
    this.updateCat(dt);
    if (this.phase === 'play') this.ctx.run.stats.seconds += dt;
    if (this.phase === 'reunion') this.updateReunion(dt);
    else if (this.youser) this.youser.animate(dt, this.time, 0, 'sad');
    this.particles.update(dt);
    this.ambient(dt);
  }

  private updateRooms() {
    const h = this.hero;
    const room = roomAt(this.plan, h.x, h.z);
    if (room) {
      this.revealRoom(room.id);
      if (!this.entered.has(room.id)) {
        this.entered.add(room.id);
        const lines = ROOM_LINES[room.type];
        if (lines && Math.random() < 0.4 && !this.ctx.bubbles.speaking(this.rig.headTop)) this.say(pick(lines));
      }
    }
    for (const d of this.house.doors) {
      if (d.opened || d.door.kind !== 'door') continue;
      const dx = d.door.axis === 'h' ? d.door.c : d.door.at, dz = d.door.axis === 'h' ? d.door.at : d.door.c;
      if (Math.hypot(h.x - dx, h.z - dz) < 1.7) this.openDoor(d);
    }
  }

  private openDoor(d: DoorRT) {
    this.house.openDoor(d, this.hero.x, this.hero.z);
    SFX.door();
    this.revealRoom(d.door.lo);
    this.revealRoom(d.door.hi);
  }

  private updateInteract(c: HeroControls) {
    const b = this.ctx.bubbles;
    if (this.search || this.poseHold > 0 || this.combat.act || this.combat.blocking) {
      b.prompt(null, '', '');
      return;
    }
    const t = this.target();
    if (!t) {
      // Nothing to search? Maybe a cat to pet.
      const cat = this.cat;
      if (cat && (cat.state === 'sleep' || cat.state === 'purr') && Math.hypot(cat.x - this.hero.x, cat.z - this.hero.z) < 1.3) {
        b.prompt(tmp.set(cat.x, cat.y + 0.8, cat.z), 'E', cat.petted ? 'Pet the cat again' : 'Pet the cat');
        if (c.interact) this.petCat();
        return;
      }
      b.prompt(null, '', '');
      return;
    }
    if (t === 'exit') {
      const e = this.plan.exit;
      b.prompt(tmp.set(e.c, 2.4, e.at), 'E', this.hasKey ? 'Unlock the door' : 'Locked door');
      if (c.interact) this.tryExit();
      return;
    }
    const def = FURNITURE[t.p.kind];
    const pos = this.pieceCenter(t, 1.2).clone();
    pos.y = Math.max(pos.y, 1.0) + 0.5;
    b.prompt(pos, 'E', def.verb);
    if (c.interact) this.startSearch(t);
  }

  private tryExit() {
    const e = this.plan.exit;
    this.hero.yaw = Math.PI;
    if (!this.hasKey) {
      SFX.locked();
      this.house.exitDoor.angle = 0.06;
      this.say(pick(LINES.locked));
      return;
    }
    SFX.unlock();
    if (this.youser) {
      this.startReunion();
      return;
    }
    this.exitOpen = true;
    this.house.openDoor(this.house.exitDoor, this.hero.x, e.at + 1);
    this.house.exitDoor.target = 1.75;
    setTimeout(() => SFX.door(), 300);
    this.rebuildSolids();
    this.ctx.hud.setKey(false);
    this.ctx.hud.objective('Up the stairs!');
    this.say(pick(LINES.unlock));
  }

  private startSearch(r: PieceRT) {
    const def = FURNITURE[r.p.kind];
    // The thief is quicker at this.
    const dur = def.time * (this.ctx.look.cls === 'thief' ? 0.7 : 1);
    this.search = { piece: r, t: 0, dur, beat: 0 };
    const c = this.pieceCenter(r);
    this.hero.yaw = Math.atan2(c.x - this.hero.x, c.z - this.hero.z);
    this.hero.vx = this.hero.vz = 0;
    this.setPose(def.search === 'under' ? 'under' : 'search');
    this.idle = 0;
    if (def.search === 'open' || def.search === 'lift' || def.search === 'pull') { r.openTarget = 1; SFX.openWood(); }
    if (def.search === 'push') { this.startSlide(r); SFX.scrape(); }
  }

  private cancelSearch() {
    const s = this.search!;
    if (FURNITURE[s.piece.p.kind].search !== 'push') s.piece.openTarget = 0;
    this.search = null;
    this.ctx.bubbles.ring(null);
  }

  private stepSearch(dt: number) {
    const s = this.search!;
    const r = s.piece;
    const def = FURNITURE[r.p.kind];
    s.t += dt;
    s.beat -= dt;
    this.setPose(def.search === 'under' ? 'under' : 'search');
    if (s.beat <= 0) {
      s.beat = 0.28;
      r.wiggle = 1;
      if (def.search === 'dig' || def.search === 'under') SFX.rummage();
      if (def.search === 'smash') { SFX.openWood(); this.shake = Math.max(this.shake, 0.08); }
      if (def.search === 'dig') {
        const c = this.pieceCenter(r, 0.5);
        this.particles.burst({ x: c.x, y: c.y, z: c.z, count: 3, color: 0xd8d0c0, speed: 2, up: 3, size: 0.08, life: 0.6 });
      }
    }
    const pos = this.pieceCenter(r, 1.2).clone();
    pos.y += 0.6;
    this.ctx.bubbles.ring(pos, s.t / s.dur);
    if (s.t >= s.dur) {
      this.search = null;
      this.ctx.bubbles.ring(null);
      this.finishSearch(r);
    }
  }

  private startSlide(r: PieceRT) {
    // Slide along the wall, whichever way there's room.
    const along = Math.abs(Math.sin(r.p.rot)) < 0.5 ? [1, 0] : [0, 1];
    const room = this.plan.rooms[r.p.room].rect;
    for (const s of [1, -1]) {
      const dx = along[0] * s * 0.95, dz = along[1] * s * 0.95;
      const b = r.p.box;
      const nb = { x0: b.x0 + dx, x1: b.x1 + dx, z0: b.z0 + dz, z1: b.z1 + dz };
      if (!inRect(room, nb.x0, nb.z0, -0.05) || !inRect(room, nb.x1, nb.z1, -0.05)) continue;
      const others = this.solids.filter((q) => q !== b);
      if (others.some((q) => rectOverlap(q, nb, -0.02))) continue;
      if (rectDist(nb, this.hero.x, this.hero.z) < HERO.radius + 0.05) continue;
      // Never shove it somewhere that walls you (or a doorway) off.
      const old = r.p.box;
      r.p.box = nb;
      const ok = doorsReachable(this.plan, this.hero.x, this.hero.z, new Set(this.pieces.filter((q) => q.gone).map((q) => q.p.id)));
      r.p.box = old;
      if (!ok) continue;
      r.slide = { x0: r.p.x, z0: r.p.z, dx, dz, t: 0 };
      return;
    }
  }

  private finishSearch(r: PieceRT) {
    const def = FURNITURE[r.p.kind];
    r.searched = true;
    this.searches++;
    this.ctx.run.stats.searched++;
    // The cat was asleep on that.
    if (this.catOn === r && this.cat) this.startleCat();
    // Some things make a noise.
    if (r.p.kind === 'toilet') SFX.flush();
    if (r.p.kind === 'piano') SFX.plonk();
    if (r.p.kind === 'clock') SFX.cuckoo();
    const c = this.pieceCenter(r).clone();

    if (def.search === 'smash') this.breakPiece(r);
    if (def.search === 'push' && r.slide) {
      r.p.box = { x0: r.p.box.x0 + r.slide.dx, x1: r.p.box.x1 + r.slide.dx, z0: r.p.box.z0 + r.slide.dz, z1: r.p.box.z1 + r.slide.dz };
      r.p.x += r.slide.dx;
      r.p.z += r.slide.dz;
      this.rebuildSolids();
    }

    const f = r.p.find;
    switch (f.kind) {
      case 'key':
        this.foundKey(c);
        break;
      case 'heal': {
        this.ctx.run.hp = Math.min(this.maxHp, this.ctx.run.hp + f.amount);
        this.ctx.hud.setHp(this.ctx.run.hp, this.maxHp);
        SFX.heal();
        this.ctx.bubbles.pow(c.clone().setY(1.6), `+${f.amount} ♥`, '#ff6b6b', 0.8);
        this.say(f.line);
        break;
      }
      case 'junk':
        // The thief finds bolts where others find junk.
        if (this.look.cls === 'thief' && Math.random() < 0.5) {
          const n = 2 + Math.floor(Math.random() * 3);
          this.ctx.run.arrows += n;
          SFX.junk();
          this.ctx.bubbles.pow(c.clone().setY(1.6), `+${n} ➶`, '#ffd23f', 0.8);
          this.say('Bolts! Handy.');
          break;
        }
        SFX.junk();
        this.say(f.line);
        break;
      case 'critter': {
        const from = this.hero;
        this.critters.spawn(f.critter, c.x, c.z, from.x, from.z);
        if (f.critter === 'bat') {
          SFX.bat();
          this.ctx.bubbles.pow(c.clone().setY(2), 'FLAP FLAP', '#c9b8ff', 0.8);
          this.say(pick(LINES.bat), true);
          SFX.scream();
        } else {
          SFX.squeak();
          this.ctx.bubbles.pow(c.clone().setY(0.8), 'SQUEAK!', '#ffffff', 0.7);
          this.say(pick(LINES.mouse));
        }
        this.setPose('scared', 0.9);
        break;
      }
      case 'empty': {
        SFX.empty();
        // Spiders live in tall dark furniture.
        if (['wardrobe', 'bookcase', 'clock', 'fridge'].includes(r.p.kind) && Math.random() < 0.22) {
          const h = this.hero;
          this.critters.spawn('spider', h.x + Math.sin(h.yaw) * 0.45, h.z + Math.cos(h.yaw) * 0.45, h.x, h.z);
          this.setPose('scared', 0.9);
          this.say(pick(['EEK! A SPIDER!', 'Get it off! Get it off!', 'Spiders. Why is it always spiders?']), true);
          SFX.scream();
          break;
        }
        const kindLines = KIND_LINES[r.p.kind];
        if (kindLines && Math.random() < 0.55) {
          this.say(pick(kindLines));
          break;
        }
        if (def.search === 'smash' && Math.random() < 0.3) this.say(pick(LINES.smashed));
        else if (!this.hasKey && this.searches > 6 && Math.random() < 0.45) this.say(pick(LINES.emptyMany));
        else this.say(pick(LINES.empty));
        break;
      }
    }
    if (f.kind !== 'key' && def.search !== 'push') r.openTarget = def.search === 'smash' ? 0 : 0.35;
  }

  private breakPiece(r: PieceRT) {
    const c = this.pieceCenter(r).clone();
    r.gone = true;
    r.model.group.visible = false;
    const vase = r.p.kind === 'vase';
    if (vase) SFX.smashGlass();
    else SFX.smash();
    this.particles.burst({ x: c.x, y: 0.4, z: c.z, count: vase ? 18 : 26, color: vase ? 0x6a8ac0 : 0xa07a4a, speed: 4, up: 4, size: vase ? 0.09 : 0.14, life: 1.2 });
    this.ctx.bubbles.pow(c.clone().setY(1.2), vase ? 'KRSSH!' : 'CRASH!', '#ffd23f');
    this.shake = Math.max(this.shake, 0.35);
    this.rebuildSolids();
    this.combat?.noise(c.x, c.z);
  }

  /** Smashed by a weapon instead of searched: same result, whatever was inside falls out. */
  smash(r: PieceRT) {
    if (r.gone || r.searched) return;
    this.finishSearch(r);
  }

  /** Down and out. */
  heroDies() {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.deadT = 0;
    this.search = null;
    this.ctx.bubbles.ring(null);
    this.ctx.bubbles.prompt(null, '', '');
    this.combat.act = null;
    this.say(pick(['Ugh...', 'Youser... sorry...', 'Not... like... this...']));
    this.shake = 0.5;
  }

  private foundKey(at: THREE.Vector3) {
    this.hasKey = true;
    SFX.key();
    this.keyMesh = makeKey();
    this.keyMesh.position.copy(at).setY(1.0);
    this.group.add(this.keyMesh);
    this.keyAnim = 0;
    this.setPose('cheer', 1.5);
    this.say(pick(LINES.key), true);
    this.ctx.bubbles.pow(at.clone().setY(2.2), 'KEY!', '#f2c14e', 1.3);
    this.ctx.hud.setKey(true);
    this.ctx.hud.objective('Find the locked door!');
    // The exit door's room shows itself once you have the key? No: you still have to find it.
  }

  private updatePieces(dt: number) {
    for (const r of this.pieces) {
      if (!r.model.group.visible) continue;
      r.openT = damp(r.openT, r.openTarget, 8, dt);
      r.model.open?.(r.openT);
      r.model.tick?.(this.time, this.heroVec.set(this.hero.x, 1, this.hero.z));
      const g = r.model.group;
      if (r.pop < 1) {
        r.pop = Math.min(1, r.pop + dt * 4);
        const s = 0.85 + 0.15 * (1 - Math.pow(1 - r.pop, 3)) + Math.sin(r.pop * Math.PI) * 0.06;
        g.scale.setScalar(s);
      }
      if (r.wiggle > 0) {
        r.wiggle = Math.max(0, r.wiggle - dt * 4);
        g.rotation.z = Math.sin(this.time * 40) * 0.025 * r.wiggle;
      }
      if (r.slide && r.slide.t < 1) {
        r.slide.t = Math.min(1, r.slide.t + dt / Math.max(0.3, FURNITURE[r.p.kind].time));
        const e = r.slide.t * r.slide.t * (3 - 2 * r.slide.t);
        g.position.set(r.slide.x0 + r.slide.dx * e, 0, r.slide.z0 + r.slide.dz * e);
      }
    }
    if (this.keyMesh) {
      this.keyAnim += dt;
      const k = this.keyMesh;
      const t = this.keyAnim;
      k.rotation.y += dt * 6;
      if (t < 1.1) {
        tmp.set(this.hero.x, this.hero.y + 2.1, this.hero.z);
        k.position.lerp(tmp, 1 - Math.exp(-6 * dt));
        k.scale.setScalar(1 + Math.sin(Math.min(1, t) * Math.PI) * 0.6);
      } else {
        k.scale.multiplyScalar(Math.exp(-dt * 8));
        if (t > 1.6) { k.removeFromParent(); this.keyMesh = null; }
      }
    }
  }

  private ambient(dt: number) {
    const a = this.ambientT;
    const h = this.hero;
    a.wind -= dt;
    if (a.wind <= 0) {
      a.wind = 2.2;
      const near = this.house.openWindowsNear(h.x, h.z, 7);
      if (near.length) {
        const d = Math.min(...near.map((w) => Math.hypot(w.x - h.x, w.z - h.z)));
        SFX.wind(1 - d / 7);
        // Leaves blow in.
        const w = near[0];
        this.particles.burst({ x: w.x, y: 1.6, z: w.z, count: 2, color: 0x8a6a2a, speed: 1.5, up: 0.5, size: 0.06, life: 2, gravity: 1.2 });
      }
    }
    a.crackle -= dt;
    if (a.crackle <= 0) {
      a.crackle = 0.08 + Math.random() * 0.3;
      const fire = this.pieces.find((r) => r.p.kind === 'fireplace' && r.model.group.visible && Math.hypot(r.p.x - h.x, r.p.z - h.z) < 6);
      if (fire) {
        SFX.crackle(1 - Math.hypot(fire.p.x - h.x, fire.p.z - h.z) / 6);
        if (Math.random() < 0.3) this.particles.burst({ x: fire.p.x, y: 0.5, z: fire.p.z, count: 1, color: 0xffa040, intensity: 3, speed: 0.4, up: 2, size: 0.04, life: 0.8, gravity: -1 });
      }
    }
    a.creak -= dt;
    if (a.creak <= 0) {
      a.creak = 14 + Math.random() * 20;
      SFX.houseCreak();
    }
    a.mouse -= dt;
    if (a.mouse <= 0 && this.phase === 'play') {
      a.mouse = 25 + Math.random() * 25;
      // A mouse dashes across a lit room near you.
      const ang = Math.random() * Math.PI * 2;
      const x = h.x + Math.cos(ang) * 4, z = h.z + Math.sin(ang) * 4;
      const room = roomAt(this.plan, x, z);
      if (room && this.house.isRevealed(room.id) && !this.solidAt(x, z, 0.1)) {
        this.critters.spawn('mouse', x, z, x - Math.sin(ang), z + Math.cos(ang));
        SFX.squeak();
      }
    }
  }

  // ---------- the cat ----------

  /** Most floors have a cat asleep on a bed, sofa or armchair somewhere. */
  private placeCat() {
    if (Math.random() < 0.3) return;
    const spots = this.pieces.filter((r) => ['bed', 'sofa', 'armchair'].includes(r.p.kind) && r.p.room !== this.plan.startRoom);
    if (!spots.length) return;
    const r = spots[Math.floor(Math.random() * spots.length)];
    const y = r.p.kind === 'bed' ? 0.62 : 0.5;
    this.cat = new Cat(r.p.x, y, r.p.z, Math.random() * 6, (x, z) => this.solidAt(x, z, 0.1));
    this.catOn = r;
    this.cat.root.visible = false;
    this.group.add(this.cat.root);
  }

  private startleCat() {
    const cat = this.cat!;
    if (!cat.startle(this.hero.x, this.hero.z)) return;
    SFX.hiss();
    this.ctx.bubbles.pow(tmp.set(cat.x, cat.y + 0.7, cat.z), 'HSSSS!', '#ffb050', 0.9);
    this.ctx.bubbles.say(cat.headTop, 'MRRAOW!', { shout: true });
    if (!this.ctx.bubbles.speaking(this.rig.headTop)) this.say(pick(['GAH! A cat!', 'Sorry, kitty!', 'Bad kitty! ...Bad me.']), true);
    this.setPose('scared', 0.7);
  }

  private petCat() {
    const cat = this.cat!;
    SFX.purr();
    this.ctx.bubbles.say(cat.headTop, pick(['Purrrrr...', 'Prrrrt.', '*happy purring*']));
    if (!cat.petted) {
      this.ctx.run.hp = Math.min(this.maxHp, this.ctx.run.hp + 1);
      this.ctx.hud.setHp(this.ctx.run.hp, this.maxHp);
      this.ctx.bubbles.pow(tmp.set(cat.x, cat.y + 0.9, cat.z), '+1 ♥', '#ff6b6b', 0.7);
      this.say(pick(['Who\'s a good kitty?', 'Aww. That\'s better.', 'Nice kitty. Don\'t eat me.']));
      this.ctx.run.stats.petted++;
    }
    cat.pet();
  }

  private updateCat(dt: number) {
    const cat = this.cat;
    if (!cat) return;
    cat.root.visible = cat.state !== 'gone' && (this.catOn?.model.group.visible ?? true);
    if (!cat.root.visible) return;
    cat.update(dt, this.time);
    if (cat.state !== 'sleep' && cat.state !== 'purr') return;
    // Rushing past, or a fight nearby, wakes it up.
    const h = this.hero;
    const d = Math.hypot(cat.x - h.x, cat.z - h.z);
    const fast = Math.hypot(h.vx, h.vz) > HERO.speed * 0.85;
    const fight = this.combat.monsters.some((m) => m.alive && Math.hypot(m.x - cat.x, m.z - cat.z) < 3);
    if ((d < 0.9 && fast) || fight || (this.combat.act && d < 2.5)) this.startleCat();
    else if (Math.random() < dt * 0.15) this.ctx.bubbles.say(cat.headTop, 'Zzz...', { life: 1.5 });
  }

  // ---------- the ending ----------

  /** At the very top: Youser, in a cage at the top of the last stairs. */
  private placeYouser() {
    const e = this.plan.exit;
    const y = new Youser();
    const z = e.at - 2.3;
    const top = this.house.groundY(e.c, z);
    y.root.position.set(e.c, top, z);
    y.root.rotation.y = 0;
    y.cage.position.set(0, 0, 0);
    y.root.add(y.cage);
    unclipped(y.root);
    this.group.add(y.root);
    this.youser = y;
  }

  private startReunion() {
    const e = this.plan.exit;
    this.exitOpen = true;
    this.house.openDoor(this.house.exitDoor, this.hero.x, e.at + 1);
    this.house.exitDoor.target = 1.75;
    setTimeout(() => SFX.door(), 300);
    this.rebuildSolids();
    this.ctx.hud.setKey(false);
    this.ctx.hud.objective('');
    this.ctx.bubbles.prompt(null, '', '');
    this.phase = 'reunion';
    const y = this.youser!;
    this.reunion = { t: 0, step: 'cage', hopT: 0, x: y.root.position.x, z: y.root.position.z, fromX: 0, fromZ: 0 };
    this.say('YOUSER!', true);
  }

  private updateReunion(dt: number) {
    const R = this.reunion, y = this.youser!, h = this.hero;
    R.t += dt;
    // The hero faces the stairs and kneels down, arms open; then turns round to show us Youser.
    if (R.step === 'hug') h.yaw = dampAngle(h.yaw, 0.15, 2.5, dt);
    else h.yaw = Math.atan2(R.x - h.x, R.z - h.z);
    if (R.step !== 'hug') this.setPose(R.t > 0.8 ? 'kneel' : 'idle');
    if (R.step === 'cage') {
      y.openCage(Math.min(1, R.t / 0.9));
      y.animate(dt, this.time, 0, 'happy');
      if (R.t > 1.0) {
        R.step = 'hop';
        R.t = 0;
        this.ctx.bubbles.say(y.headTop, '!!!', { shout: true });
        SFX.squeak();
      }
    } else if (R.step === 'hop') {
      // Hop, hop, hop down the stairs toward the hero.
      const tx = h.x + Math.sin(h.yaw) * 0.55, tz = h.z + Math.cos(h.yaw) * 0.55;
      const dx = tx - R.x, dz = tz - R.z, l = Math.hypot(dx, dz);
      R.hopT = (R.hopT + dt / 0.32) % 1;
      if (l > 0.08) {
        const s = Math.min(l, 2.4 * dt);
        R.x += (dx / l) * s;
        R.z += (dz / l) * s;
      }
      y.root.position.set(R.x, this.house.groundY(R.x, R.z), R.z);
      y.root.rotation.y = Math.atan2(dx, dz);
      y.animate(dt, this.time, R.hopT, 'happy');
      if (l < 0.1) {
        R.step = 'jump';
        R.t = 0;
        R.fromX = R.x;
        R.fromZ = R.z;
      }
    } else if (R.step === 'jump') {
      // One big leap into the hero's arms.
      const k = Math.min(1, R.t / 0.45);
      this.rig.chest.getWorldPosition(tmp);
      y.root.position.set(R.fromX + (tmp.x - R.fromX) * k, this.house.groundY(R.fromX, R.fromZ) + (tmp.y - 0.15) * k + Math.sin(k * Math.PI) * 0.6, R.fromZ + (tmp.z - R.fromZ) * k);
      y.animate(dt, this.time, k, 'happy');
      if (k >= 1) {
        R.step = 'hug';
        R.t = 0;
        this.rig.chest.add(y.root);
        y.root.position.set(0, -0.15, 0.02);
        y.root.rotation.set(0, Math.PI, 0);
        this.setPose('hug');
        SFX.joy();
        this.ctx.hud.banner('YOUSER IS FREE!', 'Together again!', 4.5, true);
        this.say(pick(['Youser! I found you!', 'There you are, little one!', 'Never again, Youser. Never again.']), true);
        setTimeout(() => this.youser && this.ctx.bubbles.say(this.youser.headTop, '*happy squeak!*', { shout: true }), 1300);
      }
    } else {
      y.animate(dt, this.time, 0, 'happy');
      this.setPose('hug');
      if (Math.random() < dt * 6) this.particles.burst({ x: h.x, y: 1.6, z: h.z, count: 1, color: 0xff6b8a, intensity: 1.5, speed: 0.8, up: 1.2, size: 0.09, life: 1.2, gravity: -0.5 });
      if (R.t > 6 && this.phase === 'reunion') {
        this.phase = 'done';
        this.ctx.onExit();
      }
    }
  }

  // ---------- render ----------

  /** Slice the house just inside the south wall of the hero's room. */
  private cutTarget() {
    const h = this.hero;
    const room = roomAt(this.plan, h.x, h.z);
    return room ? room.rect.z1 - 0.115 : Number.isFinite(h.z) ? h.z + 0.6 : 1000;
  }

  private snapCamera() {
    const h = this.hero;
    this.camLook.set(h.x, 0, h.z);
    this.camPos.set(h.x, CAMERA.height, h.z + CAMERA.back);
  }

  render(dt: number) {
    const h = this.hero;
    this.rig.root.position.set(h.x, h.y, h.z);
    // Turns are smoothed for the eye; how fast we turn and how far we walked drive the animation.
    const prevYaw = this.drawYaw;
    this.drawYaw = dampAngle(this.drawYaw, h.yaw, 16, dt);
    this.rig.root.rotation.y = this.drawYaw;
    const stride = Math.hypot(h.x - this.lastX, h.z - this.lastZ);
    this.lastX = h.x;
    this.lastZ = h.z;
    const turn = dt > 0 ? wrapAngle(this.drawYaw - prevYaw) / dt : 0;
    const sp = Math.min(1, Math.hypot(h.vx, h.vz) / HERO.speed);
    const fight = this.combat.pose();
    const adt = dt * this.combat.timeScale;
    this.rig.animate(adt, this.pose, { speed: this.combat.act ? 0 : sp, stride: stride < 0.5 ? stride : 0, turn }, this.poseT, fight?.p ?? 0, fight?.hit ?? 0.35);

    // Camera: follows a bit ahead, stays above.
    const lx = h.x + h.vx * CAMERA.lead * 0.3, lz = h.z + h.vz * CAMERA.lead * 0.3;
    this.camLook.x = damp(this.camLook.x, lx, 4, dt);
    this.camLook.z = damp(this.camLook.z, lz, 4, dt);
    this.camLook.y = damp(this.camLook.y, h.y * 0.6, 4, dt);
    // Zoom in for the reunion.
    this.camZoom = damp(this.camZoom, this.phase === 'reunion' ? 0.55 : 1, 1.5, dt);
    this.camPos.set(this.camLook.x, this.camLook.y + CAMERA.height * this.camZoom, this.camLook.z + CAMERA.back * this.camZoom);
    const cam = this.ctx.camera;
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      const s = this.shake * this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.camLook);

    CUT_Z.constant = damp(CUT_Z.constant, this.cutTarget(), 8, dt);
    this.house.update(dt, this.time);
    this.updateLights();
  }

  private updateLights() {
    const h = this.hero;
    this.moon.position.set(h.x - 5, 14, h.z - 6);
    this.moon.target.position.set(h.x, 0, h.z);
    this.lantern.position.set(h.x, h.y + 1.9, h.z + 0.4);

    type Src = { x: number; y: number; z: number; color: number; intensity: number; distance: number; flicker: number; d: number };
    const srcs: Src[] = [];
    for (const l of this.house.lights) {
      if (l.room === -2 ? !this.exitOpen : !this.house.isRevealed(l.room)) continue;
      srcs.push({ ...l, d: Math.hypot(l.x - h.x, l.z - h.z) });
    }
    for (const r of this.pieces) {
      const L = FURNITURE[r.p.kind].light;
      if (!L || !r.model.group.visible) continue;
      const fx = Math.sin(r.p.rot) * 0.4, fz = Math.cos(r.p.rot) * 0.4;
      const x = r.p.x + (r.p.kind === 'fireplace' ? fx : 0), z = r.p.z + (r.p.kind === 'fireplace' ? fz : 0);
      srcs.push({ x, y: L.y, z, color: L.color, intensity: L.intensity, distance: L.distance, flicker: L.flicker ?? 0, d: Math.hypot(x - h.x, z - h.z) });
    }
    srcs.sort((a, b) => a.d - b.d);
    for (let i = 0; i < POOL; i++) {
      const l = this.lights[i], s = srcs[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.set(s.x, s.y, s.z);
      l.color.setHex(s.color);
      l.distance = s.distance;
      const n = Math.sin(this.time * 17 + i * 3) * 0.5 + Math.sin(this.time * 9.3 + i) * 0.5;
      l.intensity = s.intensity * (1 + n * s.flicker);
    }
  }

  // ---------- debug ----------

  get searching() {
    return !!this.search || this.poseHold > 0;
  }

  interactTarget() {
    return this.target();
  }

  get keyPiece() {
    return this.pieces.find((r) => r.p.id === this.plan.keyPiece)!;
  }

  debugTeleport(x: number, z: number) {
    this.hero.x = x;
    this.hero.z = z;
    this.phase = 'play';
  }

  debugRevealAll() {
    for (const r of this.plan.rooms) this.revealRoom(r.id);
    for (const d of this.house.doors) if (d.door.kind === 'door') this.house.openDoor(d, 0, 0);
  }

  dispose() {
    this.combat.dispose();
    this.ctx.bubbles.clear();
    this.critters.clear();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.ink) o.geometry.dispose();
    });
    this.moon.shadow.map?.dispose();
  }
}
