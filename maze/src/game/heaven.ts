// The ending: up in the clouds, a long table under paper lanterns, a bowl of ramen steaming at every
// place, and everyone you didn't play waiting for you (even the monster gets a bowl, at the far end).
// You walk in through the golden gate with your glowing wand, everyone jumps up to cheer, the three
// rubies fly up out of the wand and hang over the table like little suns, and then: noodles.
import * as THREE from 'three';
import { CHARACTERS, type Character } from '../data/characters';
import { buildHero, type HeroRig, type Pose } from '../entities/heroModel';
import { MonsterModel } from '../entities/monsterModel';
import { Youser } from '../entities/youser';
import { setDarkOff } from '../world/darkness';
import { ball, cyl, disposeTree, glow, toon } from '../world/toon';
import type { PadInput } from './controls';
import { SFX } from './sounds';

/** Where things are: a table along x, you at the near (-x) end, the gate behind you. */
const TABLE_L = 5.6, TABLE_W = 1.25, TABLE_H = 0.56, SIDE_Z = 0.86;
const HEAD_X = -TABLE_L / 2 - 0.62, GATE_X = HEAD_X - 9;

/** When things happen (seconds). */
const T = { arrive: 2.2, walkEnd: 7.6, cheer: 7.8, rubies: 8.4, sit: 10.0, theEnd: 12.0, menu: 18.5 };

const ease = (k: number) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

/** A puffy cloud: white balls in a heap (flattened underneath). */
function cloud(r: number, puffs = 9, color = 0xffffff, seed = 1) {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // (Lit from inside a little, so the shady side stays soft and white, not grey.)
  const m = toon(color, 0.35);
  for (let i = 0; i < puffs; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.75, pr = r * (0.35 + rnd() * 0.35);
    const b = new THREE.Mesh(new THREE.SphereGeometry(pr, 14, 10), m);
    b.position.set(Math.cos(a) * d, pr * 0.35 + rnd() * r * 0.15, Math.sin(a) * d * 0.7);
    b.scale.y = 0.7;
    g.add(b);
  }
  return g;
}

/** A soft round blob texture (steam, the sun's halo). */
let blobTex: THREE.Texture | null = null;
function blob() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

/** A bowl of ramen: red bowl, golden broth, noodles, half an egg, nori, a fish-cake swirl, spring onions. */
function ramen(seed: number) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.07, 0], [0.075, 0.01], [0.13, 0.07], [0.145, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 20), toon(0xc8302a));
  g.add(outer);
  const inner = new THREE.Mesh(new THREE.LatheGeometry([[0.14, 0.108], [0.12, 0.07], [0.06, 0.03], [0, 0.028]].map(([r, y]) => new THREE.Vector2(r, y)), 20), toon(0xfff4e0));
  g.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.008, 6, 24), toon(0x1a1410));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.11;
  g.add(rim);
  const broth = cyl(0.128, 0.128, 0.005, toon(0xe0a050), 0, 0.09, 0, 20);
  g.add(broth);
  // Noodles: little yellow loops lying in the broth.
  const nm = toon(0xf6d860);
  for (let i = 0; i < 7; i++) {
    const n = new THREE.Mesh(new THREE.TorusGeometry(0.03 + (i % 3) * 0.008, 0.006, 4, 12, Math.PI * 1.4), nm);
    const a = seed * 1.7 + i * 0.9;
    n.position.set(Math.cos(a) * 0.05, 0.095, Math.sin(a) * 0.05);
    n.rotation.set(-Math.PI / 2 + 0.2, 0, a * 2);
    g.add(n);
  }
  // Half an egg.
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xfffaf0));
  egg.scale.set(1, 0.6, 1.25);
  egg.position.set(0.05, 0.093, -0.03);
  g.add(egg);
  g.add(cyl(0.018, 0.018, 0.004, toon(0xf09020), 0.05, 0.114, -0.03, 12));
  // Nori sticking up at the back.
  const nori = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.004), toon(0x1e3a22));
  nori.position.set(-0.03, 0.13, -0.09);
  nori.rotation.x = -0.25;
  g.add(nori);
  // Fish-cake swirl.
  g.add(cyl(0.025, 0.025, 0.008, toon(0xfffaf4), -0.055, 0.097, 0.04, 14));
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 12, Math.PI * 1.6), toon(0xf06090));
  sw.rotation.x = -Math.PI / 2;
  sw.position.set(-0.055, 0.102, 0.04);
  g.add(sw);
  // Spring onions.
  for (let i = 0; i < 6; i++) g.add(cyl(0.007, 0.007, 0.004, toon(0x58b040), 0.02 + Math.cos(i * 2.3) * 0.03, 0.097, 0.05 + Math.sin(i * 2.3) * 0.03, 6));
  return g;
}

