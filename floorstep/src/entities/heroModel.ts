// The hero, drawn in the spirit of Trondheim & Sfar's "Dungeon": lanky, slouching, scruffy,
// with heavy-lidded eyes on top of a long snout. Every joint is on a spring (see springs.ts):
// poses say where joints want to go, and the springs make it all flow.
import * as THREE from 'three';
import { ANIMALS, type HeroLook, weaponOf } from '../data/heroes';
import { ball, ink, part, toon } from '../world/toon';
import { Springs } from './springs';

export type Pose =
  | 'idle' | 'walk' | 'search' | 'under' | 'cheer' | 'scared' | 'climb'
  | 'swing1' | 'swing2' | 'heavy' | 'thrust' | 'shoot' | 'cast' | 'bash' | 'slam'
  | 'block' | 'dodge' | 'hurt' | 'dead' | 'kneel' | 'hug';

/** How the hero is moving this frame, so the walk cycle matches the feet to the floor. */
export interface Motion {
  /** 0..1 of full speed. */
  speed: number;
  /** Metres travelled this frame. */
  stride: number;
  /** Turning speed (rad/s), for leaning into turns. */
  turn: number;
}

export interface HeroRig {
  root: THREE.Group;
  /** Where speech bubbles attach (above the head). */
  headTop: THREE.Object3D;
  /** The weapon hand, and the far end of the weapon (for swoosh trails). */
  hand: THREE.Object3D;
  /** In front of the chest: where Youser sits when hugged. */
  chest: THREE.Object3D;
  tip: THREE.Object3D;
  /**
   * @param t seconds in this pose
   * @param p 0..1 progress through an action, `hit` the moment in it where the blow lands
   */
  animate(dt: number, pose: Pose, motion: Motion, t: number, p?: number, hit?: number): void;
  /** Rocked by a blow. */
  flinch(strength?: number): void;
}

const INKC = 0x14100e, METAL = 0xb8bcc4, WOOD = 0x6a4428, BOOT = 0x3a2418;

function capsule(r: number, len: number, color: THREE.ColorRepresentation) {
  return part(new THREE.CapsuleGeometry(r, len, 4, 10), color);
}

/** Smooth turned shape from a profile of [radius, y] pairs. */
function lathe(points: [number, number][], color: THREE.Material | THREE.ColorRepresentation, seg = 18) {
  return part(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), color);
}

function oval(rx: number, ry: number, rz: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  const m = ball(1, color, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}

/** A limb bone: a group at the joint with a thin capsule hanging down from it. */
function limb(len: number, r: number, color: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const c = capsule(r, len, color);
  c.position.y = -len / 2;
  g.add(c);
  return g;
}

/** A crooked tuft of fur or hair. */
function tuft(color: THREE.ColorRepresentation, x: number, y: number, z: number, rx: number, rz: number, len = 0.07) {
  const t = part(new THREE.ConeGeometry(0.018, len, 5), color, x, y, z);
  t.rotation.set(rx, 0, rz);
  return t;
}

const darker = (c: number, k = 0.7) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Two eyes stuck together under heavy, grumpy lids. Returns the lids so they can blink. */
function eyes(y: number, z: number, skin: number, female: boolean) {
  const g = new THREE.Group();
  const lids: THREE.Object3D[] = [];
  const spread = 0.038;
  for (const s of [-1, 1]) {
    const e = oval(0.04, 0.052, 0.034, 0xf4f0e0, s * spread, 0, 0);
    e.rotation.y = s * 0.25;
    g.add(e);
    // Pupils a little off, as if never quite looking at the same thing.
    const p = ball(0.012, INKC, s * (spread - 0.006) + (s > 0 ? 0.003 : 0), -0.008, 0.031);
    p.userData.noInk = true;
    g.add(p);
    // Upper lid: a cap of skin over the top of the eye, tilted down toward the middle.
    const lidPivot = new THREE.Group();
    lidPivot.position.set(s * spread, 0, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), toon(skin));
    lid.scale.set(0.95, 1.18, 0.86);
    lid.castShadow = true;
    lidPivot.add(lid);
    lidPivot.rotation.set(0.35, 0, s * -0.32);
    g.add(lidPivot);
    lids.push(lidPivot);
    // Bushy, grumpy brow.
    const brow = part(new THREE.CapsuleGeometry(0.009, 0.045, 3, 6), darker(skin, 0.45), s * (spread + 0.005), 0.058, 0.02);
    brow.rotation.set(0, 0, Math.PI / 2 + s * 0.35);
    g.add(brow);
    if (female) {
      for (const a of [0.2, 0.55]) {
        const lash = part(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 3), INKC, s * (spread + Math.sin(a) * 0.035), 0.02, 0.03);
        lash.rotation.z = -s * (0.6 + a);
        lash.userData.noInk = true;
        g.add(lash);
      }
    }
  }
  g.position.set(0, y, z);
  return { g, lids };
}

