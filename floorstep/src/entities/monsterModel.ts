// Monster models in the same scruffy comic style as the heroes. They all share one springy
// skeleton (hips, torso, head and jaw, two arms, two legs, a tail) dressed up differently, so they
// all move fluidly. Injuries (lost ear, missing tooth, eye patch, bandage) stay when they come back.
import * as THREE from 'three';
import type { MonsterName } from '../data/monsters';
import { ball, ink, part, toon } from '../world/toon';
import { Springs } from './springs';

export type MonsterPose = 'idle' | 'walk' | 'run' | 'tell' | 'strike' | 'recover' | 'hurt' | 'stun' | 'dead' | 'flee' | 'perch';
export type Injury = 'ear' | 'tooth' | 'eye' | 'bandage' | 'tail';

export interface MonsterRig {
  root: THREE.Group;
  headTop: THREE.Object3D;
  /** Which attack the tell/strike poses are for. */
  move: string;
  animate(dt: number, pose: MonsterPose, speed: number, t: number, p: number): void;
  /** Pull a body part off (for gore); returns it in world space, or null if it's already gone. */
  detach(part: Injury | 'arm'): THREE.Object3D | null;
  /** The little stars that circle a dizzy monster. */
  stars: THREE.Group;
  /** Rocked by a blow. */
  flinch(strength?: number): void;
}

const INKC = 0x14100e;

function oval(rx: number, ry: number, rz: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  const m = ball(1, color, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}

function lathe(points: [number, number][], color: THREE.ColorRepresentation | THREE.Material, seg = 16) {
  return part(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), color);
}

function limb(len: number, r: number, color: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const c = part(new THREE.CapsuleGeometry(r, len, 4, 8), color);
  c.position.y = -len / 2;
  g.add(c);
  return g;
}

function cone(r: number, h: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  const c = part(new THREE.ConeGeometry(r, h, 6), color, x, y, z);
  c.rotation.set(rx, 0, rz);
  return c;
}

function makeStars() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe060).multiplyScalar(2), toneMapped: false }));
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
    g.add(s);
  }
  g.visible = false;
  return g;
}

/** Glinting little eyes (with a mean brow). */
function eyes(head: THREE.Object3D, y: number, z: number, spread: number, size: number, white: number, pupil: number) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(oval(size, size * 1.2, size * 0.7, white, s * spread, 0, 0));
    const p = ball(size * 0.4, pupil, s * spread, 0, size * 0.6);
    p.userData.noInk = true;
    g.add(p);
    const brow = part(new THREE.BoxGeometry(size * 1.5, size * 0.3, size * 0.3), INKC, s * spread * 1.05, size * 1.1, size * 0.5);
    brow.rotation.z = s * 0.45;
    brow.userData.noInk = true;
    g.add(brow);
  }
  g.position.set(0, y, z);
  head.add(g);
  return g;
}

// ---------- the shared skeleton ----------

interface Skeleton {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  arms: [THREE.Group, THREE.Group];
  fores: [THREE.Group, THREE.Group];
  hands: [THREE.Group, THREE.Group];
  legs: [THREE.Group, THREE.Group];
  shins: [THREE.Group, THREE.Group];
  tail: THREE.Group[];
  ears: THREE.Object3D[];
  teeth: THREE.Object3D[];
  headTop: THREE.Object3D;
  /** Head size, for fitting bandages and patches. */
  headR: number;
  /** Left eye position (for the eye patch). */
  eyeAt: THREE.Vector3;
}

interface SkelSpec {
  skin: number;
  hipY: number;
  thigh: number;
  shin: number;
  legR: number;
  torsoY: number;
  /** Lathe profile of the body. */
  torsoShape: [number, number][];
  torsoColor: number;
  headY: number;
  headZ: number;
  headR: number;
  shoulder: [number, number, number];
  upperArm: number;
  foreArm: number;
  armR: number;
  armColor?: number;
  tailSegs: number;
  tailR: number;
  tailColor?: number;
  footColor?: number;
}

function skeleton(spec: SkelSpec): Skeleton {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = spec.hipY;
  body.add(hips);
  const legs: THREE.Group[] = [], shins: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const thigh = limb(spec.thigh, spec.legR, spec.skin);
    thigh.position.x = s * spec.legR * 2.4;
    const shin = limb(spec.shin, spec.legR * 0.85, spec.skin);
    shin.position.y = -spec.thigh - spec.legR;
    thigh.add(shin);
    shin.add(oval(spec.legR * 1.6, spec.legR, spec.legR * 3, spec.footColor ?? spec.skin, 0, -spec.shin - spec.legR, spec.legR * 1.5));
    hips.add(thigh);
    legs.push(thigh);
    shins.push(shin);
  }
  const torso = new THREE.Group();
  torso.position.y = spec.torsoY;
  body.add(torso);
  torso.add(lathe(spec.torsoShape, spec.torsoColor));
  const head = new THREE.Group();
  head.position.set(0, spec.headY, spec.headZ);
  torso.add(head);
  const jaw = new THREE.Group();
  head.add(jaw);
  const headTop = new THREE.Object3D();
  headTop.position.y = spec.headR * 2.6;
  head.add(headTop);
  const arms: THREE.Group[] = [], fores: THREE.Group[] = [], hands: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const up = limb(spec.upperArm, spec.armR, spec.armColor ?? spec.skin);
    up.position.set(s * spec.shoulder[0], spec.shoulder[1], spec.shoulder[2]);
    const fore = limb(spec.foreArm, spec.armR * 0.85, spec.armColor ?? spec.skin);
    fore.position.y = -spec.upperArm - spec.armR;
    up.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -spec.foreArm - spec.armR;
    fore.add(hand);
    torso.add(up);
    arms.push(up);
    fores.push(fore);
    hands.push(hand);
  }
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = hips;
  for (let i = 0; i < spec.tailSegs; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.02 : 0, i === 0 ? -spec.tailR * 4 : -spec.tailR * 4.5);
    const r = spec.tailR * (1 - i / (spec.tailSegs + 1));
    const c = part(new THREE.CapsuleGeometry(r, spec.tailR * 3.5, 3, 6), spec.tailColor ?? spec.skin);
    c.rotation.x = Math.PI / 2;
    c.position.z = -spec.tailR * 2;
    seg.add(c);
    parent.add(seg);
    parent = seg;
    tail.push(seg);
  }
  return {
    root, body, hips, torso, head, jaw, headTop,
    arms: arms as [THREE.Group, THREE.Group], fores: fores as [THREE.Group, THREE.Group], hands: hands as [THREE.Group, THREE.Group],
    legs: legs as [THREE.Group, THREE.Group], shins: shins as [THREE.Group, THREE.Group],
    tail, ears: [], teeth: [], headR: spec.headR, eyeAt: new THREE.Vector3(-spec.headR * 0.35, spec.headR * 0.4, spec.headR * 0.9),
  };
}