function chopsticks() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const c = cyl(0.005, 0.008, 0.26, toon(0xd8a868), s * 0.012, 0.08, 0, 5);
    c.rotation.z = -s * 0.04;
    g.add(c);
  }
  const tip = new THREE.Object3D();
  tip.position.y = 0.2;
  g.add(tip);
  return { g, tip };
}

type Mode = 'wait' | 'walk' | 'cheer' | 'eat';

/** Someone at the table: a hero (on a cloud stool) or Youser (on a stack of cushions). */
class Diner {
  readonly root = new THREE.Group();
  /** The bit that stands up and steps back to cheer. */
  private body = new THREE.Group();
  rig: HeroRig | null = null;
  youser: Youser | null = null;
  private tip: THREE.Object3D | null = null;
  /** A noodle hanging from the chopsticks down into the bowl. */
  private strand: THREE.Mesh;
  private stand = 0;
  private t: number;
  private lastUp = false;
  mode: Mode = 'wait';
  /** Where to look while waiting (the gate, then you). */
  lookAt = new THREE.Vector3();

  constructor(readonly who: Character, readonly bowl: THREE.Vector3, seat: THREE.Vector3, yaw: number, stool: boolean) {
    this.t = Math.random() * 10;
    this.root.position.copy(seat);
    this.root.rotation.y = yaw;
    this.root.add(this.body);
    if (who.kind === 'hero') {
      this.rig = buildHero(who.look, { noWeapon: true });
      this.body.add(this.rig.root);
      const c = chopsticks();
      c.g.rotation.x = 1.1;
      this.rig.hand.add(c.g);
      this.tip = c.tip;
      if (stool) {
        const s = cloud(0.32, 6, 0xfdfbff, 7 + Math.floor(seat.x * 10));
        s.scale.set(0.9, 0.9, 0.9);
        s.position.set(0, 0.06, -0.12);
        this.root.add(s);
      }
    } else {
      this.youser = new Youser();
      this.youser.root.scale.setScalar(1.25);
      this.youser.root.position.y = 0.44;
      this.body.add(this.youser.root);
      // A stack of plump cushions to reach the table.
      [0xf0a0b8, 0xa8d0f0, 0xf8e080].forEach((c, i) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.13, 16), toon(c));
        p.position.y = 0.07 + i * 0.13;
        p.scale.z = 0.9;
        this.root.add(p);
      });
    }
    this.strand = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), toon(0xf6d860));
    this.strand.visible = false;
  }

  /** The noodle lives in the scene (it hangs between two places). */
  get noodle() { return this.strand; }

  update(dt: number) {
    this.t += dt;
    const wantStand = this.mode === 'cheer' ? 1 : 0;
    this.stand += (wantStand - this.stand) * Math.min(1, dt * 6);
    // Standing up to cheer: up off the stool and a step back from the table.
    this.body.position.set(0, 0, -0.38 * this.stand);
    if (this.rig) {
      let pose: Pose = 'sit';
      if (this.mode === 'cheer' && this.stand > 0.4) pose = 'cheer';
      if (this.mode === 'eat') pose = 'slurp';
      this.rig.animate(dt, pose, { speed: 0, stride: 0, turn: 0 }, this.t);
      // While waiting, heads turn toward the gate (the body faces the table).
      if (this.mode === 'wait') {
        const local = this.root.worldToLocal(this.lookAt.clone());
        this.rig.head.rotation.y += (Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z))) - this.rig.head.rotation.y) * 0.5;
      }
    } else if (this.youser) {
      const hop = this.mode === 'cheer' ? (this.t * 2.4) % 1 : 0;
      this.youser.animate(dt, this.t, hop, 'happy');
      if (this.mode === 'eat') {
        // Nose down into the bowl now and then.
        const c = (this.t * 0.5) % 1;
        this.youser.root.rotation.x = c < 0.4 ? Math.sin((c / 0.4) * Math.PI) * 0.45 : 0;
      } else this.youser.root.rotation.x = 0;
    }
    // The noodle: from the chopsticks' tip down into the bowl while they're up.
    if (this.tip && this.mode === 'eat') {
      const a = this.tip.getWorldPosition(new THREE.Vector3());
      const b = this.bowl.clone().setY(this.bowl.y + 0.09);
      const up = a.y - b.y > 0.12;
      this.strand.visible = up;
      if (up) {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        this.strand.position.copy(mid);
        this.strand.scale.set(1, a.distanceTo(b), 1);
        this.strand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
      }
      if (up && !this.lastUp) this.slurped = true;
      this.lastUp = up;
    } else {
      this.strand.visible = false;
      if (this.youser && this.mode === 'eat') {
        const down = this.youser.root.rotation.x > 0.3;
        if (down && !this.lastUp) this.slurped = true;
        this.lastUp = down;
      }
    }
  }
  /** Just took a mouthful (for the slurp sound). */
  slurped = false;
}