function buildHead(look: HeroLook) {
  const a = ANIMALS[look.animal];
  const f = look.sex === 'f';
  const head = new THREE.Group();
  const skull = oval(0.14, 0.145, 0.14, a.skin);
  head.add(skull);
  const fur = darker(a.skin, 0.8);
  let eyeY = 0.08, eyeZ = 0.1;

  switch (look.animal) {
    case 'duck': {
      // A long, battered beak with a chip in it.
      head.add(oval(0.072, 0.028, 0.18, a.muzzle, 0, -0.02, 0.21));
      head.add(oval(0.058, 0.02, 0.15, 0xc8701a, 0, -0.052, 0.18));
      head.add(oval(0.012, 0.008, 0.01, INKC, 0.025, -0.005, 0.32));
      for (const k of [-1, 0, 1]) head.add(tuft(a.skin, k * 0.03, 0.15, -0.02, -0.3, k * 0.4, 0.09));
      break;
    }
    case 'cat': {
      head.add(oval(0.08, 0.055, 0.07, a.muzzle, 0, -0.05, 0.11));
      head.add(ball(0.02, 0xc06070, 0, -0.02, 0.17));
      for (const s of [-1, 1]) {
        const ear = part(new THREE.ConeGeometry(0.05, 0.13, 4), a.skin, s * 0.09, 0.15, -0.01);
        ear.rotation.z = -s * (0.35 + (s > 0 ? 0.25 : 0));
        head.add(ear);
        for (const k of [-1, 1]) {
          const wh = part(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 3), INKC, s * 0.12, -0.04 + k * 0.015, 0.13);
          wh.rotation.z = Math.PI / 2 + s * k * 0.2 + (k > 0 ? 0.15 : 0);
          wh.userData.noInk = true;
          head.add(wh);
        }
        head.add(tuft(fur, s * 0.13, -0.05, 0.02, 0, s * -1.6));
      }
      break;
    }
    case 'dog': {
      const snout = lathe([[0.001, 0], [0.05, 0.02], [0.065, 0.13], [0.075, 0.22]], a.muzzle);
      snout.rotation.x = -Math.PI / 2 - 0.2;
      snout.position.set(0, -0.03, 0.33);
      head.add(snout);
      head.add(oval(0.04, 0.03, 0.035, INKC, 0, -0.01, 0.34));
      for (const s of [-1, 1]) {
        const ear = oval(0.035, 0.13, 0.06, 0x5a3a20, s * 0.13, -0.05, -0.01);
        ear.rotation.z = s * (0.15 + (s > 0 ? 0.25 : 0));
        head.add(ear);
      }
      head.add(tuft(fur, 0.02, 0.15, 0.02, 0.2, 0.3, 0.08));
      eyeY = 0.1;
      break;
    }
    case 'dragon': {
      // Long snout like Marvin's, nostrils at the tip, chipped little horns.
      const snout = lathe([[0.001, 0], [0.05, 0.015], [0.07, 0.16], [0.085, 0.26]], a.skin);
      snout.rotation.x = -Math.PI / 2 - 0.12;
      snout.position.set(0, -0.03, 0.38);
      head.add(snout);
      head.add(oval(0.06, 0.02, 0.16, a.muzzle, 0, -0.085, 0.21));
      for (const s of [-1, 1]) {
        head.add(ball(0.014, INKC, s * 0.025, 0.0, 0.37));
        const horn = part(new THREE.ConeGeometry(0.022, s > 0 ? 0.13 : 0.09, 6), 0xd8d0b0, s * 0.07, 0.15, -0.06);
        horn.rotation.x = -0.7;
        head.add(horn);
      }
      eyeY = 0.11;
      break;
    }
    case 'bear': {
      head.add(oval(0.085, 0.065, 0.08, a.muzzle, 0, -0.05, 0.11));
      head.add(oval(0.035, 0.025, 0.022, INKC, 0, -0.02, 0.19));
      for (const s of [-1, 1]) head.add(oval(0.045, 0.045, 0.02, a.skin, s * 0.11, 0.13, -0.02));
      for (const k of [-1, 1]) head.add(tuft(fur, k * 0.12, -0.08, 0.06, 0, k * -1.4, 0.08));
      break;
    }
    case 'pig': {
      const snout = part(new THREE.CylinderGeometry(0.06, 0.07, 0.11, 14), a.muzzle, 0, -0.04, 0.16);
      snout.rotation.x = Math.PI / 2;
      head.add(snout);
      for (const s of [-1, 1]) {
        head.add(oval(0.012, 0.018, 0.01, 0x7a3a3a, s * 0.022, -0.04, 0.215));
        const ear = part(new THREE.ConeGeometry(0.05, 0.11, 4), a.skin, s * 0.1, 0.13, 0.03);
        ear.rotation.set(0.8 + (s > 0 ? 0.4 : 0), 0, -s * 0.45);
        head.add(ear);
      }
      head.add(tuft(0x5a3a2a, 0, 0.15, 0, -0.4, 0.2, 0.08));
      head.add(tuft(0x5a3a2a, 0.03, 0.15, 0.01, -0.2, -0.4, 0.06));
      break;
    }
    case 'lizard': {
      skull.scale.set(0.13, 0.11, 0.2);
      head.add(oval(0.11, 0.045, 0.18, a.muzzle, 0, -0.06, 0.07));
      for (let i = 0; i < 4; i++) head.add(part(new THREE.ConeGeometry(0.015, 0.05, 4), darker(a.skin, 0.7), 0, 0.1 - i * 0.01, -0.05 - i * 0.05).rotateX(-0.5));
      eyeY = 0.11; eyeZ = 0.09;
      break;
    }
    case 'rabbit': {
      head.add(oval(0.07, 0.05, 0.06, a.muzzle, 0, -0.05, 0.11));
      head.add(ball(0.018, 0xc06070, 0, -0.02, 0.16));
      head.add(oval(0.024, 0.032, 0.01, 0xf0eadc, -0.008, -0.1, 0.13));
      head.add(oval(0.018, 0.026, 0.01, 0xf0eadc, 0.017, -0.095, 0.13));
      for (const s of [-1, 1]) {
        // One ear up, one flopped over.
        const ear = oval(0.035, 0.16, 0.02, a.skin, s * 0.05, s > 0 ? 0.2 : 0.27, -0.03);
        ear.rotation.z = s > 0 ? -1.1 : 0.15;
        if (s > 0) ear.position.x = 0.15;
        head.add(ear);
      }
      break;
    }
  }
  const e = eyes(eyeY, eyeZ, a.skin, f);
  head.add(e.g);
  if (f) {
    // A messy ponytail, tied with a scrap of her accent colour.
    const hair = darker(a.skin, 0.55);
    const tail = new THREE.Group();
    tail.add(oval(0.05, 0.11, 0.05, hair, 0, -0.08, 0));
    tail.add(tuft(hair, 0.02, -0.18, 0, 0.3, 0.4, 0.06));
    tail.add(tuft(hair, -0.02, -0.18, 0, 0.3, -0.5, 0.06));
    tail.add(part(new THREE.TorusGeometry(0.035, 0.012, 5, 10), look.accent, 0, 0.0, 0).rotateX(Math.PI / 2));
    tail.position.set(0, 0.06, -0.14);
    tail.rotation.x = 0.5;
    head.add(tail);
  }

  switch (look.cls) {
    case 'wizard': {
      // A tall, dented hat that has seen better days, bent at the top, with a patch.
      const hat = new THREE.Group();
      hat.add(lathe([[0.26, 0], [0.24, 0.02], [0.12, 0.025], [0.105, 0.17], [0.06, 0.3], [0.001, 0.36]], look.costume));
      const tip = part(new THREE.ConeGeometry(0.045, 0.22, 10), look.costume, 0.07, 0.4, 0);
      tip.rotation.z = -1.1;
      hat.add(tip);
      hat.add(part(new THREE.TorusGeometry(0.11, 0.014, 6, 18), look.accent, 0, 0.035, 0).rotateX(Math.PI / 2));
      hat.add(part(new THREE.BoxGeometry(0.06, 0.05, 0.01), darker(look.costume, 0.7), 0.04, 0.15, 0.1).rotateZ(0.3));
      hat.position.y = 0.11;
      hat.rotation.set(-0.15, 0, 0.12);
      head.add(hat);
      break;
    }
    case 'knight': {
      // A dented kettle helmet with a sad little plume.
      const helm = new THREE.Group();
      helm.add(part(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), METAL));
      helm.add(part(new THREE.CylinderGeometry(0.22, 0.24, 0.015, 20), METAL, 0, 0, 0));
      const plume = oval(0.022, 0.07, 0.08, look.costume, 0, 0.16, -0.06);
      plume.rotation.x = -1.0;
      helm.add(plume);
      helm.position.y = 0.04;
      helm.rotation.set(-0.12, 0, 0.1);
      head.add(helm);
      break;
    }
    case 'barbarian': {
      head.add(part(new THREE.SphereGeometry(0.152, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), 0x8a8478, 0, 0.03, 0));
      for (const s of [-1, 1]) {
        // One horn is broken off.
        const horn = lathe(s > 0 ? [[0.03, 0], [0.022, 0.08], [0.001, 0.17]] : [[0.03, 0], [0.024, 0.06], [0.02, 0.075]], 0xe8e0c8, 8);
        horn.position.set(s * 0.13, 0.08, 0);
        horn.rotation.z = -s * 1.1;
        head.add(horn);
      }
      for (const k of [-1, 0, 1]) head.add(tuft(darker(a.skin, 0.6), k * 0.05, -0.1, 0.1, 0.5, k * 0.3, 0.06));
      break;
    }
    case 'thief': {
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 18, 10, Math.PI * 0.82, Math.PI * 1.36, 0, Math.PI * 0.66),
        new THREE.MeshToonMaterial({ color: look.costume, side: THREE.DoubleSide }),
      );
      hood.position.set(0, 0.02, -0.02);
      head.add(hood);
      // A floppy hood point.
      const point = part(new THREE.ConeGeometry(0.06, 0.18, 8), look.costume, 0, 0.08, -0.18);
      point.rotation.x = -2.1;
      head.add(point);
      break;
    }
  }
  return { head, lids: e.lids };
}

