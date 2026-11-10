// The animal footballers: big heads and eyes (they're small on screen), a kit with a number on the
// back, and a silhouette that tells the animals apart from far away (ears, beaks, snouts, tails).
// Built facing +z with the feet at y = 0; the character's left is +x.
import * as THREE from 'three';
import type { Animal, Kit, Team } from '../data/teams';
import { ball, canvasTexture, cyl, limb, part, rbox, toon, v3 } from '../world/toon';

export type Pose =
  | 'idle' | 'run' | 'kick' | 'tackle' | 'slide' | 'down' | 'dive' | 'hold' | 'throw' | 'celebrate' | 'header' | 'stunned'
  | 'card' | 'point'
  // Goal celebrations (and the long faces of the team that let one in).
  | 'kneeslide' | 'airplane' | 'flip' | 'dance' | 'belly' | 'spin' | 'clap' | 'sad';

export interface PoseInput {
  pose: Pose;
  /** Seconds since the pose started. */
  t: number;
  /** Ground speed (m/s). */
  speed: number;
  /** Run cycle (radians, grows with distance run). */
  phase: number;
  /** How they're feeling (the face, ears and tail show it). */
  mood?: Mood;
  /** Dive direction: +1 to their left, -1 to their right. */
  side?: number;
  /** Head turn toward the ball (radians, relative to the body). */
  look?: number;
  /** Kicks: when the foot meets the ball (seconds into the pose), how hard, and what kind. */
  kick?: { contact: number; power: number; kind: KickStyle };
  /** A dribbling touch (1 just now, fading to 0), and which foot (+1 left, -1 right). */
  touch?: number;
  touchFoot?: number;
  /** Leaning into a turn (+ tips them to their right) and into speeding up (+ forward). */
  lean?: { side: number; fwd: number };
}

export type KickStyle = 'pass' | 'shot' | 'lob';
export type Mood = 'happy' | 'sad' | 'ouch' | 'effort';

const darker = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

const numberCache = new Map<string, THREE.Texture>();
function numberTexture(n: number, kit: Kit) {
  const key = `${n}:${kit.number}:${kit.shirt}`;
  let t = numberCache.get(key);
  if (!t) {
    t = canvasTexture(128, 128, (g) => {
      g.fillStyle = `#${kit.shirt.toString(16).padStart(6, '0')}`;
      g.fillRect(0, 0, 128, 128);
      g.font = '900 96px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = `#${kit.trim.toString(16).padStart(6, '0')}`;
      g.fillStyle = `#${kit.number.toString(16).padStart(6, '0')}`;
      if (kit.trim !== kit.number) g.strokeText(String(n), 64, 70);
      g.fillText(String(n), 64, 70);
    });
    numberCache.set(key, t);
  }
  return t;
}

/** The moving bits of a face (blinks, expressions) and of the head (ears). */
interface FaceParts {
  /** One group per eye, centred on it (squashed to blink or squint). */
  eyes: THREE.Group[];
  /** Eyebrows, with which side they're on (+1 the character's left). */
  brows: { mesh: THREE.Mesh; side: number; y: number }[];
  /** Ears (each on a pivot at its root), with their resting angles. */
  ears: { pivot: THREE.Object3D; side: number; rx: number; rz: number }[];
  /** A mouth that only shows with feelings (a grin, a frown, an "ow", gritted teeth). */
  mouth?: { smile: THREE.Mesh; teeth: THREE.Mesh };
  /** A lower beak that drops open (the duck). */
  jaw?: { obj: THREE.Object3D; y: number; inside: THREE.Object3D };
}
const newFace = (): FaceParts => ({ eyes: [], brows: [], ears: [] });

/** The mouth: a half disc (a grin; turned over, a frown) with a tongue, and a row of teeth. */
function mouth(head: THREE.Group, face: FaceParts, y: number, z: number, w = 0.05, tilt = 0.35) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  g.rotation.x = tilt;
  const smile = new THREE.Mesh(new THREE.CircleGeometry(w, 20, Math.PI, Math.PI), toon(0x4a1418));
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(w * 0.55, 16, Math.PI, Math.PI), toon(0xe8607a));
  tongue.position.set(0, -w * 0.42, 0.002);
  tongue.scale.y = 0.6;
  smile.add(tongue);
  const teeth = rbox(w * 1.7, w * 0.42, 0.012, 0xfcfcf4, 0, -w * 0.15, 0.004, 0.005);
  g.add(smile, teeth);
  smile.scale.setScalar(0.001);
  teeth.scale.setScalar(0.001);
  head.add(g);
  face.mouth = { smile, teeth };
}

/** Group meshes under a pivot at (x, y, z) on the head, so they swing from there. */
function pivotAt(head: THREE.Group, x: number, y: number, z: number, ...objs: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const o of objs) {
    o.position.x -= x; o.position.y -= y; o.position.z -= z;
    g.add(o);
  }
  head.add(g);
  return g;
}
function addEar(face: FaceParts, head: THREE.Group, side: number, x: number, y: number, z: number, ...objs: THREE.Object3D[]) {
  const pivot = pivotAt(head, x, y, z, ...objs);
  face.ears.push({ pivot, side, rx: pivot.rotation.x, rz: pivot.rotation.z });
}

/** Big round eyes with pupils and a highlight, and cross eyebrows. */
function eyes(head: THREE.Group, face: FaceParts, faceZ: number, browColor: number, gap = 0.072, y = 0.22) {
  for (const s of [-1, 1]) {
    const eye = ball(0.05, 0xfdfdf8, s * gap, y, faceZ);
    eye.scale.set(1, 1.18, 0.55);
    const pupil = ball(0.027, 0x14100e, s * gap * 0.96, y - 0.004, faceZ + 0.024);
    pupil.scale.set(1, 1.2, 0.6);
    const shine = ball(0.009, 0xffffff, s * gap * 0.96 + 0.01, y + 0.014, faceZ + 0.036);
    face.eyes.push(pivotAt(head, s * gap, y, faceZ, eye, pupil, shine));
    const brow = rbox(0.07, 0.02, 0.02, browColor, s * gap, y + 0.075, faceZ - 0.005, 0.008);
    brow.rotation.z = s * 0.22;
    head.add(brow);
    face.brows.push({ mesh: brow, side: s, y: brow.position.y });
  }
}