/** Old wounds: a missing ear or tooth, an eye patch, a bandage round the head, half a tail. */
function wounds(sk: Skeleton, injuries: Injury[]) {
  const hurt = new Set(injuries);
  if (hurt.has('ear') && sk.ears[0]) sk.ears[0].visible = false;
  if (hurt.has('tooth') && sk.teeth[0]) sk.teeth[0].visible = false;
  if (hurt.has('tail')) for (const t of sk.tail.slice(Math.ceil(sk.tail.length / 2))) t.visible = false;
  const r = sk.headR;
  if (hurt.has('eye')) {
    sk.head.add(oval(r * 0.32, r * 0.36, r * 0.12, INKC, sk.eyeAt.x, sk.eyeAt.y, sk.eyeAt.z + r * 0.05));
    const strap = part(new THREE.TorusGeometry(r * 0.98, r * 0.05, 4, 20), INKC, 0, sk.eyeAt.y, 0);
    strap.rotation.set(Math.PI / 2 + 0.25, 0, 0.3);
    sk.head.add(strap);
  }
  if (hurt.has('bandage')) {
    const band = part(new THREE.TorusGeometry(r * 0.92, r * 0.17, 6, 20), 0xf4f0e6, 0, r * 0.45, 0);
    band.rotation.set(Math.PI / 2 - 0.35, 0, 0.1);
    sk.head.add(band);
    sk.head.add(part(new THREE.BoxGeometry(r * 0.35, r * 0.35, r * 0.08), 0xf4f0e6, r * 0.45, r * 0.8, r * 0.6).rotateZ(0.4));
  }
}

/** How a monster stands and moves. */
interface Style {
  /** Forward lean of the torso at rest. */
  hunch: number;
  /** Steps per second at full run, and how far legs and arms swing. */
  gait: number;
  stride: number;
  armSwing: number;
  /** How much it bounces. */
  bounce: number;
  /** Optional extra animation (tongues, wings...), called after the pose is set. */
  extra?: (pose: MonsterPose, move: string, p: number, t: number, sp: Springs) => void;
}

/** Which way each attack is animated. */
const MOVE_STYLE: Record<string, 'arm' | 'arms' | 'head' | 'crouch' | 'throw' | 'spin' | 'jab' | 'shove' | 'burrow'> = {
  swipe: 'arm', slash: 'arm', pinch: 'arm', slam: 'arms', bite: 'head', tongue: 'head', spit: 'head',
  lunge: 'crouch', pounce: 'crouch', charge: 'crouch', dive: 'crouch', vanish: 'crouch', teleport: 'crouch',
  throw: 'throw', blades: 'throw', spin: 'spin', tail: 'spin', jab: 'jab', shove: 'shove', burrow: 'burrow',
};