export class Heaven {
  readonly group = new THREE.Group();
  private t = 0;
  private diners: Diner[] = [];
  /** You: walking in from the gate, then sitting at the head of the table. */
  private you: Diner;
  private youWalk: { rig: HeroRig | null; youser: Youser | null; root: THREE.Group; hop: number; wandTip: THREE.Object3D };
  private monster = new MonsterModel();
  private rubies: THREE.Mesh[] = [];
  private rubyLight = new THREE.PointLight(0xff5070, 0, 9, 1.4);
  private steam: { s: THREE.Sprite; v: number; life: number; age: number; x: number; z: number }[] = [];
  private bowls: THREE.Vector3[] = [];
  private lanterns: THREE.Group[] = [];
  private gateGlow: THREE.Mesh;
  private clouds: { g: THREE.Group; speed: number; r: number; a: number; y: number }[] = [];
  /** Tools: look from here instead ([x, y, z, lookX, lookY, lookZ]). */
  debugCam: number[] | null = null;
  private cam = { pos: new THREE.Vector3(0, 40, 30), look: new THREE.Vector3(0, 0, 0) };
  private flags = new Set<string>();
  /** Banners for the HUD (text, sub, seconds, colour). */
  readonly events: { text: string; sub?: string; time?: number; color?: string }[] = [];
  /** Time for the menu (after "THE END"). */
  menuReady = false;