/** The weapon, held in the right hand; returns the group and its far end. */
function buildWeapon(look: HeroLook) {
  const g = new THREE.Group();
  const tip = new THREE.Object3D();
  const w = weaponOf(look).id;
  switch (look.cls) {
    case 'wizard': {
      const bladeCol = w === 'flame' ? 0x5a2a20 : METAL;
      if (w === 'sabre') {
        const blade = part(new THREE.TorusGeometry(0.6, 0.02, 4, 16, 1.0), METAL);
        blade.scale.z = 0.4;
        blade.position.set(-0.6, 0.02, 0);
        g.add(blade);
        tip.position.set(-0.6 + Math.cos(1.0) * 0.6, Math.sin(1.0) * 0.6, 0);
      } else {
        const blade = lathe([[0.001, 0.62], [0.022, 0.55], [0.026, 0.0]], bladeCol, 4);
        blade.scale.z = 0.3;
        g.add(blade);
        if (w === 'flame') g.add(lathe([[0.001, 0.6], [0.012, 0.5], [0.014, 0.05]], new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a20).multiplyScalar(2.5), toneMapped: false }), 4).translateZ(0.006));
        tip.position.y = 0.6;
      }
      g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), look.accent, 0, 0, 0).rotateZ(Math.PI / 2));
      g.add(part(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), WOOD, 0, -0.06, 0));
      break;
    }
    case 'knight': {
      const len = w === 'spear' ? 1.95 : 1.75;
      g.add(part(new THREE.CylinderGeometry(0.014, 0.014, len, 6), WOOD, 0, len / 2 - 0.5, 0));
      const top = len - 0.5;
      if (w === 'spear') {
        const leaf = oval(0.035, 0.13, 0.01, METAL, 0, top + 0.1, 0);
        g.add(leaf);
        g.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), 0x6a2a2a, 0, top - 0.02, 0));
        tip.position.y = top + 0.22;
      } else {
        const axe = new THREE.Shape();
        axe.moveTo(0, 0);
        axe.quadraticCurveTo(0.2, 0.05, 0.2, 0.17);
        axe.quadraticCurveTo(0.08, 0.13, 0, 0.2);
        const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(axe, { depth: 0.02, bevelEnabled: false }), toon(METAL));
        blade.position.set(0, top - 0.3, -0.01);
        if (w === 'poleaxe') blade.scale.set(1.3, 1.3, 1);
        g.add(blade);
        if (w === 'poleaxe') g.add(part(new THREE.BoxGeometry(0.1, 0.07, 0.07), METAL, -0.06, top - 0.18, 0));
        g.add(part(new THREE.ConeGeometry(0.02, 0.2, 6), METAL, 0, top + 0.05, 0));
        tip.position.y = top + 0.15;
      }
      break;
    }
    case 'barbarian': {
      if (w === 'axe') {
        g.add(part(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), WOOD, 0, 0.2, 0));
        const blade = new THREE.Shape();
        blade.moveTo(0, -0.08);
        blade.quadraticCurveTo(0.22, -0.16, 0.24, 0.02);
        blade.quadraticCurveTo(0.22, 0.18, 0, 0.1);
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.025, bevelEnabled: false }), toon(0x8a8a88));
        m.position.set(0.01, 0.45, -0.012);
        g.add(m);
        tip.position.set(0.22, 0.47, 0);
      } else if (w === 'hammer') {
        g.add(part(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), WOOD, 0, 0.2, 0));
        g.add(part(new THREE.BoxGeometry(0.24, 0.13, 0.13), 0x5a5856, 0, 0.55, 0));
        tip.position.y = 0.6;
      } else {
        g.add(lathe([[0.02, -0.12], [0.025, 0.1], [0.06, 0.45], [0.07, 0.55], [0.001, 0.6]], 0x6a4428, 10));
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const y = 0.38 + (i % 2) * 0.12;
          const spike = part(new THREE.ConeGeometry(0.015, 0.07, 5), METAL, Math.cos(ang) * 0.06, y, Math.sin(ang) * 0.06);
          spike.rotation.set(Math.sin(ang) * 1.57, 0, -Math.cos(ang) * 1.57);
          g.add(spike);
        }
        tip.position.y = 0.58;
      }
      break;
    }
    case 'thief': {
      // Crossbow held forward; the knife's swoosh comes from the hand.
      g.add(part(new THREE.BoxGeometry(0.035, 0.035, 0.4), WOOD, 0, 0, 0.12));
      const bow = part(new THREE.TorusGeometry(0.17, 0.012, 5, 14, Math.PI * 0.75), WOOD, 0, 0, 0.27);
      bow.rotation.set(Math.PI / 2, 0, Math.PI * 1.125);
      g.add(bow);
      tip.position.set(0, 0, w === 'dagger' ? 0.3 : 0.38);
      break;
    }
  }
  g.add(tip);
  return { g, tip };
}