/** Turn a dressed-up skeleton into a living, springy monster. */
function rig(sk: Skeleton, style: Style, injuries: Injury[], scale = 1): MonsterRig {
  wounds(sk, injuries);
  const stars = makeStars();
  stars.position.y = sk.headR * 1.6;
  sk.head.add(stars);
  sk.root.scale.setScalar(scale);
  sk.root.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o.material instanceof THREE.MeshBasicMaterial)) o.castShadow = true;
  });
  ink(sk.root);

  const sp = new Springs();
  sp.add('body', sk.body, 24, 0.55);
  sp.add('hips', sk.hips, 24, 0.6);
  sp.add('torso', sk.torso, 20, 0.5);
  sp.add('head', sk.head, 12, 0.4);
  sp.add('jaw', sk.jaw, 30, 0.5);
  sp.add('thighL', sk.legs[0], 28, 0.65);
  sp.add('thighR', sk.legs[1], 28, 0.65);
  sp.add('shinL', sk.shins[0], 28, 0.65);
  sp.add('shinR', sk.shins[1], 28, 0.65);
  sp.add('armL', sk.arms[0], 18, 0.45);
  sp.add('armR', sk.arms[1], 18, 0.45);
  sp.add('foreL', sk.fores[0], 16, 0.4);
  sp.add('foreR', sk.fores[1], 16, 0.4);
  sk.ears.forEach((e, i) => sp.add(`ear${i}`, e, 9, 0.25));
  sk.tail.forEach((t, i) => sp.add(`tail${i}`, t, 7 + i, 0.3));
  let phase = 0;

  const r: MonsterRig = {
    root: sk.root,
    headTop: sk.headTop,
    move: 'swipe',
    stars,
    flinch(strength = 1) {
      sp.kick('torso', -10 * strength, (Math.random() - 0.5) * 8 * strength, 0);
      sp.kick('head', -14 * strength, 0, (Math.random() - 0.5) * 10 * strength);
      sk.ears.forEach((_, i) => sp.kick(`ear${i}`, 12 * strength));
    },
    detach(what) {
      let obj: THREE.Object3D | null = null;
      if (what === 'ear') obj = sk.ears.find((e) => e.visible) ?? null;
      else if (what === 'tooth') obj = sk.teeth.find((t) => t.visible) ?? null;
      else if (what === 'tail') obj = sk.tail.length > 2 && sk.tail[Math.ceil(sk.tail.length / 2)].visible ? sk.tail[Math.ceil(sk.tail.length / 2)] : null;
      else if (what === 'arm') obj = sk.fores[0].visible ? sk.fores[0] : null;
      if (!obj) return null;
      obj.updateWorldMatrix(true, true);
      const copy = obj.clone();
      obj.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      obj.visible = false;
      if (what === 'tail') for (const t of sk.tail.slice(Math.ceil(sk.tail.length / 2))) t.visible = false;
      return copy;
    },
    animate(dt, pose, speed, t, p) {
      sp.begin();
      const fast = pose === 'run' || pose === 'flee';
      phase += dt * (fast ? style.gait : style.gait * 0.6) * Math.min(1, speed + 0.02);
      const sw = Math.sin(phase) * speed;
      const H = style.hunch;
      // Walking: legs pump with knees bending, the body bobs and rolls, arms swing.
      sp.pos('body', 0, Math.abs(Math.cos(phase)) * style.bounce * speed, 0);
      sp.set('body', 0, 0, sw * 0.08);
      sp.set('torso', H + speed * 0.2, -sw * 0.2, 0);
      sp.rot('thighL', sw * style.stride);
      sp.rot('thighR', -sw * style.stride);
      sp.rot('shinL', Math.max(0, Math.cos(phase)) * speed * 0.9);
      sp.rot('shinR', Math.max(0, -Math.cos(phase)) * speed * 0.9);
      sp.rot('armL', -sw * style.armSwing);
      sp.rot('armR', sw * style.armSwing);
      sp.rot('head', Math.cos(phase * 2) * 0.05 * speed, sw * 0.15, 0);
      sk.tail.forEach((_, i) => sp.rot(`tail${i}`, 0, Math.sin(t * 3 + i * 0.7 - phase * 0.5) * (0.25 + 0.2 * speed), 0));
      stars.visible = pose === 'stun';
      if (stars.visible) stars.rotation.y = t * 6;
      const k = Math.min(1, p);
      const kind = MOVE_STYLE[r.move] ?? 'arm';
      let snap = 1;

      switch (pose) {
        case 'idle':
          sp.rot('head', Math.sin(t * 0.9) * 0.1, Math.sin(t * 1.3) * 0.6, Math.sin(t * 0.7) * 0.15);
          sp.set('jaw', Math.max(0, Math.sin(t * 5)) * 0.1);
          sp.set('torso', H + Math.sin(t * 2) * 0.05, Math.sin(t * 0.8) * 0.15, 0);
          sp.rot('armR', Math.sin(t * 3.1) * 0.15);
          break;
        case 'flee':
          sp.rot('armL', -2.6, 0, -0.4);
          sp.rot('armR', -2.6, 0, 0.4);
          sp.set('jaw', 0.45);
          sp.rot('head', 0.2, Math.sin(t * 12) * 0.3, 0);
          break;
        case 'tell':
          switch (kind) {
            case 'arm':
              // Rears back with the right arm high: you can see it coming.
              sp.rot('armR', -2.5 * k, -0.3 * k, 0.9 * k);
              sp.rot('foreR', -1.4 * k);
              sp.set('torso', H - 0.25 * k, -0.5 * k, 0);
              sp.set('jaw', 0.35 * k);
              sp.pos('body', 0, 0, -0.08 * k);
              break;
            case 'arms':
              sp.rot('armR', -2.9 * k, 0, 0.3 * k);
              sp.rot('armL', -2.9 * k, 0, -0.3 * k);
              sp.rot('foreR', -0.6 * k);
              sp.rot('foreL', -0.6 * k);
              sp.set('torso', H - 0.5 * k);
              sp.pos('body', 0, 0.06 * k, -0.1 * k);
              sp.set('jaw', 0.5 * k);
              break;
            case 'head':
              sp.rot('head', -0.6 * k);
              sp.set('jaw', 0.7 * k);
              sp.set('torso', H - 0.25 * k);
              sp.pos('body', 0, 0, -0.1 * k);
              break;
            case 'throw':
              sp.rot('armR', -2.8 * k, 0, 0.5 * k);
              sp.rot('foreR', -1.0 * k);
              sp.set('torso', H - 0.3 * k, -0.7 * k, 0);
              sp.rot('thighL', -0.4 * k);
              break;
            case 'spin':
              sp.set('torso', H, -1.0 * k, 0);
              sp.rot('armR', -1.4 * k, 0, 1.0 * k);
              sp.rot('armL', -1.4 * k, 0, -1.0 * k);
              sp.pos('hips', 0, -0.06 * k, 0);
              break;
            case 'jab':
              sp.rot('armR', -1.3 - 0.2 * k, 0, 0.1);
              sp.rot('foreR', -1.6 * k);
              sp.set('torso', H, 0.5 * k, 0);
              sp.pos('body', 0, 0, -0.1 * k);
              break;
            case 'shove':
              sp.rot('armL', -1.2 * k, 0.4, -0.2);
              sp.rot('foreL', -1.4 * k);
              sp.set('torso', H, -0.4 * k, 0);
              sp.pos('body', 0, 0, -0.08 * k);
              break;
            case 'burrow':
              sp.set('torso', H + 0.8 * k);
              sp.rot('armL', -2.0 * k);
              sp.rot('armR', -2.0 * k);
              sp.pos('body', 0, -0.2 * k + Math.sin(t * 40) * 0.02 * k, 0);
              break;
            default:
              // Crouch low and wiggle, about to spring.
              sp.pos('hips', 0, -0.12 * k, 0);
              sp.set('torso', H + 0.5 * k);
              sp.set('body', 0, 0, Math.sin(t * 30) * 0.08 * k);
              sp.rot('armL', -1.0 * k, 0, -0.4);
              sp.rot('armR', -1.0 * k, 0, 0.4);
              sp.set('jaw', 0.45 * k);
              sp.rot('thighL', -0.9 * k);
              sp.rot('thighR', -0.9 * k);
              sp.rot('shinL', 1.2 * k);
              sp.rot('shinR', 1.2 * k);
          }
          break;
        case 'strike':
          snap = 2;
          switch (kind) {
            case 'arm':
              sp.rot('armR', -0.7, 0.9, -0.6);
              sp.rot('foreR', -0.1);
              sp.set('torso', H + 0.35, 0.6, 0);
              sp.pos('body', 0, -0.03, 0.15);
              break;
            case 'arms':
              sp.rot('armR', -0.6, 0, 0.1);
              sp.rot('armL', -0.6, 0, -0.1);
              sp.set('torso', H + 0.6);
              sp.pos('body', 0, -0.1, 0.12);
              sp.rot('thighL', -0.4);
              sp.rot('shinL', 0.5);
              break;
            case 'head':
              sp.rot('head', 0.5);
              sp.set('jaw', 0.15);
              sp.set('torso', H + 0.4);
              sp.pos('body', 0, -0.02, 0.15);
              break;
            case 'throw':
              sp.rot('armR', -1.2, 0.5, -0.3);
              sp.rot('foreR', 0);
              sp.set('torso', H + 0.3, 0.5, 0);
              break;
            case 'spin':
              sp.rot('armR', -1.5, 0, 1.3);
              sp.rot('armL', -1.5, 0, -1.3);
              sp.set('torso', H, 0.3, 0);
              break;
            case 'jab':
              sp.rot('armR', -1.55, 0, 0);
              sp.rot('foreR', 0);
              sp.set('torso', H + 0.2, -0.3, 0);
              sp.pos('body', 0, -0.04, 0.2);
              sp.rot('thighL', -0.6);
              break;
            case 'shove':
              sp.rot('armL', -1.5, 0, 0);
              sp.rot('foreL', 0);
              sp.set('torso', H + 0.2, 0.3, 0);
              sp.pos('body', 0, 0, 0.18);
              break;
            case 'burrow':
              sp.set('torso', H - 0.3);
              sp.rot('armL', -3, 0, -0.6);
              sp.rot('armR', -3, 0, 0.6);
              sp.set('jaw', 0.7);
              break;
            default:
              sp.set('torso', H + 0.8);
              sp.rot('armL', -2.2, 0, -0.3);
              sp.rot('armR', -2.2, 0, 0.3);
              sp.set('jaw', 0.65);
              sp.rot('thighL', 0.6);
              sp.rot('thighR', 0.6);
          }
          break;
        case 'recover':
          // Off balance, panting: this is your chance.
          sp.set('torso', H + 0.35, Math.sin(t * 2) * 0.1, 0);
          sp.rot('head', 0.4);
          sp.rot('armL', 0.4, 0, -0.4);
          sp.rot('armR', 0.4, 0, 0.4);
          sp.set('jaw', 0.35 + Math.sin(t * 8) * 0.12);
          break;
        case 'hurt':
          sp.set('torso', H - 0.35);
          sp.rot('head', -0.45);
          sp.set('jaw', 0.5);
          sp.pos('body', 0, 0, -0.06);
          break;
        case 'stun':
          sp.set('torso', H - 0.15, 0, Math.sin(t * 5) * 0.2);
          sp.rot('head', 0.15, 0, Math.sin(t * 5 + 1) * 0.35);
          sp.set('jaw', 0.45);
          sp.rot('armL', 0.2, 0, -0.5);
          sp.rot('armR', 0.2, 0, 0.5);
          break;
        case 'dead': {
          const d = Math.min(1, t / 0.5);
          sp.set('body', 0, 0, d * 1.5);
          sp.pos('body', 0, 0.1 * d, 0);
          sp.set('jaw', 0.6);
          sp.rot('thighL', 0.4);
          sk.tail.forEach((_, i) => sp.rot(`tail${i}`, 0, 0, 0));
          break;
        }
        case 'perch':
          sp.pos('hips', 0, -0.06, 0);
          sp.set('torso', H + 0.45);
          sp.set('jaw', 0.5 + Math.sin(t * 20) * 0.1);
          break;
        case 'walk':
        case 'run':
          break;
      }
      style.extra?.(pose, r.move, k, t, sp);
      sp.step(dt, snap);
    },
  };
  return r;
}