function whiskers(head: THREE.Group, y: number, z: number, color = 0x2a2420) {
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      head.add(limb(v3(s * 0.05, y, z), v3(s * 0.19, y + k * 0.03, z - 0.04), 0.004, color));
    }
  }
}

/** A tail as a tube along points (relative to the hips, behind). */
function tail(points: THREE.Vector3[], r: number, color: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  return part(new THREE.TubeGeometry(curve, 16, r, 8, false), color);
}

function buildHead(team: Team): { head: THREE.Group; tailPart: THREE.Object3D | null; face: FaceParts } {
  const head = new THREE.Group();
  const face = newFace();
  const fur = team.fur, fur2 = team.fur2, dark = darker(fur, 0.55);
  const R = 0.2;
  let tailPart: THREE.Object3D | null = null;
  const skull = (sx: number, sy: number, sz: number, r = R) => {
    const s = ball(r, fur, 0, 0.18, 0);
    s.scale.set(sx, sy, sz);
    head.add(s);
  };
  switch (team.id as Animal) {
    case 'bunny': {
      skull(1, 0.95, 0.95);
      for (const s of [-1, 1]) {
        head.add(ball(0.07, fur, s * 0.075, 0.1, 0.13));
        // Long ears, a little floppy at the tips.
        const ear = new THREE.Group();
        ear.add(limb(v3(0, 0, 0), v3(s * 0.03, 0.26, -0.03), 0.045, fur));
        const inner = limb(v3(0, 0.02, 0.022), v3(s * 0.03, 0.24, -0.008), 0.026, fur2);
        ear.add(inner);
        ear.position.set(s * 0.07, 0.33, -0.02);
        ear.rotation.z = -s * 0.2;
        head.add(ear);
        face.ears.push({ pivot: ear, side: s, rx: 0, rz: ear.rotation.z });
      }
      head.add(ball(0.026, 0xe86a8a, 0, 0.14, 0.2));
      mouth(head, face, 0.075, 0.172, 0.045);
      head.add(rbox(0.045, 0.035, 0.012, 0xffffff, 0, 0.085, 0.178, 0.006));
      eyes(head, face, 0.15, darker(fur, 0.6));
      tailPart = ball(0.075, 0xffffff, 0, 0.0, -0.15);
      break;
    }
    case 'pig': {
      skull(1.1, 0.95, 1);
      const snout = cyl(0.075, 0.08, 0.08, fur2, 0, 0, 0);
      snout.geometry.translate(0, -0.04, 0);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.12, 0.21);
      head.add(snout);
      for (const s of [-1, 1]) {
        head.add(ball(0.016, 0x5a2a30, s * 0.027, 0.12, 0.252));
        const ear = part(new THREE.ConeGeometry(0.08, 0.16, 4), darker(fur, 0.92));
        ear.scale.z = 0.4;
        ear.position.set(s * 0.17, 0.38, 0.02);
        ear.rotation.set(0.5, 0, -s * 0.75);
        addEar(face, head, s, s * 0.13, 0.33, 0.0, ear);
      }
      eyes(head, face, 0.155, dark, 0.075, 0.235);
      mouth(head, face, 0.035, 0.168, 0.05, 0.6);
      tailPart = part(new THREE.TorusGeometry(0.035, 0.012, 6, 14, Math.PI * 1.7), fur);
      tailPart.position.set(0, 0.02, -0.14);
      break;
    }
    case 'dog': {
      skull(1, 0.95, 0.95);
      const muzzle = ball(0.09, fur2, 0, 0.11, 0.15);
      muzzle.scale.set(1, 0.8, 1.25);
      head.add(muzzle);
      head.add(ball(0.036, 0x1a1414, 0, 0.14, 0.26));
      const tongue = rbox(0.04, 0.012, 0.05, 0xe86070, 0.025, 0.055, 0.22, 0.006);
      tongue.rotation.x = 0.6;
      head.add(tongue);
      mouth(head, face, 0.058, 0.215, 0.05, 0.5);
      // A patch over one eye.
      const patch = ball(0.07, dark, 0.075, 0.23, 0.13);
      patch.scale.set(1, 1, 0.5);
      head.add(patch);
      for (const s of [-1, 1]) {
        const ear = rbox(0.07, 0.2, 0.045, dark, s * 0.2, 0.17, -0.01, 0.03);
        ear.geometry.translate(0, -0.08, 0);
        ear.position.y = 0.3;
        ear.rotation.z = s * 0.28;
        head.add(ear);
        face.ears.push({ pivot: ear, side: s, rx: 0, rz: ear.rotation.z });
      }
      eyes(head, face, 0.16, dark);
      tailPart = limb(v3(0, 0, -0.12), v3(0, 0.16, -0.22), 0.03, fur);
      break;
    }
    case 'cat': {
      skull(1.1, 0.95, 0.95, 0.19);
      for (const s of [-1, 1]) {
        const ear = part(new THREE.ConeGeometry(0.07, 0.15, 4), fur);
        ear.position.set(s * 0.115, 0.34, 0);
        ear.rotation.set(0, Math.PI / 4, -s * 0.3);
        const inner = part(new THREE.ConeGeometry(0.04, 0.09, 4), 0xf4a0b0);
        inner.position.set(s * 0.112, 0.32, 0.03);
        inner.rotation.set(0, Math.PI / 4, -s * 0.3);
        addEar(face, head, s, s * 0.1, 0.28, 0.01, ear, inner);
        const cheek = ball(0.045, fur2, s * 0.032, 0.11, 0.16);
        head.add(cheek);
      }
      head.add(ball(0.02, 0xe8708a, 0, 0.145, 0.19));
      // Tabby stripes on the forehead.
      for (const x of [-0.04, 0, 0.04]) head.add(rbox(0.018, 0.06, 0.02, dark, x, 0.33, 0.1, 0.008));
      whiskers(head, 0.11, 0.18);
      mouth(head, face, 0.068, 0.172, 0.04, 0.5);
      eyes(head, face, 0.15, dark, 0.075, 0.225);
      tailPart = tail([v3(0, 0, -0.12), v3(0, 0.05, -0.28), v3(0, 0.25, -0.32), v3(0.05, 0.38, -0.25)], 0.025, fur);
      break;
    }
    case 'duck': {
      skull(1, 1.02, 0.98);
      // A big flat beak.
      const upper = ball(0.1, fur2, 0, 0.12, 0.2);
      upper.scale.set(1.15, 0.3, 1.25);
      head.add(upper);
      const lower = ball(0.085, darker(fur2, 0.85), 0, 0.09, 0.19);
      lower.scale.set(1.05, 0.25, 1.15);
      head.add(lower);
      // Inside the beak (seen when it opens).
      const inside = ball(0.07, 0x4a1418, 0, 0.1, 0.19);
      inside.scale.set(1, 0.3, 1.1);
      head.add(inside);
      face.jaw = { obj: lower, y: lower.position.y, inside };
      const tufts: THREE.Object3D[] = [];
      for (let i = -1; i <= 1; i++) {
        const tuft = part(new THREE.ConeGeometry(0.02, 0.1, 5), fur);
        tuft.position.set(i * 0.03, 0.41, -0.01);
        tuft.rotation.z = -i * 0.4;
        tuft.rotation.x = -0.3;
        tufts.push(tuft);
      }
      addEar(face, head, 0, 0, 0.37, -0.01, ...tufts);
      eyes(head, face, 0.15, darker(fur2, 0.6), 0.075, 0.245);
      tailPart = part(new THREE.ConeGeometry(0.07, 0.14, 6), fur);
      tailPart.position.set(0, 0.06, -0.15);
      tailPart.rotation.x = -2.2;
      break;
    }
    case 'raccoon': {
      skull(1.12, 0.92, 0.95);
      const muzzle = ball(0.08, fur2, 0, 0.11, 0.15);
      muzzle.scale.set(1, 0.75, 1.15);
      head.add(muzzle);
      head.add(ball(0.03, 0x1a1414, 0, 0.14, 0.24));
      mouth(head, face, 0.06, 0.2, 0.045, 0.5);
      // The bandit mask.
      for (const s of [-1, 1]) {
        const m = ball(0.07, 0x26222a, s * 0.075, 0.22, 0.13);
        m.scale.set(1.35, 0.8, 0.55);
        head.add(m);
        head.add(ball(0.03, fur2, s * 0.08, 0.3, 0.14));
        const ear = part(new THREE.ConeGeometry(0.06, 0.11, 5), fur);
        ear.position.set(s * 0.13, 0.35, -0.02);
        ear.rotation.z = -s * 0.35;
        const rim = part(new THREE.ConeGeometry(0.035, 0.07, 5), fur2);
        rim.position.set(s * 0.128, 0.345, 0.012);
        rim.rotation.z = -s * 0.35;
        addEar(face, head, s, s * 0.115, 0.3, -0.01, ear, rim);
      }
      eyes(head, face, 0.15, 0x26222a);
      // A ringed tail.
      const t = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const seg = cyl(0.05 - i * 0.003, 0.05 - i * 0.003, 0.07, i % 2 ? 0x26222a : fur, 0, i * 0.065, 0);
        t.add(seg);
      }
      t.position.set(0, 0.0, -0.14);
      t.rotation.x = -0.9;
      tailPart = t;
      break;
    }
    case 'bear': {
      skull(1.05, 0.98, 1, 0.21);
      const muzzle = ball(0.09, fur2, 0, 0.11, 0.16);
      muzzle.scale.set(1, 0.8, 1.1);
      head.add(muzzle);
      head.add(ball(0.036, 0x1a1414, 0, 0.145, 0.245));
      mouth(head, face, 0.055, 0.215, 0.05, 0.5);
      for (const s of [-1, 1]) {
        const ear = ball(0.07, fur, s * 0.15, 0.34, -0.01);
        ear.scale.z = 0.6;
        const inner = ball(0.04, fur2, s * 0.15, 0.335, 0.02);
        inner.scale.z = 0.4;
        addEar(face, head, s, s * 0.13, 0.3, 0, ear, inner);
      }
      eyes(head, face, 0.17, darker(fur, 0.5), 0.078, 0.235);
      tailPart = ball(0.05, fur, 0, 0.02, -0.15);
      break;
    }
    case 'owl': {
      // Round, with a pale face disc, huge eyes, a little hooked beak and ear tufts.
      skull(1.08, 1, 0.98, 0.21);
      const disc = ball(0.16, fur2, 0, 0.2, 0.1);
      disc.scale.set(1.25, 1, 0.55);
      head.add(disc);
      for (const s of [-1, 1]) {
        const eye = ball(0.068, 0xfdfdf8, s * 0.075, 0.22, 0.165);
        eye.scale.z = 0.5;
        face.eyes.push(pivotAt(head, s * 0.075, 0.22, 0.17, eye, ball(0.042, 0xf0a820, s * 0.075, 0.22, 0.188),
          ball(0.024, 0x14100e, s * 0.075, 0.22, 0.205), ball(0.008, 0xffffff, s * 0.075 + 0.01, 0.234, 0.212)));
        const brow = rbox(0.09, 0.022, 0.02, darker(fur, 0.5), s * 0.075, 0.305, 0.16, 0.008);
        brow.rotation.z = s * 0.3;
        head.add(brow);
        face.brows.push({ mesh: brow, side: s, y: brow.position.y });
        const tuft = part(new THREE.ConeGeometry(0.04, 0.13, 6), fur);
        tuft.position.set(s * 0.13, 0.42, 0);
        tuft.rotation.z = -s * 0.45;
        addEar(face, head, s, s * 0.11, 0.36, 0, tuft);
      }
      const beak = part(new THREE.ConeGeometry(0.03, 0.09, 8), 0xe8a020);
      beak.rotation.x = Math.PI * 0.85;
      beak.position.set(0, 0.15, 0.2);
      head.add(beak);
      break;
    }
    case 'mouse': {
      skull(1, 0.95, 1.08, 0.18);
      const snout = part(new THREE.ConeGeometry(0.08, 0.16, 12), fur);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.12, 0.24);
      head.add(snout);
      head.add(ball(0.026, 0xf07a90, 0, 0.12, 0.32));
      for (const s of [-1, 1]) {
        // Huge round ears.
        const ear = cyl(0.125, 0.125, 0.025, fur, 0, 0, 0, 20);
        ear.rotation.x = Math.PI / 2;
        ear.position.set(s * 0.17, 0.36, -0.03);
        ear.rotation.z = -s * 0.25;
        const inner = cyl(0.085, 0.085, 0.01, fur2, 0, 0, 0, 20);
        inner.rotation.x = Math.PI / 2;
        inner.position.set(s * 0.168, 0.36, -0.012);
        inner.rotation.z = -s * 0.25;
        addEar(face, head, s, s * 0.12, 0.27, -0.02, ear, inner);
      }
      whiskers(head, 0.12, 0.25);
      mouth(head, face, 0.03, 0.165, 0.04, 0.6);
      eyes(head, face, 0.15, darker(fur, 0.5), 0.07, 0.24);
      tailPart = tail([v3(0, 0, -0.12), v3(0, -0.12, -0.3), v3(0.08, -0.2, -0.5), v3(0.18, -0.22, -0.6)], 0.012, fur2);
      break;
    }
  }
  return { head, tailPart, face };
}