export function buildHero(look: HeroLook): HeroRig {
  const a = ANIMALS[look.animal];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const burly = look.cls === 'barbarian';
  const legCol = burly ? a.skin : look.cls === 'knight' ? 0x6a6a74 : 0x3a3030;
  const sp = new Springs();

  // Legs and long pointy shoes.
  const hips = new THREE.Group();
  hips.position.y = 0.5;
  body.add(hips);
  const legs: THREE.Group[] = [];
  const shins: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const thigh = limb(0.2, 0.034, legCol);
    thigh.position.x = s * 0.07;
    const shin = limb(0.22, 0.03, legCol);
    shin.position.y = -0.25;
    thigh.add(shin);
    const shoe = oval(0.05, 0.035, 0.12, BOOT, 0, -0.26, 0.06);
    shoe.rotation.x = -0.1;
    shin.add(shoe);
    hips.add(thigh);
    legs.push(thigh);
    shins.push(shin);
  }

  // The pear-shaped tunic (a robe for the wizard), tattered and patched, then neck and head.
  const torso = new THREE.Group();
  torso.position.y = 0.46;
  body.add(torso);
  const robe = look.cls === 'wizard';
  const w = burly ? 1.25 : 1;
  const hem = robe ? -0.42 : -0.08;
  const flare = robe ? 0.22 : 0.17;
  torso.add(lathe([[0.001, hem], [flare * w, hem], [0.15 * w, 0.02], [0.13 * w, 0.18], [0.1 * w, 0.32], [0.06, 0.41], [0.001, 0.42]], look.costume));
  // Ragged hem: little tatters hanging down.
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + 0.3;
    const r = flare * w - 0.01;
    const tat = part(new THREE.ConeGeometry(0.03, 0.06 + (i % 3) * 0.025, 4), look.costume, Math.cos(ang) * r, hem - 0.02, Math.sin(ang) * r);
    tat.rotation.x = Math.PI;
    torso.add(tat);
  }
  // Patches, sewn on badly.
  const patch1 = part(new THREE.BoxGeometry(0.07, 0.06, 0.012), darker(look.costume, 0.65), 0.07 * w, 0.0, 0.135 * w);
  patch1.rotation.set(-0.1, 0.45, 0.25);
  torso.add(patch1);
  const patch2 = part(new THREE.BoxGeometry(0.05, 0.05, 0.012), look.accent, -0.08 * w, 0.22, -0.11 * w);
  patch2.rotation.set(0.1, 2.6, -0.3);
  torso.add(patch2);
  // A frayed rope belt with a pouch.
  torso.add(part(new THREE.TorusGeometry(0.135 * w, 0.014, 6, 18), 0x6a5034, 0, 0.13, 0).rotateX(Math.PI / 2 + 0.08));
  torso.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), 0x6a5034, 0.05, 0.08, 0.135 * w).rotateZ(0.2));
  torso.add(oval(0.04, 0.045, 0.025, 0x5a3a22, -0.11 * w, 0.06, 0.08));
  if (look.cls === 'knight') torso.add(lathe([[0.135, 0.1], [0.132, 0.2], [0.105, 0.32], [0.065, 0.39]], METAL));
  if (burly) torso.add(oval(0.2, 0.06, 0.13, 0x8a6a4a, 0, 0.36, -0.01));
  if (look.cls === 'thief') {
    const cape = lathe([[0.17, -0.1], [0.13, 0.2], [0.08, 0.4]], look.costume, 14);
    cape.scale.set(1.05, 1, 0.9);
    cape.position.z = -0.03;
    torso.add(cape);
    torso.add(part(new THREE.BoxGeometry(0.015, 0.12, 0.02), METAL, 0.13, 0.02, 0.1));
  }
  const tailCol = a.skin;
  let tail: THREE.Object3D | null = null;
  if (look.animal === 'dragon' || look.animal === 'lizard') {
    tail = new THREE.Group();
    const t = lathe([[0.05, 0], [0.03, 0.25], [0.001, 0.45]], tailCol, 10);
    tail.add(t);
    tail.position.set(0, 0.0, -0.12);
    tail.rotation.x = -2.1;
  } else if (look.animal === 'cat' || look.animal === 'dog') {
    tail = new THREE.Group();
    const t = capsule(0.018, 0.28, tailCol);
    t.position.y = 0.15;
    tail.add(t);
    tail.position.set(0, 0.05, -0.15);
    tail.rotation.x = -0.7;
  } else if (look.animal === 'rabbit') {
    torso.add(ball(0.045, 0xf0eadc, 0, 0.0, -0.16));
  } else if (look.animal === 'pig') {
    torso.add(part(new THREE.TorusGeometry(0.03, 0.009, 5, 10), tailCol, 0, 0.02, -0.17));
  }
  if (tail) torso.add(tail);

  const neck = part(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8), a.skin, 0, 0.46, 0);
  torso.add(neck);
  const { head, lids } = buildHead(look);
  head.position.y = 0.62;
  torso.add(head);
  const headTop = new THREE.Object3D();
  headTop.position.y = 0.42;
  head.add(headTop);
  const chest = new THREE.Object3D();
  chest.position.set(0, 0.12, 0.2);
  torso.add(chest);

  // Long thin arms with elbows.
  const arms: THREE.Group[] = [];
  const forearms: THREE.Group[] = [];
  const sleeve = burly ? a.skin : look.costume;
  for (const s of [-1, 1]) {
    const upper = limb(0.17, 0.027 * w, sleeve);
    upper.position.set(s * 0.12 * w, 0.36, 0);
    upper.rotation.z = s * 0.2;
    const fore = limb(0.17, 0.024 * w, burly ? a.skin : sleeve);
    fore.position.y = -0.21;
    fore.rotation.x = -0.3;
    upper.add(fore);
    fore.add(ball(0.035, a.skin, 0, -0.21, 0));
    torso.add(upper);
    arms.push(upper);
    forearms.push(fore);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.22, 0.01);
  forearms[1].add(hand);
  const { g: weapon, tip } = buildWeapon(look);
  hand.add(weapon);
  // Resting grip: halberd upright, sword and club pointing ahead and up, crossbow forward.
  weapon.rotation.x = look.cls === 'knight' ? 0.35 : look.cls === 'thief' ? 0 : 0.9;
  if (look.cls === 'knight') {
    const shield = new THREE.Group();
    const face = part(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), look.costume);
    face.rotation.x = Math.PI / 2;
    shield.add(face);
    shield.add(ball(0.035, METAL, 0, 0, 0.02));
    shield.add(part(new THREE.TorusGeometry(0.16, 0.015, 6, 20), METAL));
    // A dent and a crack.
    shield.add(part(new THREE.BoxGeometry(0.1, 0.008, 0.01), INKC, 0.05, 0.06, 0.02).rotateZ(0.7));
    shield.position.set(-0.02, -0.18, 0.07);
    forearms[0].add(shield);
  }

  // Slouch: a scruffy hero doesn't stand up straight.
  torso.rotation.x = 0.12;
  head.rotation.x = -0.08;

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  ink(root);

  // Springs: limbs fairly stiff, head and tail softer so they lag and bob.
  sp.add('body', body, 24, 0.6);
  sp.add('hips', hips, 26, 0.65);
  sp.add('torso', torso, 22, 0.55);
  sp.add('head', head, 13, 0.45);
  sp.add('thighL', legs[0], 30, 0.7);
  sp.add('thighR', legs[1], 30, 0.7);
  sp.add('shinL', shins[0], 30, 0.7);
  sp.add('shinR', shins[1], 30, 0.7);
  sp.add('armL', arms[0], 20, 0.5);
  sp.add('armR', arms[1], 20, 0.5);
  sp.add('foreL', forearms[0], 18, 0.45);
  sp.add('foreR', forearms[1], 18, 0.45);
  if (tail) sp.add('tail', tail, 8, 0.3);

  let phase = 0;
  let blinkT = 2 + Math.random() * 3;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  /**
   * Where an attack is: 0 → wound up at the hit moment, then 1 → fully through (follow-through),
   * returned as [windup 0..1, strike 0..1].
   */
  const phases = (p: number, hit: number): [number, number] => {
    if (p < hit) return [ease(p / hit), 0];
    return [1, ease(clamp01((p - hit) / Math.min(0.2, 1 - hit)))];
  };

  const animate: HeroRig['animate'] = (dt, pose, m, t, p = 0, hit = 0.35) => {
    sp.begin();
    const s = Math.min(1, m.speed);
    let snap = 1;

    // ---- walking, layered under everything that lets the feet move ----
    const walking = pose === 'walk' || pose === 'idle' || pose === 'climb' || pose === 'block';
    if (walking && s > 0.02) {
      phase += (m.stride / 1.25) * Math.PI * 2;
      const amp = 0.3 + 0.4 * s;
      for (const [i, side] of [[0, 'L'], [1, 'R']] as const) {
        const ph = phase + i * Math.PI;
        sp.rot(`thigh${side}`, -Math.sin(ph) * amp);
        // Knee folds while the leg swings forward, and a little on landing.
        sp.rot(`shin${side}`, (0.08 + 1.0 * s) * Math.max(0, Math.cos(ph)) + 0.08 * s);
      }
      const bob = Math.cos(phase * 2);
      sp.pos('body', 0, 0.025 * s * bob - 0.012 * s, 0);
      sp.rot('body', 0, 0, Math.sin(phase) * 0.05 * s - m.turn * 0.04 * s);
      sp.rot('hips', 0, Math.sin(phase) * 0.2 * s);
      sp.rot('torso', 0.14 * s, -Math.sin(phase) * 0.16 * s, 0);
      sp.rot('head', -0.08 * s + bob * 0.04 * s, Math.sin(phase) * 0.1 * s, 0);
      const arm = 0.25 + 0.55 * s;
      // The empty hand swings freely; the weapon hand only a little (a knight carries the halberd upright).
      const carry = look.cls === 'knight' ? 0.12 : 0.4;
      sp.rot('armL', Math.sin(phase) * arm, 0, -0.08 * s);
      sp.rot('armR', -Math.sin(phase) * arm * carry, 0, 0.08 * s);
      sp.rot('foreL', -0.4 * s - Math.max(0, -Math.sin(phase)) * 0.5 * s);
      sp.rot('foreR', -0.2 * s);
      if (tail) sp.rot('tail', 0.3 * s, Math.sin(phase) * 0.5, 0);
    }

    switch (pose) {
      case 'idle': {
        if (s > 0.02) break;
        // Shifting weight, breathing, looking around; now and then a scratch or a yawn.
        const sway = Math.sin(t * 0.9);
        sp.pos('hips', sway * 0.012);
        sp.rot('body', 0, 0, sway * 0.03);
        sp.rot('torso', Math.sin(t * 2.1) * 0.025, 0, -sway * 0.02);
        sp.rot('head', Math.sin(t * 0.7) * 0.06, Math.sin(t * 0.45) * 0.45, Math.sin(t * 0.33) * 0.08);
        sp.rot('thighL', 0, 0, -0.04 + sway * 0.03);
        sp.rot('thighR', 0, 0, 0.04 + sway * 0.03);
        const cyc = t % 8;
        if (cyc > 5.5 && cyc < 7) {
          // Scratch the head.
          sp.rot('armL', -2.6, 0, -0.5);
          sp.rot('foreL', -1.9 + Math.sin(t * 22) * 0.25);
          sp.rot('head', 0.1, 0, 0.18);
        } else if (cyc > 2.5 && cyc < 3.3) {
          // A big shrug-stretch.
          sp.rot('armL', 0, 0, -0.6);
          sp.rot('armR', 0, 0, 0.6);
          sp.rot('torso', -0.05);
        }
        if (tail) sp.rot('tail', 0, Math.sin(t * 1.5) * 0.4, 0);
        break;
      }
      case 'search': {
        sp.rot('torso', 0.55, Math.sin(t * 3) * 0.15);
        const r = Math.sin(t * 15) * 0.35;
        sp.rot('armL', -1.25 + r, 0, -0.25);
        sp.rot('armR', -1.25 - r, 0, 0.25);
        sp.rot('foreL', -0.7);
        sp.rot('foreR', -0.7);
        sp.rot('head', 0.25, Math.sin(t * 4) * 0.25);
        sp.pos('hips', 0, -0.04);
        sp.rot('shinL', 0.3);
        sp.rot('shinR', 0.3);
        break;
      }
      case 'under': {
        sp.pos('body', 0, -0.22, 0);
        sp.rot('torso', 1.0);
        sp.rot('thighL', -1.3);
        sp.rot('thighR', -1.3);
        sp.rot('shinL', 1.6);
        sp.rot('shinR', 1.6);
        sp.rot('armL', -1.4, 0, -0.3);
        sp.rot('armR', -1.4 + Math.sin(t * 9) * 0.35, 0, 0.3);
        sp.rot('head', -0.7, Math.sin(t * 3) * 0.4);
        break;
      }
      case 'cheer': {
        const k = Math.max(0, 1 - t / 1.4);
        sp.pos('body', 0, Math.max(0, Math.sin(t * 9)) * 0.2 * k);
        sp.rot('armR', -3.0, 0, 0.2);
        sp.rot('foreR', 0);
        sp.rot('armL', -0.4, 0, -1.0);
        sp.rot('head', -0.3, 0, Math.sin(t * 9) * 0.1);
        sp.rot('shinL', 0.4 * k);
        sp.rot('shinR', 0.4 * k);
        break;
      }
      case 'scared': {
        const k = Math.max(0, 1 - t / 0.9);
        sp.pos('body', 0, Math.sin(Math.min(1, t * 3) * Math.PI) * 0.3);
        sp.rot('armL', -2.7 * k, 0, -0.6 * k);
        sp.rot('armR', -2.7 * k, 0, 0.6 * k);
        sp.rot('torso', -0.3 * k);
        sp.rot('head', -0.4 * k);
        sp.rot('thighL', -0.6 * k);
        sp.rot('shinL', 1.2 * k);
        break;
      }
      case 'swing1':
      case 'swing2': {
        // Wind up across the body, then step in and slash through.
        const d = pose === 'swing1' ? 1 : -1;
        const [wu, st] = phases(p, hit);
        snap = st > 0 ? 1.9 : 1.2;
        const cock = wu * (1 - st), thru = st;
        sp.rot('torso', 0.18 + thru * 0.12, d * (0.7 * cock - 0.8 * thru), 0);
        sp.rot('hips', 0, d * (0.3 * cock - 0.35 * thru));
        sp.rot('armR', -0.9 - 0.5 * cock - 0.5 * thru, d * (-0.9 * cock + 1.3 * thru), 0.25 + 0.9 * cock * (d > 0 ? 1 : 0.2) - 0.3 * thru);
        sp.rot('foreR', -1.3 * cock - 0.15 * thru);
        sp.rot('armL', -0.5, 0, -0.6);
        sp.rot('foreL', -0.9);
        sp.pos('body', 0, -0.03 * thru, -0.04 * cock + 0.1 * thru);
        sp.rot('thighL', -0.45 * thru + 0.1 * cock);
        sp.rot('thighR', 0.35 * thru - 0.05 * cock);
        sp.rot('shinL', 0.3 * thru);
        sp.rot('shinR', 0.25);
        sp.rot('head', -0.05, -d * 0.3 * cock + d * 0.2 * thru);
        break;
      }
      case 'heavy':
      case 'slam': {
        // Rear back with both hands overhead, then bring it down with your whole body.
        const [wu, st] = phases(p, hit);
        snap = st > 0 ? 2.1 : 1.1;
        const cock = wu * (1 - st), thru = st;
        const up = -1.0 - 1.9 * cock + 0.3 * thru;
        sp.rot('armR', up, 0, 0.15);
        sp.rot('armL', up, 0, -0.15);
        sp.rot('foreR', -1.0 * cock - 0.1);
        sp.rot('foreL', -1.0 * cock - 0.1);
        sp.rot('torso', -0.4 * cock + 0.38 * thru, 0.25 * cock);
        sp.rot('head', -0.3 * cock + 0.2 * thru);
        const jump = pose === 'slam' ? 0.25 : 0.04;
        sp.pos('body', 0, jump * cock - 0.1 * thru, -0.05 * cock + 0.1 * thru);
        sp.rot('thighL', -0.5 * thru - 0.2 * cock);
        sp.rot('thighR', 0.45 * thru);
        sp.rot('shinL', 0.7 * thru + 0.3 * cock);
        sp.rot('shinR', 0.5 * thru + 0.2 * cock);
        break;
      }
      case 'thrust':
      case 'bash': {
        // Pull back, then lunge forward onto the front foot.
        const [wu, st] = phases(p, hit);
        snap = st > 0 ? 2 : 1.2;
        const cock = wu * (1 - st), thru = st;
        const side = pose === 'bash' ? 'L' : 'R';
        sp.rot(`arm${side}`, -1.1 - 0.15 * cock - 0.45 * thru, 0, side === 'L' ? -0.1 : 0.1);
        sp.rot(`fore${side}`, -1.7 * cock - 0.05 * thru);
        sp.rot('torso', 0.15 + 0.2 * thru, (side === 'R' ? 0.5 : -0.5) * cock - (side === 'R' ? 0.3 : -0.3) * thru);
        sp.pos('body', 0, -0.06 * thru, -0.07 * cock + 0.2 * thru);
        sp.rot('thighL', -0.7 * thru + 0.15 * cock);
        sp.rot('shinL', 0.6 * thru);
        sp.rot('thighR', 0.55 * thru);
        sp.rot('shinR', 0.3);
        break;
      }
      case 'shoot':
      case 'cast': {
        const [, st] = phases(p, hit);
        snap = 1.5;
        sp.rot('armR', -1.5 + 0.35 * st * (1 - st) * 4 * 0.5, 0, 0.05);
        sp.rot('foreR', -0.05);
        if (pose === 'cast') {
          sp.rot('armL', -1.45, 0, -0.1);
          sp.rot('foreL', -0.1);
          sp.pos('body', 0, 0, 0.08 * st);
        } else {
          sp.rot('armL', -1.3, 0.5, -0.1);
          sp.rot('foreL', -0.5);
        }
        sp.rot('torso', 0.1 - 0.25 * st * (1 - st) * 4);
        sp.rot('head', 0.05);
        sp.rot('thighL', -0.3);
        sp.rot('thighR', 0.25);
        break;
      }
      case 'block': {
        sp.rot('armL', -1.4, 0.5, -0.2);
        sp.rot('foreL', -1.3);
        sp.rot('armR', -1.1, -0.2, 0.3);
        sp.rot('foreR', -1.1);
        sp.pos('body', 0, -0.06, -0.02);
        sp.rot('torso', 0.28, 0.2);
        sp.rot('head', 0.05);
        if (s < 0.02) {
          sp.rot('thighL', -0.4);
          sp.rot('thighR', 0.4);
          sp.rot('shinL', 0.4);
          sp.rot('shinR', 0.5);
        }
        break;
      }
      case 'dodge': {
        // A quick tucked hop.
        snap = 1.6;
        sp.pos('body', 0, Math.sin(p * Math.PI) * 0.18 - 0.05);
        sp.rot('torso', 0.5);
        sp.rot('thighL', -0.8);
        sp.rot('thighR', -0.5);
        sp.rot('shinL', 1.2);
        sp.rot('shinR', 1.0);
        sp.rot('armL', -0.7, 0, -1.0);
        sp.rot('armR', -0.7, 0, 1.0);
        sp.rot('head', 0.2);
        break;
      }
      case 'hurt': {
        const k = Math.max(0, 1 - t / 0.35);
        sp.rot('torso', -0.55 * k);
        sp.rot('head', -0.6 * k);
        sp.rot('armL', -0.6 * k, 0, -1.1 * k);
        sp.rot('armR', -0.6 * k, 0, 1.1 * k);
        sp.pos('body', 0, -0.04 * k, -0.08 * k);
        sp.rot('shinL', 0.3 * k);
        sp.rot('shinR', 0.3 * k);
        break;
      }
      case 'dead': {
        const k = Math.min(1, t / 0.7);
        sp.rot('body', -ease(k) * 1.5, 0, 0.2 * k);
        sp.pos('body', 0, 0.12 * k);
        sp.rot('armL', -2.3 * k, 0, -0.6);
        sp.rot('armR', -2.0 * k, 0, 0.8);
        sp.rot('head', -0.4 * k, 0.6 * k);
        sp.rot('thighL', -0.3 * k);
        sp.rot('shinR', 0.6 * k);
        break;
      }
      case 'kneel': {
        // Down on one knee, arms open: come here, little one.
        sp.pos('body', 0, -0.16, 0);
        sp.rot('thighL', -1.3);
        sp.rot('shinL', 1.4);
        sp.rot('thighR', 0.3);
        sp.rot('shinR', 1.6);
        sp.rot('armL', -1.1, 0, -0.7);
        sp.rot('armR', -1.1, 0, 0.7);
        sp.rot('torso', 0.25);
        sp.rot('head', 0.2);
        break;
      }
      case 'hug': {
        // Holding Youser close and swaying with joy.
        const sway = Math.sin(t * 3);
        sp.rot('armL', -1.25, 0.6, -0.1);
        sp.rot('armR', -1.25, -0.6, 0.1);
        sp.rot('foreL', -1.3);
        sp.rot('foreR', -1.3);
        sp.rot('body', 0, 0, sway * 0.12);
        sp.rot('head', 0.25, 0, -sway * 0.15);
        sp.pos('body', 0, Math.abs(Math.sin(t * 6)) * 0.04 * Math.max(0, 1 - t / 3));
        break;
      }
      case 'walk':
      case 'climb':
        break;
    }
    sp.step(dt, snap);

    // Blink now and then (and hold the eyes half-shut when hurt or dead).
    blinkT -= dt;
    let lid = 1;
    if (blinkT < 0.12) lid = 1.9;
    if (blinkT <= 0) blinkT = 2 + Math.random() * 4;
    if (pose === 'dead') lid = 2.1;
    if (pose === 'hurt' && t < 0.3) lid = 1.7;
    // Lids roll down over the front of the eyes.
    for (const l of lids) l.rotation.x = 0.35 + (lid - 1) * 1.0;
  };

  return {
    root, headTop, hand, tip, chest, animate,
    flinch(strength = 1) {
      sp.kick('torso', -9 * strength, (Math.random() - 0.5) * 6 * strength, 0);
      sp.kick('head', -12 * strength, 0, (Math.random() - 0.5) * 8 * strength);
      sp.kick('body', 0, 0, 0, 0.6 * strength);
    },
  };
}