// ---------- the five monsters ----------

/** Gribbles: a scrawny, hunched goblin-rat with long clawed arms, bat ears and big teeth. */
function buildGribbles(injuries: Injury[]) {
  const skin = 0x8a9a6a, belly = 0xc8c890, pink = 0xe0a0a0;
  const sk = skeleton({
    skin, hipY: 0.36, thigh: 0.15, shin: 0.17, legR: 0.035, torsoY: 0.38,
    torsoShape: [[0.001, -0.04], [0.16, 0.0], [0.19, 0.12], [0.15, 0.28], [0.08, 0.38], [0.001, 0.4]], torsoColor: skin,
    headY: 0.42, headZ: 0.06, headR: 0.13, shoulder: [0.15, 0.3, 0.02], upperArm: 0.2, foreArm: 0.22, armR: 0.03,
    tailSegs: 6, tailR: 0.022, tailColor: pink,
  });
  const { head, torso, jaw, hips } = sk;
  hips.add(lathe([[0.15, -0.08], [0.13, 0.04], [0.12, 0.08]], 0x5a4430, 9));
  torso.add(oval(0.12, 0.13, 0.06, belly, 0, 0.13, 0.12));
  for (let i = 0; i < 4; i++) torso.add(cone(0.02, 0.06, 0x6a7a4a, 0, 0.08 + i * 0.08, -0.15 + i * 0.01, -1.2));
  head.rotation.x = -0.45;
  head.add(oval(0.13, 0.12, 0.13, skin));
  const snout = lathe([[0.001, 0], [0.035, 0.02], [0.07, 0.14], [0.09, 0.22]], skin, 12);
  snout.rotation.x = -Math.PI / 2;
  snout.position.set(0, -0.03, 0.3);
  head.add(snout);
  head.add(ball(0.03, pink, 0, -0.01, 0.31));
  jaw.position.set(0, -0.06, 0.04);
  jaw.add(oval(0.06, 0.025, 0.16, belly, 0, -0.01, 0.12));
  for (const s of [-1, 1]) {
    const t = part(new THREE.BoxGeometry(0.025, 0.05, 0.012), 0xf4f0e0, s * 0.015, -0.06, 0.27);
    head.add(t);
    sk.teeth.push(t);
  }
  for (let i = 0; i < 4; i++) jaw.add(cone(0.01, 0.03, 0xf4f0e0, -0.03 + i * 0.02, 0.02, 0.08 + (i % 2) * 0.03));
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.22, 0.05, s * 0.26, 0.26);
    shape.quadraticCurveTo(s * 0.12, 0.16, s * 0.04, 0.12);
    shape.lineTo(0, 0);
    const ear = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false }), new THREE.MeshToonMaterial({ color: skin, side: THREE.DoubleSide }));
    ear.position.set(s * 0.08, 0.06, -0.02);
    ear.rotation.set(-0.2, s * 0.4, 0);
    const inner = oval(0.05, 0.07, 0.008, pink, s * 0.13, 0.12, 0.012);
    inner.userData.noInk = true;
    ear.add(inner);
    head.add(ear);
    sk.ears.push(ear);
  }
  eyes(head, 0.06, 0.1, 0.04, 0.042, 0xf0e070, 0xc02020);
  sk.eyeAt.set(-0.04, 0.06, 0.12);
  for (const s of [-1, 1])
    for (const k of [-1, 1]) {
      const wh = part(new THREE.CylinderGeometry(0.003, 0.003, 0.15, 3), INKC, s * 0.08, -0.02 + k * 0.01, 0.24);
      wh.rotation.z = Math.PI / 2 + s * k * 0.2;
      wh.userData.noInk = true;
      head.add(wh);
    }
  for (const h of sk.hands) {
    h.add(ball(0.04, skin));
    for (const k of [-1, 0, 1]) h.add(cone(0.01, 0.08, 0xe8e0c0, k * 0.025, -0.05, 0.02, 0.3));
  }
  return rig(sk, { hunch: 0.45, gait: 15, stride: 0.8, armSwing: 0.7, bounce: 0.05 }, injuries);
}

