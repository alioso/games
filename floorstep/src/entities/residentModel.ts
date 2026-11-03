// The residents' bodies: the heroes' scruffy comic build without weapons, greyed for the old folk,
// shrunk for the kids, plus hats, glasses and whatever they're busy with (pipes, pots, books...).
import * as THREE from 'three';
import { ANIMALS } from '../data/heroes';
import type { Resident } from '../data/residents';
import { ball, block, cyl, ink, part, toon } from '../world/toon';
import { buildHero, type HeroRig, type Pose } from './heroModel';

export interface ResidentRig {
  rig: HeroRig;
  /** Things standing in front of them (pot, tea table, marbles), in the same group. */
  root: THREE.Group;
  /** Where pipe smoke and snores come out. */
  puffAt: THREE.Object3D;
  /** Their everyday pose. */
  pose: Pose;
}

const INKC = 0x14100e;

function hat(kind: Resident['hat'], color: number) {
  const g = new THREE.Group();
  switch (kind) {
    case 'chef':
      g.add(cyl(0.11, 0.11, 0.14, 0xf4f0e8, 0, 0, 0));
      for (const [x, z] of [[0, 0], [0.07, 0.03], [-0.07, 0.02], [0, -0.06]]) g.add(ball(0.09, 0xf4f0e8, x, 0.2, z));
      g.position.y = 0.1;
      break;
    case 'bonnet': {
      const b = part(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), color);
      b.rotation.x = -0.3;
      g.add(b);
      g.add(part(new THREE.TorusGeometry(0.15, 0.015, 5, 16), 0xf0e0f0, 0, 0.0, 0.02).rotateX(Math.PI / 2 - 0.3));
      g.position.y = 0.02;
      break;
    }
    case 'cap': {
      g.add(part(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), color));
      const visor = block(0.16, 0.015, 0.12, color, 0, 0, -0.18);
      g.add(visor);
      g.position.y = 0.05;
      g.rotation.y = 0.4;
      break;
    }
    case 'nightcap': {
      const c = part(new THREE.ConeGeometry(0.14, 0.32, 10), color, 0.05, 0.16, 0);
      c.rotation.z = -0.7;
      g.add(c);
      g.add(ball(0.04, 0xf0f0f0, 0.2, 0.26, 0));
      g.position.y = 0.08;
      break;
    }
    case 'turban':
      for (let i = 0; i < 3; i++) g.add(part(new THREE.TorusGeometry(0.13 - i * 0.025, 0.045, 6, 16), color, 0, i * 0.05, 0).rotateX(Math.PI / 2));
      g.add(ball(0.03, 0xe8c040, 0, 0.04, 0.15));
      g.add(part(new THREE.ConeGeometry(0.012, 0.12, 4), 0xf0e0f0, 0.02, 0.18, 0.12).rotateZ(-0.3));
      g.position.y = 0.1;
      break;
    default:
      break;
  }
  return g;
}

function glasses() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(part(new THREE.TorusGeometry(0.035, 0.006, 5, 14), INKC, s * 0.04, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.02, 0.006, 0.006), INKC));
  g.position.set(0, 0.085, 0.13);
  return g;
}