  constructor(readonly hero: Character) {
    setDarkOff(true);
    SFX.heavenMusic(true);
    this.sky();
    this.table();
    // Everyone else: round the table, four a side (Youser wherever it falls), the monster at the far end.
    const others = CHARACTERS.filter((c) => c.id !== hero.id);
    const places: { x: number; z: number; yaw: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const x = -TABLE_L / 2 + 0.75 + i * ((TABLE_L - 1.5) / 3);
      places.push({ x, z: -SIDE_Z, yaw: 0 });
      places.push({ x: x + 0.05, z: SIDE_Z, yaw: Math.PI });
    }
    others.slice(0, 8).forEach((c, i) => {
      const p = places[i];
      const bowl = new THREE.Vector3(p.x, TABLE_H, p.z * 0.42);
      this.addBowl(bowl, i);
      const d = new Diner(c, bowl, new THREE.Vector3(p.x, 0, p.z * (c.kind === 'youser' ? 0.78 : 1)), p.yaw, true);
      this.diners.push(d);
      this.group.add(d.root, d.noodle);
    });
    // You, at the head (your seat stays empty until you get there).
    const myBowl = new THREE.Vector3(-TABLE_L / 2 + 0.3, TABLE_H, 0);
    this.addBowl(myBowl, 9);
    this.you = new Diner(hero, myBowl, new THREE.Vector3(HEAD_X + (hero.kind === 'youser' ? 0.2 : 0), 0, 0), Math.PI / 2, true);
    this.you.root.visible = false;
    this.diners.push(this.you);
    this.group.add(this.you.root, this.you.noodle);
    // ...and walking in, with the wand.
    const walkRoot = new THREE.Group();
    walkRoot.position.set(GATE_X, 0, 0);
    walkRoot.rotation.y = Math.PI / 2;
    walkRoot.visible = false;
    const wand = new THREE.Group();
    wand.add(cyl(0.016, 0.022, 0.46, toon(0x7a5230), 0, 0, 0, 6));
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), glow(0xff3050, 2.4));
    jewel.position.y = 0.5;
    jewel.scale.y = 1.4;
    wand.add(jewel);
    const wandTip = new THREE.Object3D();
    wandTip.position.y = 0.5;
    wand.add(wandTip);
    let rig: HeroRig | null = null, youser: Youser | null = null;
    if (hero.kind === 'hero') {
      rig = buildHero(hero.look, { noWeapon: true });
      wand.rotation.x = 0.9;
      rig.hand.add(wand);
      walkRoot.add(rig.root);
    } else {
      youser = new Youser();
      wand.position.set(0.1, 0.17, 0.1);
      wand.rotation.x = 0.7;
      wand.scale.setScalar(0.7);
      youser.root.add(wand);
      walkRoot.add(youser.root);
    }
    this.youWalk = { rig, youser, root: walkRoot, hop: 0, wandTip };
    this.group.add(walkRoot);
    // The monster, at the far end, chopsticks in its claw.
    this.monster.root.position.set(TABLE_L / 2 + 0.75, -0.42, 0);
    this.monster.root.rotation.y = -Math.PI / 2;
    const mc = chopsticks();
    mc.g.position.y = 0.2;
    mc.g.scale.setScalar(0.8);
    this.monster.hand.add(mc.g);
    this.group.add(this.monster.root);
    this.addBowl(new THREE.Vector3(TABLE_L / 2 - 0.3, TABLE_H, 0), 11);
    // The three rubies (they come out of your wand later).
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(0xff1838, 1.5));
      r.scale.y = 1.4;
      r.visible = false;
      this.rubies.push(r);
      this.group.add(r);
    }
    this.rubyLight.position.set(0, 2.6, 0);
    this.group.add(this.rubyLight);
    this.gateGlow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ map: blob(), color: new THREE.Color(0xfff0b0).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.gateGlow.position.set(GATE_X - 0.2, 1.4, 0);
    this.gateGlow.rotation.y = Math.PI / 2;
    this.gateGlow.scale.set(1.1, 1.6, 1);
    this.group.add(this.gateGlow);
    for (const d of this.diners) d.lookAt.set(GATE_X, 1, 0);
  }

  // ---------- building it ----------

  private sky() {
    const g = this.group;
    // A big soft dome: deep blue up high, gold and pink near the cloud sea.
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const col: number[] = [];
    const top = new THREE.Color(0x3f8fe8), mid = new THREE.Color(0x8cc8ff), low = new THREE.Color(0xffd0a0), pink = new THREE.Color(0xffb8d0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 300;
      const c = y > 0.35 ? mid.clone().lerp(top, (y - 0.35) / 0.65) : y > 0.05 ? low.clone().lerp(mid, (y - 0.05) / 0.3) : pink.clone().lerp(low, Math.max(0, (y + 0.3) / 0.35));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10;
    g.add(dome);
    // The sun, low behind the table, with a halo.
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 32), glow(0xfff4c0, 1.6));
    sun.position.set(160, 45, -120);
    sun.lookAt(0, 0, 0);
    g.add(sun);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob(), color: 0xffe8b0, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    halo.position.copy(sun.position);
    halo.scale.setScalar(70);
    g.add(halo);
    // Lights: bright and warm everywhere (no dark up here).
    g.add(new THREE.HemisphereLight(0xfff4ec, 0xc8b8e8, 0.95));
    const sunL = new THREE.DirectionalLight(0xfff0d0, 1.7);
    sunL.position.set(8, 14, -6);
    sunL.castShadow = true;
    sunL.shadow.mapSize.set(2048, 2048);
    const sc = sunL.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.far = 40;
    g.add(sunL, sunL.target);
    // The cloud you stand on: a big flat heap under the table and the path from the gate.
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.4, 40), toon(0xfdfcff, 0.35));
    floor.scale.set(7.2, 1, 4.2);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const c = cloud(1.0 + (i % 3) * 0.3, 7, 0xffffff, i + 3);
      c.position.set(Math.cos(a) * 7.0, -0.55, Math.sin(a) * 4.0);
      g.add(c);
    }
    // The path to the gate.
    const path = new THREE.Mesh(new THREE.BoxGeometry(10, 0.36, 2.2), toon(0xfdfcff, 0.35));
    path.position.set(GATE_X / 2 - 1.5, -0.18, 0);
    path.receiveShadow = true;
    g.add(path);
    for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {
      const c = cloud(0.7, 5, 0xffffff, i * 2 + (s > 0 ? 1 : 0) + 50);
      c.position.set(GATE_X + 0.5 + i * 1.0, -0.45, s * 1.25);
      g.add(c);
    }
    // The golden gate.
    const gold = toon(0xf0c040, 0.25);
    for (const s of [-1, 1]) {
      const pillar = cyl(0.16, 0.2, 3.0, gold, GATE_X, 1.5, s * 1.25, 12);
      g.add(pillar);
      g.add(ball(0.24, gold, GATE_X, 3.1, s * 1.25));
      g.add(cyl(0.3, 0.3, 0.16, gold, GATE_X, 0.08, s * 1.25, 12));
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 8, 28, Math.PI), gold);
    arch.position.set(GATE_X, 3.0, 0);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
    // Gate bars (swung open).
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(GATE_X, 0, s * 1.15);
      leaf.rotation.y = s * 1.3;
      for (let i = 0; i < 5; i++) leaf.add(cyl(0.025, 0.025, 2.5, gold, 0.0, 1.35, -s * (0.12 + i * 0.2), 6));
      leaf.add(cyl(0.03, 0.03, 1.0, gold, 0, 2.55, -s * 0.52, 6).rotateX(Math.PI / 2));
      leaf.add(cyl(0.03, 0.03, 1.0, gold, 0, 0.3, -s * 0.52, 6).rotateX(Math.PI / 2));
      g.add(leaf);
    }
    // Clouds drifting all round, far and near, some tinted by the low sun.
    const tints = [0xffffff, 0xffe8f0, 0xfff0d8, 0xeef0ff];
    for (let i = 0; i < 34; i++) {
      const far = i >= 14;
      const r = far ? 30 + (i % 7) * 9 : 13 + (i % 5) * 3;
      const a = i * 2.39;
      const c = cloud(far ? 5 + (i % 4) * 2 : 1.6 + (i % 3) * 0.7, far ? 11 : 8, tints[i % 4], i + 100);
      const y = far ? -8 - (i % 5) * 3 : -2.5 - (i % 4) * 1.2 + (i % 3 === 0 ? 4 : 0);
      c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.add(c);
      this.clouds.push({ g: c, speed: (0.01 + (i % 5) * 0.004) * (i % 2 ? 1 : -1), r, a, y });
    }
    // A sea of cloud tops far below.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: 0xf4e8f8, fog: false }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -16;
    g.add(sea);
  }

  private table() {
    const g = this.group;
    // A white cloth with a gold edge, hanging nearly to the floor.
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(TABLE_L, 0.04, TABLE_W), toon(0xfffcf6));
    cloth.position.y = TABLE_H;
    cloth.castShadow = cloth.receiveShadow = true;
    g.add(cloth);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(TABLE_L - 0.02, TABLE_H - 0.12, TABLE_W - 0.02), toon(0xf6f0e8));
    skirt.position.y = TABLE_H / 2 + 0.03;
    g.add(skirt);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(TABLE_L + 0.02, 0.05, TABLE_W + 0.02), toon(0xe8b830, 0.2));
    trim.position.y = TABLE_H - 0.04;
    g.add(trim);
    // A runner down the middle, teapots and little dishes.
    const run = new THREE.Mesh(new THREE.BoxGeometry(TABLE_L - 0.4, 0.005, 0.3), toon(0xd84a3a));
    run.position.y = TABLE_H + 0.023;
    g.add(run);
    for (const x of [-1.3, 1.3]) {
      const pot = new THREE.Group();
      pot.add(ball(0.11, toon(0x3a6a8a), 0, 0.1, 0));
      pot.add(ball(0.03, toon(0x3a6a8a), 0, 0.21, 0));
      const spout = cyl(0.015, 0.025, 0.12, toon(0x3a6a8a), 0.12, 0.12, 0, 6);
      spout.rotation.z = -0.9;
      pot.add(spout);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 12, Math.PI), toon(0x2a4a60));
      handle.position.set(-0.11, 0.12, 0);
      handle.rotation.z = Math.PI / 2;
      pot.add(handle);
      pot.position.set(x, TABLE_H + 0.02, 0);
      g.add(pot);
    }
    for (const x of [-2.0, -0.6, 0.6, 2.0]) {
      g.add(cyl(0.07, 0.05, 0.03, toon(0xf4ecdc), x, TABLE_H + 0.035, 0.05, 12));
      g.add(ball(0.03, toon(x < 0 ? 0xe86a8a : 0x8ad06a), x, TABLE_H + 0.06, 0.05));
    }
    // Paper lanterns floating overhead (it's heaven: nothing holds them up).
    const lantern = [0xf04a3a, 0xf0a030, 0xf04a3a, 0xf0a030, 0xf04a3a];
    lantern.forEach((c, i) => {
      const l = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(c, 0.55));
      body.scale.y = 0.85;
      l.add(body);
      for (const y of [-0.17, 0.17]) l.add(cyl(0.09, 0.09, 0.04, toon(0x2a1a14), 0, y, 0, 10));
      l.position.set(-TABLE_L / 2 + 0.5 + i * ((TABLE_L - 1) / 4), 2.35, 0);
      g.add(l);
      this.lanterns.push(l);
    });
  }

  private addBowl(at: THREE.Vector3, seed: number) {
    const b = ramen(seed);
    b.position.copy(at);
    b.position.y += 0.02;
    b.rotation.y = seed;
    this.group.add(b);
    this.bowls.push(at.clone().setY(at.y + 0.12));
    // A pair of chopsticks on a rest beside each bowl that nobody's holding (yours, the monster's are in hand).
  }

  // ---------- playing it ----------

  private once(name: string, at: number) {
    if (this.t < at || this.flags.has(name)) return false;
    this.flags.add(name);
    return true;
  }

  /** Skip ahead to everyone eating. */
  skip() {
    if (this.t >= T.sit) return;
    this.t = T.sit + 0.01;
    for (const f of ['hello', 'gate', 'cheer']) this.flags.add(f);
  }

  update(dt: number, input: PadInput) {
    this.t += dt;
    const t = this.t;
    if (t > 2.5 && (input.b.action.pressed || input.b.pause.pressed)) this.skip();
    SFX.heavenUpdate();
    if (this.once('hello', 0.6)) this.events.push({ text: 'HEAVEN', sub: 'Someone\'s been waiting for you...', time: 3, color: '#fff4b0' });
    if (this.once('gate', T.arrive)) {
      SFX.aah();
      this.youWalk.root.visible = true;
    }
    // The gate glows as you come through.
    (this.gateGlow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.abs(t - T.arrive - 0.3) / 1.4) * 0.9;
    // Walking from the gate to the head of the table.
    const walk = this.youWalk;
    const startX = GATE_X + 0.2, endX = HEAD_X - 0.45;
    const k = (t - T.arrive) / (T.walkEnd - T.arrive);
    const seated = t >= T.sit;
    if (k > 0 && !seated) {
      const prev = walk.root.position.x;
      const x = startX + (endX - startX) * Math.min(1, k);
      walk.root.position.x = x;
      const moving = k < 1;
      const stride = x - prev;
      if (walk.rig) {
        const pose: Pose = moving ? 'walk' : t > T.cheer && t < T.rubies + 1.2 ? 'cast' : 'idle';
        walk.rig.animate(dt, pose, { speed: moving ? 0.45 : 0, stride: moving ? stride : 0, turn: 0 }, t - T.cheer, Math.min(1, Math.max(0, (t - T.rubies + 0.4) / 1.4)));
      } else if (walk.youser) {
        if (moving) walk.hop = (walk.hop + dt * 3) % 1;
        else walk.hop = t > T.cheer ? (t * 2.2) % 1 : 0;
        walk.youser.animate(dt, t, walk.hop, 'happy');
      }
    }
    if (this.once('sit', T.sit)) {
      walk.root.visible = false;
      this.you.root.visible = true;
      for (const d of this.diners) d.mode = 'eat';
    }
    // Everyone watches you come, then jumps up to cheer.
    const youPos = walk.root.position.clone().setY(1);
    for (const d of this.diners) {
      if (d === this.you) continue;
      if (t < T.cheer) d.lookAt.lerp(t > T.arrive ? youPos : d.lookAt, 0.2);
    }
    if (t < T.sit && this.once('cheer', T.cheer)) { for (const e of this.diners) if (e !== this.you) e.mode = 'cheer'; SFX.hooray(); }
    for (const d of this.diners) {
      d.update(dt);
      if (d.slurped) {
        d.slurped = false;
        if (t > T.sit + 0.5) {
          const near = Math.max(0.15, 1 - this.cam.pos.distanceTo(d.root.position) / 14);
          if (Math.random() < 0.7) SFX.slurp(near); else SFX.clink(near);
        }
      }
    }
    // The monster: bobbing at its end, waving its claw when everyone cheers, then eating (somehow).
    const m = this.monster;
    if (t > T.cheer && t < T.sit) m.handTarget = new THREE.Vector3(0.7 + Math.sin(t * 10) * 0.15, 1.7, 0.2);
    else if (t >= T.sit) {
      const c = ((t + 1.3) * 0.4) % 1, up = c > 0.3 && c < 0.65 ? 1 : 0;
      m.handTarget = new THREE.Vector3(0.25 - up * 0.1, 0.95 + up * 0.45, 0.55 - up * 0.3);
    } else m.handTarget = null;
    m.handStiff = 18;
    m.update(dt, 0, t < T.sit ? -0.8 : 0);
    // The rubies: out of the wand and up over the table, where they circle slowly for ever.
    if (this.once('rubies', T.rubies)) {
      SFX.rubyBurst();
      this.events.push({ text: 'THREE RUBIES!', sub: 'They light up the sky', time: 2.2, color: '#ff5070' });
    }
    if (t >= T.rubies) {
      const from = walk.root.visible ? walk.wandTip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(HEAD_X, 1.2, 0);
      const fly = ease((t - T.rubies) / 2.2);
      this.rubies.forEach((r, i) => {
        r.visible = true;
        const a = t * 0.5 + (i * Math.PI * 2) / 3;
        const to = new THREE.Vector3(Math.cos(a) * 0.9, 3.4 + Math.sin(t * 1.3 + i) * 0.12, Math.sin(a) * 0.9);
        const arc = Math.sin(fly * Math.PI) * 1.2;
        r.position.copy(from).lerp(to, fly);
        r.position.y += arc;
        r.rotation.y = t * 2 + i;
        r.scale.setScalar(0.4 + 0.6 * fly).multiply(new THREE.Vector3(1, 1.4, 1));
      });
      this.rubyLight.intensity = 3 * fly + Math.sin(t * 3) * 0.3 * fly;
    }
    if (this.once('end', T.theEnd)) this.events.push({ text: 'THE END', sub: 'Ramen in the clouds, with everyone', time: 5.5, color: '#ffe23a' });
    if (t >= T.menu) this.menuReady = true;
    // Steam off every bowl.
    if (Math.random() < dt * 14) {
      const b = this.bowls[Math.floor(Math.random() * this.bowls.length)];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(b.x + (Math.random() - 0.5) * 0.12, b.y, b.z + (Math.random() - 0.5) * 0.12);
      this.group.add(s);
      this.steam.push({ s, v: 0.18 + Math.random() * 0.12, life: 2.2 + Math.random(), age: 0, x: (Math.random() - 0.5) * 0.06, z: (Math.random() - 0.5) * 0.06 });
    }
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const p = this.steam[i];
      p.age += dt;
      const f = p.age / p.life;
      p.s.position.y += p.v * dt;
      p.s.position.x += (p.x + Math.sin(p.age * 2 + i) * 0.04) * dt;
      p.s.position.z += p.z * dt;
      p.s.scale.setScalar(0.08 + f * 0.25);
      p.s.material.opacity = Math.sin(Math.min(1, f) * Math.PI) * 0.4;
      if (f >= 1) { p.s.removeFromParent(); p.s.material.dispose(); this.steam.splice(i, 1); }
    }
    // Lanterns sway, clouds drift.
    this.lanterns.forEach((l, i) => { l.rotation.z = Math.sin(t * 0.8 + i) * 0.06; l.rotation.y = t * 0.2 + i; l.position.y = 2.35 + Math.sin(t * 0.9 + i * 1.7) * 0.08; });
    for (const c of this.clouds) {
      c.a += c.speed * dt;
      c.g.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 0.3 + c.r) * 0.2, Math.sin(c.a) * c.r);
    }
  }

  render(dt: number, camera: THREE.PerspectiveCamera) {
    const t = this.t;
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    if (t < T.arrive) {
      // Down through the clouds to the table.
      const k = ease(t / T.arrive);
      pos.set(-6 - 4 * k, 26 - 20 * k, 20 - 10 * k);
      look.set(-3 * k, 0.5, 0);
    } else if (t < T.walkEnd + 0.4) {
      // Behind and beside you as you walk in from the gate.
      const w = this.youWalk.root.position;
      pos.set(w.x - 4.5, 3.4, 5.5);
      look.set(w.x + 2.5, 0.8, 0);
    } else if (t < T.sit) {
      // The table, everyone cheering, the rubies going up.
      pos.set(HEAD_X - 2.5, 3.2, 4.2);
      look.set(0, 1.4, 0);
    } else {
      // Round and round the table, slowly.
      const a = -0.9 + (t - T.sit) * 0.09;
      pos.set(Math.cos(a) * 7.5 - 0.3, 3.8 + Math.sin((t - T.sit) * 0.15) * 0.6, Math.sin(a) * 6.2 + 0.4);
      pos.z = Math.abs(pos.z) < 3 ? Math.sign(pos.z || 1) * 3 : pos.z;
      look.set(0, 0.9, 0);
    }
    if (this.debugCam) { const d = this.debugCam; pos.set(d[0], d[1], d[2]); look.set(d[3], d[4], d[5]); }
    const c = this.cam;
    const rate = t < T.arrive ? 30 : 2.2;
    const kk = 1 - Math.exp(-dt * rate);
    c.pos.lerp(pos, kk);
    c.look.lerp(look, kk);
    camera.position.copy(c.pos);
    camera.lookAt(c.look);
  }

  dispose() {
    SFX.heavenMusic(false);
    setDarkOff(false);
    disposeTree(this.group);
    this.group.removeFromParent();
  }
}