/** Claught: a huge crab-bear, all fur and shell, with two enormous pincers. */
function buildClaught(injuries: Injury[]) {
  const fur = 0x6a4a32, shell = 0xb84a2a, belly = 0xa88a62;
  const sk = skeleton({
    skin: fur, hipY: 0.42, thigh: 0.18, shin: 0.18, legR: 0.08, torsoY: 0.42,
    torsoShape: [[0.001, -0.05], [0.32, 0.0], [0.38, 0.2], [0.33, 0.45], [0.18, 0.6], [0.001, 0.62]], torsoColor: fur,
    headY: 0.6, headZ: 0.12, headR: 0.17, shoulder: [0.34, 0.45, 0.02], upperArm: 0.26, foreArm: 0.26, armR: 0.06, armColor: shell,
    tailSegs: 0, tailR: 0.05,
  });
  const { head, torso, jaw } = sk;
  // Shell plates on the back, a pale belly, shaggy tufts.
  torso.add(oval(0.36, 0.32, 0.26, shell, 0, 0.3, -0.12));
  for (let i = 0; i < 3; i++) torso.add(part(new THREE.TorusGeometry(0.3 - i * 0.04, 0.02, 4, 16, Math.PI), 0x8a3a1a, 0, 0.2 + i * 0.12, -0.15).rotateY(Math.PI / 2).rotateZ(Math.PI / 2));
  torso.add(oval(0.24, 0.22, 0.1, belly, 0, 0.22, 0.27));
  for (let i = 0; i < 6; i++) torso.add(cone(0.04, 0.12, fur, Math.cos(i) * 0.3, 0.45 + (i % 2) * 0.05, Math.sin(i) * 0.15, 0.3, (i - 2.5) * 0.4));
  head.add(oval(0.17, 0.15, 0.16, fur));
  head.add(oval(0.11, 0.08, 0.1, belly, 0, -0.04, 0.13));
  head.add(oval(0.045, 0.03, 0.03, INKC, 0, -0.01, 0.23));
  for (const s of [-1, 1]) {
    const ear = oval(0.06, 0.06, 0.03, fur, s * 0.13, 0.13, -0.02);
    head.add(ear);
    sk.ears.push(ear);
    const tusk = cone(0.02, 0.09, 0xf0e8d0, s * 0.06, -0.07, 0.19, Math.PI, s * 0.2);
    head.add(tusk);
    sk.teeth.push(tusk);
  }
  jaw.position.set(0, -0.08, 0.06);
  jaw.add(oval(0.09, 0.03, 0.09, belly, 0, 0, 0.06));
  eyes(head, 0.05, 0.13, 0.055, 0.03, 0xf4e8a0, INKC);
  sk.eyeAt.set(-0.055, 0.05, 0.15);
  // The pincers.
  for (const [i, h] of sk.hands.entries()) {
    const big = i === 1 ? 1.15 : 1;
    const g = new THREE.Group();
    g.add(oval(0.11 * big, 0.14 * big, 0.08 * big, shell, 0, -0.08, 0));
    const upper = oval(0.05 * big, 0.17 * big, 0.04 * big, shell, 0.04, -0.25 * big, 0);
    upper.rotation.z = 0.2;
    const lower = oval(0.04 * big, 0.14 * big, 0.035 * big, 0xd06a3a, -0.05, -0.22 * big, 0);
    lower.rotation.z = -0.3;
    g.add(upper, lower);
    h.add(g);
  }
  return rig(sk, { hunch: 0.25, gait: 7, stride: 0.45, armSwing: 0.3, bounce: 0.06 }, injuries, 1.25);
}