/** Joints we animate, and how quickly they follow their targets. */
type Channel = [THREE.Object3D, 'x' | 'y' | 'z', 'rot' | 'pos'];

export class PlayerRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly kneeL = new THREE.Group();
  readonly kneeR = new THREE.Group();
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();
  private ring: THREE.Mesh | null = null;
  private card: THREE.Mesh | null = null;
  private channels: Channel[];
  private targets: number[];
  /** Eyes, brows and ears, and the tail's pivot (for blinks, expressions, wags). */
  private face: FaceParts;
  private tail: THREE.Group | null = null;
  private clock = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blinkT = 1;
  private twitchIn = 2 + Math.random() * 4;
  private twitchT = 1;
  private twitchSide = 1;
  /** Smoothed expression amounts. */
  private ex = { happy: 0, sad: 0, ouch: 0, effort: 0 };

  constructor(readonly team: Team, kit: Kit, readonly number: number, keeper = false) {
    const fat = team.id === 'bear' || team.id === 'pig' ? 1.12 : 1;
    this.root.add(this.body);
    this.body.position.y = 0.33;
    this.body.add(this.torso);

    // Shorts and legs (fur, then socks, then boots).
    this.body.add(rbox(0.3 * fat, 0.14, 0.21 * fat, kit.shorts, 0, 0.04, 0, 0.05));
    // Thigh from the hip, then a knee joint carrying the sock and boot (so legs can bend).
    for (const [leg, knee, s] of [[this.legL, this.kneeL, 1], [this.legR, this.kneeR, -1]] as const) {
      leg.position.set(s * 0.08 * fat, 0, 0);
      leg.add(limb(v3(0, -0.02, 0), v3(0, -0.17, 0), 0.052, team.fur));
      knee.position.set(0, -0.17, 0);
      knee.add(ball(0.053, team.fur, 0, 0, 0));
      knee.add(cyl(0.057, 0.052, 0.15, kit.socks, 0, -0.13, 0));
      knee.add(rbox(0.1, 0.075, 0.17, 0x1c1a1a, 0, -0.123, 0.03, 0.03));
      leg.add(knee);
      this.body.add(leg);
    }

    // Shirt, collar, number.
    this.torso.position.y = 0.08;
    this.torso.add(rbox(0.33 * fat, 0.3, 0.22 * fat, kit.shirt, 0, 0.14, 0, 0.09));
    this.torso.add(cyl(0.08, 0.09, 0.03, kit.trim, 0, 0.28, 0));
    if (number > 0) {
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), toon(0xffffff));
      (num.material as THREE.MeshToonMaterial) = new THREE.MeshToonMaterial({ map: numberTexture(number, kit), color: 0xffffff });
      num.position.set(0, 0.15, -0.111 * fat - 0.003);
      num.rotation.y = Math.PI;
      this.torso.add(num);
    }

    // Arms: sleeve, furry forearm, hand (gloves for the keeper).
    for (const [arm, hand, s] of [[this.armL, this.handL, 1], [this.armR, this.handR, -1]] as const) {
      arm.position.set(s * 0.18 * fat, 0.26, 0);
      arm.add(cyl(0.058, 0.06, 0.11, kit.shirt, 0, -0.1, 0));
      arm.add(cyl(0.062, 0.062, 0.02, kit.trim, 0, -0.11, 0));
      arm.add(limb(v3(0, -0.1, 0), v3(0, -0.19, 0), 0.042, team.fur));
      arm.add(ball(keeper ? 0.066 : 0.05, keeper ? 0xf4f4f4 : team.fur, 0, -0.24, 0));
      hand.position.set(0, -0.26, 0);
      arm.add(hand);
      this.torso.add(arm);
    }

    const { head, tailPart, face } = buildHead(team);
    this.face = face;
    this.head.add(head);
    this.head.position.y = 0.29;
    this.torso.add(this.head);
    if (tailPart) {
      tailPart.position.y += 0.02;
      tailPart.position.z *= fat;
      // On its own pivot at the hips, so it can wag.
      this.tail = new THREE.Group();
      this.tail.position.set(0, 0.02, -0.1 * fat);
      tailPart.position.y -= 0.02;
      tailPart.position.z += 0.1 * fat;
      this.tail.add(tailPart);
      this.body.add(this.tail);
    }

    this.channels = [
      [this.body, 'y', 'pos'], [this.body, 'x', 'rot'], [this.body, 'z', 'rot'],
      [this.torso, 'x', 'rot'], [this.torso, 'y', 'rot'],
      [this.head, 'x', 'rot'], [this.head, 'y', 'rot'],
      [this.armL, 'x', 'rot'], [this.armL, 'z', 'rot'], [this.armR, 'x', 'rot'], [this.armR, 'z', 'rot'],
      [this.legL, 'x', 'rot'], [this.legL, 'z', 'rot'], [this.legR, 'x', 'rot'], [this.legR, 'z', 'rot'],
      [this.kneeL, 'x', 'rot'], [this.kneeR, 'x', 'rot'], [this.torso, 'z', 'rot'],
    ];
    this.targets = this.channels.map(([o, a, k]) => (k === 'pos' ? o.position[a] : o.rotation[a]));
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = false; }
    });
  }

  /** A card held in the right hand (the referee's yellow or red), or none. */
  setCard(color: number | null) {
    if (color === null) { if (this.card) this.card.visible = false; return; }
    if (!this.card) {
      this.card = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.012), new THREE.MeshBasicMaterial({ color }));
      this.card.position.set(0, -0.08, 0.02);
      this.handR.add(this.card);
    }
    (this.card.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.card.visible = true;
  }

  /** A coloured ring on the grass under the player you control. */
  setMarker(color: number | null) {
    if (color === null) {
      if (this.ring) this.ring.visible = false;
      return;
    }
    if (!this.ring) {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.02;
      this.ring.renderOrder = 2;
      this.root.add(this.ring);
    }
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.ring.visible = true;
  }

  /** Pose the joints (smoothly: they ease toward where the pose wants them). */
  animate(p: PoseInput, dt: number) {
    const tg = {
      bodyY: 0.33, bodyX: 0, bodyZ: 0, torsoX: 0, torsoY: 0, headX: 0, headY: p.look ?? 0,
      armLX: 0, armLZ: 0.12, armRX: 0, armRZ: -0.12, legLX: 0, legLZ: 0, legRX: 0, legRZ: 0,
      kneeLX: 0, kneeRX: 0, torsoZ: 0,
    };
    const run = Math.min(1, p.speed / 7);
    const ease = (u: number) => u * u * (3 - 2 * u);
    let snap = false;
    switch (p.pose) {
      case 'idle': {
        // Ready stance: knees soft, a little breathing.
        const b = Math.sin(p.t * 2.2) * 0.02;
        tg.torsoX = 0.04 + b;
        tg.armLZ = 0.15 + b;
        tg.armRZ = -0.15 - b;
        tg.legLX = tg.legRX = -0.12;
        tg.kneeLX = tg.kneeRX = 0.24;
        tg.bodyY = 0.322;
        break;
      }
      case 'run':
      case 'airplane': {
        // Each leg: the thigh swings forward and back; the knee folds up as the leg comes through
        // (more the faster you go), and is nearly straight when the foot lands.
        const A = 0.4 + 0.6 * run;
        const leg = (ph: number) => ({
          thigh: -Math.sin(ph) * A,
          knee: 0.15 + (0.45 + 1.6 * run) * Math.max(0, Math.cos(ph - 0.6)) ** 2,
        });
        const l = leg(p.phase), r = leg(p.phase + Math.PI);
        tg.legLX = l.thigh; tg.kneeLX = l.knee;
        tg.legRX = r.thigh; tg.kneeRX = r.knee;
        // Arms swing against the legs; shoulders twist against the hips.
        tg.armLX = r.thigh * 1.15;
        tg.armRX = l.thigh * 1.15;
        tg.armLZ = 0.16 + 0.1 * run;
        tg.armRZ = -0.16 - 0.1 * run;
        tg.torsoY = Math.sin(p.phase) * 0.16 * run;
        tg.torsoZ = Math.sin(p.phase) * 0.03;
        // Up at mid-stride, down on each landing; lean into the run, head up.
        tg.bodyY = 0.312 + Math.abs(Math.sin(p.phase)) * 0.06 * (0.3 + run);
        tg.torsoX = 0.1 + 0.24 * run;
        tg.headX = -0.12 * run;
        snap = true;
        if (p.pose === 'airplane') {
          // Wings out, banking hard into the turn, wings wobbling.
          tg.armLX = tg.armRX = 0;
          tg.armLZ = 1.45 + Math.sin(p.t * 3) * 0.12;
          tg.armRZ = -1.45 + Math.sin(p.t * 3) * 0.12;
          tg.torsoY = 0;
          tg.torsoZ = Math.sin(p.t * 3) * 0.12;
          tg.bodyZ += (p.lean?.side ?? 0) * 1.3;
          tg.headX = -0.25;
        }
        break;
      }
      case 'kick': {
        // Back-lift with the knee folded, whip through the ball at `contact`, follow through, recover.
        const k = p.kick ?? { contact: 0.12, power: 0.6, kind: 'shot' as KickStyle };
        const pw = k.power, t = p.t, c = Math.max(0.04, k.contact);
        const back = k.kind === 'pass' ? 0.45 + pw * 0.45 : k.kind === 'lob' ? 0.8 + pw * 0.5 : 0.7 + pw * 0.75;
        const thru = k.kind === 'pass' ? -(0.45 + pw * 0.45) : k.kind === 'lob' ? -(1.0 + pw * 0.6) : -(0.75 + pw * 0.85);
        if (t < c) {
          const u = ease(t / c);
          tg.legRX = back * u;
          tg.kneeRX = 0.3 + 1.2 * u;
          tg.torsoX = 0.05 - 0.12 * u;
          tg.bodyY = 0.33 - 0.025 * u;
        } else if (t < c + 0.1) {
          const u = ease((t - c) / 0.1);
          tg.legRX = back + (thru - back) * u;
          tg.kneeRX = 1.5 * (1 - u) + 0.08;
          tg.torsoX = -0.07 - (k.kind === 'lob' ? 0.2 : 0.08) * u;
          tg.bodyY = 0.305 + 0.03 * u;
        } else {
          const u = ease(Math.min(1, (t - c - 0.1) / 0.24));
          tg.legRX = thru * (1 - u);
          tg.kneeRX = 0.08 + 0.2 * u;
          tg.torsoX = (k.kind === 'lob' ? -0.27 : -0.15) * (1 - u);
          tg.bodyY = 0.335 - 0.005 * u;
        }
        // Standing leg planted and bent; arms out for balance; side-foot passes turn the foot out.
        tg.legLX = -0.08;
        tg.kneeLX = 0.3;
        if (k.kind === 'pass') { tg.legRZ = -0.3; tg.torsoY = 0.18; }
        tg.armLZ = 0.6 + pw * 0.6;
        tg.armRZ = -0.45;
        tg.armLX = -0.35;
        tg.armRX = 0.3;
        snap = true;
        break;
      }
      case 'header': {
        const u = Math.min(1, p.t / 0.4);
        tg.bodyY = 0.33 + Math.sin(u * Math.PI) * 0.22;
        tg.torsoX = u < 0.4 ? -0.4 : 0.55;
        tg.headX = u < 0.4 ? -0.3 : 0.5;
        tg.armLZ = 0.7;
        tg.armRZ = -0.7;
        tg.legLX = 0.3;
        tg.legRX = 0.5;
        tg.kneeLX = tg.kneeRX = 0.9 * Math.sin(u * Math.PI);
        break;
      }
      case 'tackle': {
        tg.bodyY = 0.27;
        tg.legRX = -1.25;
        tg.legLX = 0.5;
        tg.kneeLX = 0.7;
        tg.torsoX = 0.35;
        tg.armLX = 0.6;
        tg.armRX = 0.6;
        tg.armLZ = 0.6;
        tg.armRZ = -0.6;
        break;
      }
      case 'slide': {
        tg.bodyY = 0.2;
        tg.bodyX = -1.05;
        tg.legRX = -0.35;
        tg.legLX = 0.7;
        tg.kneeLX = 1.2;
        tg.torsoX = 0.3;
        tg.armLZ = 1.2;
        tg.armRZ = -1.2;
        tg.armLX = 0.6;
        tg.armRX = 0.6;
        break;
      }
      case 'down': {
        tg.bodyY = 0.14;
        tg.bodyX = -1.5;
        tg.legLX = 0.2;
        tg.legRX = -0.3;
        tg.armLZ = 1.3;
        tg.armRZ = -1.0;
        tg.headX = 0.3;
        break;
      }
      case 'stunned': {
        tg.torsoX = 0.3 + Math.sin(p.t * 18) * 0.15;
        tg.armLZ = 1.1;
        tg.armRZ = -1.1;
        tg.legLX = 0.3;
        break;
      }
      case 'dive': {
        const s = p.side ?? 1;
        tg.bodyZ = -s * 1.35;
        tg.bodyY = 0.42;
        tg.armLX = -2.9;
        tg.armRX = -2.9;
        tg.armLZ = 0.2;
        tg.armRZ = -0.2;
        tg.legLZ = s * 0.2;
        tg.legRZ = s * 0.2;
        break;
      }
      case 'hold': {
        tg.armLX = -1.3;
        tg.armRX = -1.3;
        tg.armLZ = -0.25;
        tg.armRZ = 0.25;
        break;
      }
      case 'throw': {
        const u = Math.min(1, p.t / 0.45);
        const x = u < 0.6 ? -2.9 : -2.9 + 1.9 * ease((u - 0.6) / 0.4);
        tg.armLX = x;
        tg.armRX = x;
        tg.armLZ = -0.15;
        tg.armRZ = 0.15;
        tg.torsoX = u < 0.6 ? -0.25 : 0.25;
        break;
      }
      case 'card': {
        // Right arm straight up, card high; the other hand on the hip.
        tg.armRX = -2.75;
        tg.armRZ = -0.45;
        tg.armLZ = 0.5;
        tg.armLX = 0.3;
        tg.torsoX = -0.08;
        tg.headX = -0.15;
        break;
      }
      case 'point': {
        // Arm out in front, pointing (at the spot, or the way the free kick goes).
        tg.armRX = -1.55;
        tg.armRZ = -0.05;
        tg.armLZ = 0.2;
        break;
      }
      case 'kneeslide': {
        // On the knees, leaning back, arms wide, roaring at the sky.
        tg.bodyY = 0.21;
        tg.bodyX = -0.06;
        tg.legLX = tg.legRX = 0.06;
        tg.kneeLX = tg.kneeRX = 1.62;
        tg.legLZ = 0.14;
        tg.legRZ = -0.14;
        tg.torsoX = -0.28;
        tg.headX = -0.4;
        tg.armLZ = 1.9 + Math.sin(p.t * 9) * 0.1;
        tg.armRZ = -1.9 - Math.sin(p.t * 9) * 0.1;
        tg.armLX = tg.armRX = -0.35;
        break;
      }
      case 'belly': {
        // Superman across the grass: flat out, arms ahead, then happy little leg kicks.
        tg.bodyY = 0.13;
        tg.bodyX = 1.42;
        tg.torsoX = -0.12;
        tg.headX = -0.95;
        tg.armLX = tg.armRX = -2.9;
        tg.armLZ = 0.25;
        tg.armRZ = -0.25;
        const kick = p.t > 1.3 ? 1 : 0;
        tg.legLX = 0.12;
        tg.legRX = 0.12;
        tg.kneeLX = kick * (0.9 + Math.sin(p.t * 9) * 0.6);
        tg.kneeRX = kick * (0.9 - Math.sin(p.t * 9) * 0.6);
        break;
      }
      case 'flip': {
        // A backflip: crouch, spring, tuck and turn all the way over, land, arms up.
        const air = 0.86;
        const u = Math.min(1, p.t / air);
        if (u < 1) {
          tg.bodyX = -Math.PI * 2 * ease(u);
          const tuck = Math.sin(Math.min(1, u * 1.15) * Math.PI);
          tg.legLX = tg.legRX = -1.4 * tuck;
          tg.kneeLX = tg.kneeRX = 1.9 * tuck;
          tg.armLX = tg.armRX = -2.4 + 1.6 * tuck;
          tg.armLZ = 0.3;
          tg.armRZ = -0.3;
          tg.headX = 0.4 * tuck;
        } else {
          const land = Math.max(0, 1 - (p.t - air) / 0.25);
          tg.bodyY = 0.33 - 0.08 * land;
          tg.kneeLX = tg.kneeRX = 0.6 * land;
          tg.legLX = tg.legRX = -0.3 * land;
          tg.armLZ = 2.6;
          tg.armRZ = -2.6;
          tg.headX = -0.35;
        }
        snap = true;
        break;
      }
      case 'spin': {
        // Spinning on the spot, arms out like a helicopter.
        tg.bodyY = 0.33 + Math.abs(Math.sin(p.t * 9)) * 0.04;
        tg.armLZ = 1.5;
        tg.armRZ = -1.5;
        tg.armLX = Math.sin(p.t * 6) * 0.3;
        tg.armRX = -Math.sin(p.t * 6) * 0.3;
        tg.legLX = Math.sin(p.t * 18) * 0.3;
        tg.legRX = -Math.sin(p.t * 18) * 0.3;
        tg.bodyZ = 0.12;
        tg.headX = -0.4;
        break;
      }
      case 'dance': {
        // Everyone in time: hips swaying, stepping side to side, disco arms swapping every bar.
        const ph = p.t * Math.PI * 2.2;
        const sw = Math.sin(ph);
        tg.bodyY = 0.3 + Math.abs(sw) * 0.05;
        tg.bodyZ = sw * 0.16;
        tg.torsoZ = -sw * 0.24;
        tg.legLZ = Math.max(0, sw) * 0.35;
        tg.legRZ = -Math.max(0, -sw) * 0.35;
        tg.kneeLX = tg.kneeRX = 0.3;
        tg.legLX = tg.legRX = -0.15;
        tg.headX = Math.sin(ph * 2) * 0.15;
        if (Math.sin(ph * 0.5) > 0) {
          tg.armRZ = -2.5; tg.armRX = -0.4;
          tg.armLZ = -0.1; tg.armLX = -0.8;
        } else {
          tg.armLZ = 2.5; tg.armLX = -0.4;
          tg.armRZ = 0.1; tg.armRX = -0.8;
        }
        break;
      }
      case 'clap': {
        // Applauding (a teammate's flip), with little bounces.
        const c = Math.abs(Math.sin(p.t * 7));
        tg.bodyY = 0.33 + c * 0.03;
        tg.armLX = tg.armRX = -1.25;
        tg.armLZ = -0.32 + 0.4 * c;
        tg.armRZ = 0.32 - 0.4 * c;
        tg.headX = -0.15;
        break;
      }
      case 'sad': {
        // Just let one in: shoulders down, staring at the grass.
        tg.torsoX = 0.3;
        tg.headX = 0.55;
        tg.armLZ = 0.05;
        tg.armRZ = -0.05;
        tg.armLX = tg.armRX = 0.15;
        tg.bodyY = 0.325;
        break;
      }
      case 'celebrate': {
        const j = Math.abs(Math.sin(p.t * 7));
        tg.bodyY = 0.33 + j * 0.25;
        tg.armLZ = 2.5 + Math.sin(p.t * 14) * 0.3;
        tg.armRZ = -2.5 - Math.sin(p.t * 14) * 0.3;
        tg.legLX = -j * 0.4;
        tg.legRX = j * 0.4;
        tg.kneeLX = j * 0.8;
        tg.kneeRX = j * 0.5;
        tg.headX = -0.3;
        break;
      }
    }
    if (p.lean) {
      tg.bodyZ += p.lean.side;
      tg.bodyX += p.lean.fwd;
    }
    // A dribbling touch: one foot nudges forward and back over the run cycle.
    if (p.touch && p.touch > 0 && (p.pose === 'run' || p.pose === 'idle')) {
      const e = Math.sin(p.touch * Math.PI);
      if ((p.touchFoot ?? -1) > 0) { tg.legLX += (-0.7 - tg.legLX) * e; tg.kneeLX += (0.35 - tg.kneeLX) * e; }
      else { tg.legRX += (-0.7 - tg.legRX) * e; tg.kneeRX += (0.35 - tg.kneeRX) * e; }
    }
    const vals = [tg.bodyY, tg.bodyX, tg.bodyZ, tg.torsoX, tg.torsoY, tg.headX, tg.headY, tg.armLX, tg.armLZ, tg.armRX, tg.armRZ, tg.legLX, tg.legLZ, tg.legRX, tg.legRZ, tg.kneeLX, tg.kneeRX, tg.torsoZ];
    // Running legs and kicks follow their timing closely; everything else eases into place.
    const k = 1 - Math.exp(-dt * (snap ? 38 : 14));
    // The body's forward roll is free to go all the way round (a flip), so take the short way back.
    const turn = Math.PI * 2;
    this.targets[1] += turn * Math.round((vals[1] - this.targets[1]) / turn);
    this.channels.forEach(([o, a, kind], i) => {
      this.targets[i] += (vals[i] - this.targets[i]) * k;
      if (kind === 'pos') o.position[a] = this.targets[i];
      else o.rotation[a] = this.targets[i];
    });
    this.animateFace(p, dt);
  }

  /** Blinks, expressions, bouncing ears, wagging tails. */
  private animateFace(p: PoseInput, dt: number) {
    this.clock += dt;
    const t = this.clock;
    const id = this.team.id as Animal;
    const k = 1 - Math.exp(-dt * 9);
    for (const m of ['happy', 'sad', 'ouch', 'effort'] as const) this.ex[m] += ((p.mood === m ? 1 : 0) - this.ex[m]) * k;
    const { happy, sad, ouch, effort } = this.ex;
    // Blink now and then (quick close and open).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkT = 0; this.blinkIn = 1.8 + Math.random() * 3.5; }
    this.blinkT += dt;
    const blink = this.blinkT < 0.13 ? Math.sin((this.blinkT / 0.13) * Math.PI) : 0;
    // Happy: squeezed into smiling crescents. Sad: heavy lids. Ouch: screwed shut. Effort: a squint.
    let open = 1 - 0.3 * happy - 0.3 * sad - 0.85 * ouch - 0.25 * effort;
    open = Math.max(0.08, open * (1 - 0.92 * blink));
    for (const e of this.face.eyes) e.scale.y = open;
    // Brows: cross by default; up and apart when happy, tipped up in the middle when sad, down hard with effort.
    for (const b of this.face.brows) {
      const tilt = 0.22 - 0.15 * happy - 0.6 * sad + 0.25 * effort - 0.35 * ouch;
      b.mesh.rotation.z = b.side * tilt;
      b.mesh.position.y = b.y + 0.025 * happy - 0.012 * effort + 0.01 * sad;
    }
    // The mouth: a big grin, a frown, an "ow", gritted teeth; hidden when calm.
    const m = this.face.mouth;
    if (m) {
      const shown = happy + sad + ouch;
      const frown = sad > happy + ouch;
      m.smile.rotation.z = frown ? Math.PI : 0;
      const talk = 1 + 0.12 * Math.sin(t * 17) * happy;
      m.smile.scale.set(Math.max(0.001, (1.3 * happy + 1.0 * sad + 0.6 * ouch) * Math.min(1, shown * 3) / Math.max(0.001, shown)),
        Math.max(0.001, (1.25 * happy * talk + 0.55 * sad + 1.0 * ouch) * Math.min(1, shown * 3) / Math.max(0.001, shown)), 1);
      m.teeth.scale.setScalar(Math.max(0.001, effort));
    }
    if (this.face.jaw) {
      const j = this.face.jaw, drop = 0.05 * happy * (0.8 + 0.2 * Math.sin(t * 17)) + 0.035 * ouch + 0.01 * effort;
      j.obj.position.y = j.y - drop;
      // The inside of the beak fills the gap.
      j.inside.position.y = 0.1 - drop / 2;
      j.inside.scale.y = 0.3 + drop / 0.07;
    }
    // Ears: bounce with each step, sweep back at speed, droop when sad, waggle when happy, and twitch now and then.
    const run = Math.min(1, p.speed / 6.6);
    const big = id === 'bunny' ? 1 : id === 'dog' ? 1.2 : id === 'mouse' ? 0.5 : 0.3;
    this.twitchIn -= dt;
    if (this.twitchIn <= 0) { this.twitchT = 0; this.twitchIn = 2.5 + Math.random() * 5; this.twitchSide = Math.random() < 0.5 ? -1 : 1; }
    this.twitchT += dt;
    const twitch = this.twitchT < 0.25 ? Math.sin((this.twitchT / 0.25) * Math.PI * 2) * 0.35 : 0;
    const step = Math.sin(p.phase * 2) * run;
    for (const e of this.face.ears) {
      const flop = id === 'dog'
        ? { x: -0.35 * run + step * 0.35 - 0.3 * happy, z: e.side * (0.5 * run + 0.25 * Math.abs(step)) }
        : { x: (-0.45 * run - step * 0.25) * big - 0.7 * sad * big, z: -e.side * 0.35 * sad * big };
      const wag = happy * Math.sin(t * 15 + e.side) * 0.25 * big;
      const tw = e.side === this.twitchSide ? twitch * (id === 'dog' ? 0.6 : 1) : 0;
      e.pivot.rotation.x = e.rx + flop.x;
      e.pivot.rotation.z = e.rz + flop.z + wag + tw * (e.side || 1);
    }
    // Tails: dogs wag (madly when happy, tucked when sad), cats sway slowly, the rest bob along.
    if (this.tail) {
      const wag = id === 'dog' ? Math.sin(t * (9 + 13 * happy)) * (0.3 + 0.4 * happy) * (1 - 0.7 * sad)
        : id === 'cat' ? Math.sin(t * 1.7) * 0.4 + Math.sin(t * 4.1) * 0.06
        : id === 'mouse' ? Math.sin(t * 3) * 0.3
        : Math.sin(t * (5 + 10 * happy)) * (0.12 + 0.25 * happy);
      this.tail.rotation.y = wag;
      this.tail.rotation.x = -0.75 * sad + 0.15 * step + (id === 'cat' ? 0.25 * happy : 0);
    }
  }
}

/** Separate head for menu pictures (team badges). */
export function buildBadgeHead(team: Team) {
  return buildHead(team).head;
}

/** The ball: white with black patches. */
export function buildBall(radius: number) {
  const tex = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#f8f8f4';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#1a1a1e';
    // Patches at the corners of an icosahedron, spread over the sphere.
    const phi = (1 + Math.sqrt(5)) / 2;
    const verts = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]];
    for (const [x, y, z] of verts) {
      const lon = Math.atan2(z, x), lat = Math.asin(y / Math.hypot(x, y, z));
      const u = ((lon / (Math.PI * 2)) + 0.5) * 512, v = (0.5 - lat / Math.PI) * 256;
      const stretch = 1 / Math.max(0.35, Math.cos(lat));
      for (const du of [-512, 0, 512]) {
        g.beginPath();
        g.ellipse(u + du, v, 26 * stretch, 26, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshToonMaterial({ map: tex }));
  m.castShadow = true;
  return m;
}