export function buildResident(def: Resident): ResidentRig {
  const look = { cls: 'wizard' as const, animal: def.animal, sex: def.sex, costume: def.costume, accent: def.accent, name: def.name, weapon: 'sword' };
  // Old folk go grey.
  const skin = def.old ? new THREE.Color(ANIMALS[def.animal].skin).lerp(new THREE.Color(0xb8b4ac), 0.5).getHex() : undefined;
  const rig = buildHero(look, { bare: true, skin, robe: def.old && (def.sex === 'f' || def.glasses === true) });
  const root = new THREE.Group();
  root.add(rig.root);
  if (def.kid) {
    rig.root.scale.setScalar(0.72);
    rig.head.scale.setScalar(1.25);
  }
  if (def.hat && def.hat !== 'none') rig.head.add(hat(def.hat, def.accent));
  if (def.glasses) rig.head.add(glasses());
  const puffAt = new THREE.Object3D();
  puffAt.position.set(0, 0.0, 0.25);
  rig.head.add(puffAt);
  const props = new THREE.Group();
  let pose: Pose = def.sits ? 'sit' : 'idle';

  switch (def.activity) {
    case 'pipe': {
      pose = 'puff';
      const pipe = new THREE.Group();
      pipe.add(cyl(0.025, 0.02, 0.05, 0x4a2a1a, 0.0, 0.0, 0.12));
      pipe.add(part(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 4), 0x2a1a10, 0, 0.0, 0.05).rotateX(Math.PI / 2));
      rig.hand.add(pipe);
      puffAt.removeFromParent();
      puffAt.position.set(0, 0.06, 0.12);
      pipe.add(puffAt);
      break;
    }
    case 'stir': {
      pose = 'stir';
      // A big black cauldron bubbling in front of them.
      props.add(cyl(0.26, 0.22, 0.42, 0x2a2626, 0, 0, 0.5));
      props.add(part(new THREE.TorusGeometry(0.26, 0.025, 6, 18), 0x3a3434, 0, 0.42, 0.5).rotateX(Math.PI / 2));
      const soup = cyl(0.23, 0.23, 0.02, toon(0x6a8a3a, 0.4), 0, 0.38, 0.5);
      props.add(soup);
      for (const s of [-1, 1]) props.add(cyl(0.03, 0.03, 0.1, 0x2a2626, s * 0.15, -0.02, 0.5));
      const spoon = new THREE.Group();
      spoon.add(part(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), 0x6a4a2a, 0, -0.2, 0));
      spoon.add(ball(0.04, 0x6a4a2a, 0, -0.45, 0));
      spoon.rotation.x = 0.6;
      rig.hand.add(spoon);
      puffAt.removeFromParent();
      puffAt.position.set(0, 0.45, 0.5);
      props.add(puffAt);
      break;
    }
    case 'read': {
      pose = def.sits ? 'read' : 'read';
      const book = new THREE.Group();
      for (const s of [-1, 1]) {
        const page = block(0.14, 0.18, 0.012, 0xf0e8d0, s * 0.07, -0.09, 0);
        page.rotation.y = s * 0.25;
        book.add(page);
      }
      book.add(block(0.3, 0.2, 0.01, 0x6a2a2a, 0, -0.1, -0.01));
      book.position.set(-0.08, -0.05, 0.08);
      book.rotation.x = -0.6;
      rig.hand.add(book);
      break;
    }
    case 'knit': {
      pose = 'knit';
      for (const h of [rig.hand, rig.handL]) h.add(part(new THREE.CylinderGeometry(0.005, 0.005, 0.25, 3), 0xc8c8d0, 0, 0, 0.08).rotateX(1.2));
      const scarf = block(0.12, 0.2, 0.02, def.accent, 0, -0.1, 0.1);
      rig.handL.add(scarf);
      props.add(ball(0.08, def.accent, 0.25, 0.08, 0.35));
      break;
    }
    case 'cards': {
      pose = 'read';
      // A little round table covered in fortune-telling cards.
      props.add(cyl(0.3, 0.3, 0.03, 0x5a2a6a, 0, 0.55, 0.5));
      props.add(cyl(0.04, 0.06, 0.55, 0x3a2a1a, 0, 0, 0.5));
      for (let i = 0; i < 5; i++) {
        const card = block(0.07, 0.003, 0.1, i === 2 ? 0xe8c040 : 0xf0e8d8, -0.16 + i * 0.08, 0.585, 0.5);
        card.rotation.y = (i - 2) * 0.2;
        props.add(card);
      }
      props.add(ball(0.06, toon(0xa0c0ff, 0.6), 0, 0.64, 0.38));
      break;
    }
    case 'snore': {
      pose = 'snore';
      const paper = block(0.3, 0.22, 0.01, 0xe8e0c8, 0, -0.08, 0.06);
      paper.rotation.x = -1.2;
      rig.hand.add(paper);
      break;
    }
    case 'marbles': {
      pose = 'play';
      // Marbles. They're eyeballs.
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        const e = ball(0.035, 0xf4f0e8, Math.cos(a) * 0.3, 0.035, 0.4 + Math.sin(a) * 0.2);
        e.add(ball(0.015, i % 2 ? 0x3a6ad0 : 0x3a9a3a, 0, 0.0, 0.028));
        props.add(e);
      }
      break;
    }
    case 'bugs': {
      pose = 'play';
      const jar = new THREE.Group();
      jar.add(cyl(0.07, 0.07, 0.16, new THREE.MeshToonMaterial({ color: 0xc8e0e8, transparent: true, opacity: 0.55 }), 0, -0.08, 0));
      for (let i = 0; i < 3; i++) jar.add(ball(0.02, 0x3a6a2a, (i - 1) * 0.03, -0.03 + i * 0.03, 0));
      jar.add(cyl(0.075, 0.075, 0.02, 0x8a6a3a, 0, 0.08, 0));
      rig.handL.add(jar);
      break;
    }
    case 'tea': {
      pose = 'play';
      // A tiny table with a teapot, cups, and Mister Button (a doll) as the guest.
      props.add(cyl(0.22, 0.22, 0.02, 0xf0e0f0, 0, 0.25, 0.42));
      props.add(cyl(0.03, 0.04, 0.25, 0xd0b0c0, 0, 0, 0.42));
      props.add(ball(0.06, 0xf4f0e8, 0.05, 0.31, 0.42));
      for (const x of [-0.12, 0.13]) props.add(cyl(0.025, 0.02, 0.03, 0xf4f0e8, x, 0.27, 0.45));
      const doll = new THREE.Group();
      doll.add(ball(0.07, 0xc89a6a, 0, 0.07, 0));
      doll.add(ball(0.06, 0xe0c0a0, 0, 0.18, 0));
      for (const s of [-1, 1]) doll.add(cyl(0.018, 0.018, 0.005, INKC, s * 0.022, 0.19, 0.055).rotateX(Math.PI / 2));
      doll.position.set(0, 0, 0.75);
      doll.rotation.y = Math.PI;
      props.add(doll);
      break;
    }
    case 'hide':
      pose = 'peek';
      break;
  }
  ink(props);
  root.add(props);
  return { rig, root, puffAt, pose };
}