/** Zegron: a lanky chameleon with turret eyes, a curly tail and a very long tongue. */
function buildZegron(injuries: Injury[]) {
  const skin = 0x5a9a4a, stripe = 0x3a6a2a, belly = 0xd8d890;
  const sk = skeleton({
    skin, hipY: 0.42, thigh: 0.2, shin: 0.2, legR: 0.03, torsoY: 0.42,
    torsoShape: [[0.001, -0.05], [0.13, 0.0], [0.15, 0.15], [0.12, 0.32], [0.06, 0.42], [0.001, 0.44]], torsoColor: skin,
    headY: 0.45, headZ: 0.08, headR: 0.12, shoulder: [0.12, 0.33, 0.02], upperArm: 0.2, foreArm: 0.2, armR: 0.025,
    tailSegs: 8, tailR: 0.03,
  });
  const { head, torso, jaw } = sk;
  for (let i = 0; i < 3; i++) torso.add(part(new THREE.TorusGeometry(0.135 - i * 0.012, 0.012, 4, 16), stripe, 0, 0.08 + i * 0.1, 0).rotateX(Math.PI / 2));
  torso.add(oval(0.09, 0.15, 0.05, belly, 0, 0.17, 0.1));
  // A crest down the back.
  for (let i = 0; i < 5; i++) torso.add(cone(0.025, 0.08, stripe, 0, 0.42 - i * 0.08, -0.08 - i * 0.015, -0.6));
  head.add(oval(0.12, 0.11, 0.17, skin, 0, 0, 0.05));
  head.add(cone(0.05, 0.12, stripe, 0, 0.1, -0.08, -1.1));
  jaw.position.set(0, -0.05, 0.05);
  jaw.add(oval(0.09, 0.03, 0.14, belly, 0, -0.01, 0.04));
  // The tongue, rolled up in the mouth until it shoots out.
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.02, 0.18);
  const tg = part(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), 0xe06080);
  tg.rotation.x = Math.PI / 2;
  tg.position.z = 0.5;
  tongue.add(tg);
  tongue.add(ball(0.035, 0xe06080, 0, 0, 1));
  tongue.scale.z = 0.01;
  jaw.add(tongue);
  // Turret eyes on cones, each looking its own way.
  const turrets: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(s * 0.1, 0.04, 0.06);
    t.add(oval(0.055, 0.055, 0.055, skin));
    t.add(oval(0.02, 0.02, 0.012, INKC, 0, 0, 0.054));
    head.add(t);
    turrets.push(t);
    sk.ears.push(t);
  }
  sk.eyeAt.set(-0.1, 0.04, 0.12);
  for (const s of [-1, 1]) sk.teeth.push(cone(0.01, 0.03, 0xf0f0e0, s * 0.04, -0.05, 0.17, Math.PI));
  sk.teeth.forEach((t) => head.add(t));
  for (const h of sk.hands) for (const k of [-1, 1]) h.add(cone(0.012, 0.06, skin, k * 0.02, -0.03, 0, 0, k * 0.4));
  return rig(sk, {
    hunch: 0.3, gait: 12, stride: 0.75, armSwing: 0.5, bounce: 0.03,
    extra(pose, move, p, t) {
      turrets[0].rotation.set(Math.sin(t * 1.7) * 0.6, Math.sin(t * 1.1) * 0.8, 0);
      turrets[1].rotation.set(Math.cos(t * 1.3) * 0.6, Math.cos(t * 0.9) * 0.8, 0);
      // Out shoots the tongue.
      const out = move === 'tongue' && pose === 'strike' ? 2.3 : move === 'tongue' && pose === 'tell' ? 0.05 + p * 0.1 : 0.01;
      tongue.scale.z += (out - tongue.scale.z) * 0.5;
    },
  }, injuries, 1.1);
}

/** Sieger: an armoured beetle-knight with a horn, a lance and a round shield. Wings for diving. */
function buildSieger(injuries: Injury[]) {
  const shellC = 0x2a3a5a, under = 0x5a4a3a, legC = 0x2a2420;
  const sk = skeleton({
    skin: legC, hipY: 0.4, thigh: 0.17, shin: 0.18, legR: 0.035, torsoY: 0.4,
    torsoShape: [[0.001, -0.05], [0.2, 0.0], [0.23, 0.18], [0.2, 0.36], [0.1, 0.46], [0.001, 0.47]], torsoColor: under,
    headY: 0.5, headZ: 0.06, headR: 0.12, shoulder: [0.22, 0.34, 0.04], upperArm: 0.18, foreArm: 0.18, armR: 0.03,
    tailSegs: 0, tailR: 0.03,
  });
  const { head, torso, jaw } = sk;
  // The shiny carapace: two halves that open into wings.
  const mat = new THREE.MeshToonMaterial({ color: shellC, emissive: 0x0a1020 });
  const halves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.02, 0.45, -0.05);
    const half = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, s > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI * 0.55), mat);
    half.scale.set(1, 1.6, 0.9);
    half.rotation.x = Math.PI * 0.95;
    half.position.set(-s * 0.02, -0.18, -0.02);
    pivot.add(half);
    torso.add(pivot);
    halves.push(pivot);
  }
  torso.add(part(new THREE.BoxGeometry(0.01, 0.5, 0.01), INKC, 0, 0.25, -0.27));
  // Thin wings, folded away.
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.6), new THREE.MeshBasicMaterial({ color: 0xd0e0f0, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    w.position.set(s * 0.18, 0.35, -0.2);
    w.rotation.set(-0.4, 0, s * 0.9);
    w.visible = false;
    torso.add(w);
    wings.push(w);
  }
  head.add(oval(0.12, 0.1, 0.13, shellC));
  const horn = lathe([[0.04, 0], [0.03, 0.12], [0.01, 0.24], [0.001, 0.28]], 0x1a2030, 8);
  horn.position.set(0, 0.05, 0.08);
  horn.rotation.x = 0.6;
  head.add(horn);
  sk.teeth.push(horn);
  jaw.position.set(0, -0.05, 0.08);
  for (const s of [-1, 1]) jaw.add(cone(0.015, 0.07, INKC, s * 0.04, 0, 0.06, Math.PI / 2, -s * 0.5));
  eyes(head, 0.03, 0.1, 0.06, 0.03, 0xffe080, 0x8a2a1a);
  sk.eyeAt.set(-0.06, 0.03, 0.12);
  for (const s of [-1, 1]) {
    const ant = part(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 3), INKC, s * 0.06, 0.13, 0.02);
    ant.rotation.set(-0.5, 0, -s * 0.4);
    head.add(ant);
    sk.ears.push(ant);
  }
  // Lance and shield.
  const lance = lathe([[0.03, 0], [0.02, 0.3], [0.004, 0.9]], 0xb8bcc4, 8);
  lance.rotation.x = Math.PI / 2;
  sk.hands[1].add(lance);
  sk.hands[1].add(part(new THREE.ConeGeometry(0.06, 0.07, 10), 0x8a8a92).rotateX(-Math.PI / 2));
  const shield = new THREE.Group();
  const face = part(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18), 0x8a2a2a);
  face.rotation.x = Math.PI / 2;
  shield.add(face, part(new THREE.TorusGeometry(0.17, 0.015, 6, 18), 0xc8a040));
  shield.position.set(0, 0, 0.06);
  sk.hands[0].add(shield);
  return rig(sk, {
    hunch: 0.15, gait: 10, stride: 0.6, armSwing: 0.25, bounce: 0.03,
    extra(pose, move, p, t) {
      // Shell halves part and wings buzz when it flies or charges.
      const fly = (move === 'dive' && (pose === 'tell' || pose === 'strike')) || (move === 'charge' && pose === 'strike');
      for (const [i, h] of halves.entries()) h.rotation.z += ((fly ? (i ? -0.9 : 0.9) : 0) - h.rotation.z) * 0.3;
      for (const [i, w] of wings.entries()) {
        w.visible = fly;
        w.rotation.y = Math.sin(t * 60 + i) * 0.5;
      }
      void p;
    },
  }, injuries, 1.15);
}

/** Slashner: a tall, ragged scarecrow with a stitched sack head and blades for hands. */
function buildSlashner(injuries: Injury[]) {
  const coat = 0x4a3a4a, sack = 0xc8a878, straw = 0xe0c060, stick = 0x6a4a2a;
  const sk = skeleton({
    skin: stick, hipY: 0.62, thigh: 0.28, shin: 0.3, legR: 0.025, torsoY: 0.6,
    torsoShape: [[0.001, -0.25], [0.2, -0.25], [0.15, 0.1], [0.14, 0.4], [0.07, 0.55], [0.001, 0.56]], torsoColor: coat,
    headY: 0.66, headZ: 0.02, headR: 0.15, shoulder: [0.17, 0.48, 0], upperArm: 0.3, foreArm: 0.28, armR: 0.025, armColor: coat,
    tailSegs: 0, tailR: 0.02, footColor: 0x2a2020,
  });
  const { head, torso, jaw } = sk;
  // Ragged coat tails, patches, straw poking out everywhere.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    torso.add(cone(0.04, 0.16, coat, Math.cos(a) * 0.19, -0.3, Math.sin(a) * 0.19, Math.PI));
  }
  torso.add(part(new THREE.BoxGeometry(0.08, 0.07, 0.01), 0x6a5a3a, 0.06, 0.2, 0.145).rotateZ(0.3));
  for (let i = 0; i < 8; i++) torso.add(cone(0.012, 0.12, straw, Math.cos(i * 1.7) * 0.12, 0.5, Math.sin(i * 1.7) * 0.08, Math.sin(i) * 0.8, Math.cos(i) * 1.2));
  // A lumpy sack head, button eyes, a stitched grin.
  head.add(oval(0.15, 0.17, 0.14, sack));
  head.add(cone(0.06, 0.08, sack, 0, 0.17, 0, 0, 0.3));
  for (const s of [-1, 1]) {
    const button = part(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 10), s < 0 ? 0x2a2a2a : 0x8a2a2a, s * 0.06, 0.04, 0.13);
    button.rotation.x = Math.PI / 2;
    head.add(button);
    if (s > 0) sk.ears.push(button);
  }
  sk.eyeAt.set(-0.06, 0.04, 0.14);
  jaw.position.set(0, -0.06, 0.12);
  jaw.add(part(new THREE.BoxGeometry(0.16, 0.012, 0.01), INKC));
  for (let i = 0; i < 5; i++) {
    const st = part(new THREE.BoxGeometry(0.006, 0.04, 0.01), INKC, -0.07 + i * 0.035, 0, 0.005);
    jaw.add(st);
    sk.teeth.push(st);
  }
  // A floppy hat.
  const hat = new THREE.Group();
  hat.add(part(new THREE.CylinderGeometry(0.26, 0.28, 0.02, 16), 0x3a2a2a));
  const crown = cone(0.13, 0.25, 0x3a2a2a, 0.03, 0.12, 0, 0, -0.35);
  hat.add(crown);
  hat.position.y = 0.14;
  hat.rotation.z = 0.2;
  head.add(hat);
  // Blades for hands.
  for (const h of sk.hands) {
    const blade = new THREE.Shape();
    blade.moveTo(0, 0);
    blade.quadraticCurveTo(0.12, -0.25, 0.02, -0.5);
    blade.quadraticCurveTo(0.03, -0.25, -0.03, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.01, bevelEnabled: false }), toon(0xc8ccd4));
    m.position.z = -0.005;
    h.add(m);
    h.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), 0x5a3a2a));
  }
  return rig(sk, { hunch: 0.12, gait: 11, stride: 0.6, armSwing: 0.6, bounce: 0.04 }, injuries, 1.15);
}

export const MONSTER_MODELS: Record<MonsterName, (injuries: Injury[]) => MonsterRig> = {
  Gribbles: buildGribbles,
  Claught: buildClaught,
  Zegron: buildZegron,
  Sieger: buildSieger,
  Slashner: buildSlashner,
};

/** Gribbles' rats: big nasty versions of the house mice. */
export function buildRat(): MonsterRig {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const furC = 0x5a524c;
  g.add(oval(0.11, 0.09, 0.2, furC, 0, 0.12, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0.2);
  g.add(head);
  head.add(oval(0.07, 0.06, 0.1, furC, 0, 0, 0.04));
  head.add(ball(0.02, 0xe07080, 0, 0, 0.14));
  for (const s of [-1, 1]) {
    head.add(oval(0.035, 0.035, 0.008, 0xd09090, s * 0.05, 0.06, 0));
    const e = ball(0.014, 0xff3030, s * 0.035, 0.03, 0.09);
    e.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2), toneMapped: false });
    head.add(e);
  }
  const tail = part(new THREE.CylinderGeometry(0.006, 0.014, 0.35, 5), 0xd09090, 0, 0.08, -0.32);
  tail.rotation.x = 1.4;
  g.add(tail);
  const headTop = new THREE.Object3D();
  headTop.position.y = 0.4;
  root.add(headTop);
  ink(root);
  const stars = makeStars();
  head.add(stars);
  return {
    root,
    headTop,
    move: 'bite',
    stars,
    detach: () => null,
    flinch() {},
    animate(_dt, pose, speed, t, p) {
      g.position.y = Math.abs(Math.sin(t * 24)) * 0.03 * speed;
      g.rotation.set(0, 0, 0);
      head.rotation.x = pose === 'tell' ? -0.4 * Math.min(1, p) : pose === 'strike' ? 0.3 : 0;
      tail.rotation.z = Math.sin(t * 8) * 0.3;
      stars.visible = pose === 'stun';
      if (pose === 'dead') g.rotation.z = Math.min(1, t / 0.3) * Math.PI;
    },
  };
}
