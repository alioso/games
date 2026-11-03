// 3D models for every piece of furniture, built from simple shapes and inked.
// Each model stands on y=0, centred on its footprint, with its front facing +z.
import * as THREE from 'three';
import { rng } from '@engine/math';
import { FURNITURE, type FurnitureKind } from '../data/furniture';
import { ball, block, cyl, glow, hinge, ink, part, toon, toonOwn } from './toon';
import { booksTexture, paintingTexture } from './textures';

export interface FurnitureModel {
  group: THREE.Group;
  /** Search animation, t from 0 (closed) to 1 (fully open). */
  open?: (t: number) => void;
  /** Idle animation (flames, pendulums, rocking), time in seconds. */
  tick?: (time: number, hero?: THREE.Vector3) => void;
}

const WOOD = 0x7a4a2a, WOOD_D = 0x5a3420, WOOD_L = 0xa0703f, IRON = 0x34302e, BRASS = 0xc8a040;
const DARK = 0x1c130d;

function lathe(points: [number, number][], color: THREE.ColorRepresentation, seg = 16) {
  return part(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), color);
}

function knob(x: number, y: number, z: number) {
  return ball(0.035, BRASS, x, y, z);
}

function flame(x: number, y: number, z: number, s = 1) {
  const f = part(new THREE.ConeGeometry(0.035 * s, 0.11 * s, 8), glow(0xffb040, 3), x, y + 0.05 * s, z);
  f.castShadow = false;
  return f;
}

export function makeFurniture(kind: FurnitureKind, seed: number): FurnitureModel {
  const R = rng(seed * 31 + 7);
  const [w, d, h] = FURNITURE[kind].size;
  const g = new THREE.Group();
  let open: FurnitureModel['open'];
  let tick: FurnitureModel['tick'];
  const flames: THREE.Mesh[] = [];
  const front = d / 2;

  switch (kind) {
    case 'wardrobe': {
      const wood = R.pick([WOOD, WOOD_D, 0x6a3a3a]);
      g.add(block(w, h - 0.1, d, wood, 0, 0.1, 0));
      g.add(block(w + 0.1, 0.12, d + 0.08, WOOD_D, 0, h - 0.12, 0));
      for (const sx of [-1, 1]) g.add(block(0.1, 0.1, 0.1, WOOD_D, sx * (w / 2 - 0.08), 0, front - 0.08));
      g.add(block(w - 0.1, h - 0.3, 0.02, DARK, 0, 0.18, front - 0.01));
      // Something hanging inside.
      g.add(block(0.35, 0.8, 0.12, R.pick([0x8a2a2a, 0x2a4a7a, 0x4a6a3a]), -0.25, 0.9, front - 0.15));
      g.add(block(0.3, 0.9, 0.12, R.pick([0xb0a080, 0x5a3a6a]), 0.2, 0.8, front - 0.15));
      const doorW = w / 2 - 0.03;
      const left = hinge(-w / 2 + 0.02, 0, front + 0.03, block(doorW, h - 0.32, 0.05, wood, -w / 2 + 0.02 + doorW / 2, 0.18, front + 0.03));
      const right = hinge(w / 2 - 0.02, 0, front + 0.03, block(doorW, h - 0.32, 0.05, wood, w / 2 - 0.02 - doorW / 2, 0.18, front + 0.03));
      left.add(knob(doorW - 0.08, 1.0, 0.04));
      right.add(knob(-doorW + 0.08, 1.0, 0.04));
      g.add(left, right);
      open = (t) => { left.rotation.y = -t * 1.9; right.rotation.y = t * 1.9; };
      break;
    }
    case 'bookcase': {
      g.add(block(w, h, d, WOOD_D));
      const books = toonOwn(0xffffff, 0, booksTexture(seed));
      const wood = toon(WOOD_D);
      const shelves = 4;
      for (let i = 0; i < shelves; i++) {
        const y = 0.15 + i * ((h - 0.25) / shelves);
        const row = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, (h - 0.35) / shelves - 0.06, 0.06), [wood, wood, wood, wood, books, wood]);
        row.position.set(0, y + (h - 0.35) / shelves / 2, front);
        g.add(row);
      }
      g.add(block(w + 0.08, 0.1, d + 0.06, WOOD, 0, h - 0.1, 0));
      break;
    }
    case 'chest':
    case 'toybox': {
      const toy = kind === 'toybox';
      const base = toy ? R.pick([0xd06a5a, 0x5a8ad0, 0x6ab05a]) : R.pick([WOOD, 0x6a4028]);
      const bh = h * 0.65;
      g.add(block(w, bh, d, base));
      if (!toy) for (const sx of [-0.32, 0.32]) g.add(block(0.07, bh + 0.01, d + 0.02, IRON, sx * w, 0, 0));
      const lid = new THREE.Group();
      const top = part(new THREE.CylinderGeometry(d / 2, d / 2, w, 14, 1, false, 0, Math.PI), toy ? 0xf0d060 : base);
      top.rotation.z = Math.PI / 2;
      top.scale.set(0.55, 1, 1);
      top.position.set(0, 0, d / 2);
      lid.add(top);
      if (!toy) lid.add(block(0.14, 0.14, 0.04, BRASS, 0, -0.1, d + 0.01));
      const hg = new THREE.Group();
      hg.position.set(0, bh, -d / 2);
      hg.add(lid);
      g.add(hg);
      g.add(block(w - 0.08, 0.02, d - 0.08, DARK, 0, bh - 0.04, 0));
      if (toy) g.add(ball(0.12, 0xe04040, 0.2, bh + 0.02, 0));
      open = (t) => { hg.rotation.x = -t * 1.9; };
      break;
    }
    case 'dresser':
    case 'desk': {
      const isDesk = kind === 'desk';
      const wood = R.pick([WOOD, WOOD_D]);
      if (isDesk) {
        g.add(block(w, 0.06, d, wood, 0, h - 0.06, 0));
        g.add(block(0.45, h - 0.06, d - 0.04, wood, -w / 2 + 0.25, 0, 0));
        g.add(block(0.06, h - 0.06, d - 0.08, wood, w / 2 - 0.05, 0, 0));
        g.add(block(0.3, 0.02, 0.22, 0xe8dcc0, 0.15, h, 0).rotateY(0.2));
        g.add(cyl(0.04, 0.05, 0.07, IRON, 0.45, h, -0.15));
      } else {
        g.add(block(w, h, d, wood));
        g.add(block(w + 0.06, 0.05, d + 0.04, WOOD_D, 0, h - 0.05, 0));
        g.add(cyl(0.08, 0.1, 0.22, R.pick([0x5a7ab0, 0xb05a5a]), w * 0.3, h, 0));
      }
      const drawers: THREE.Group[] = [];
      const n = 3;
      for (let i = 0; i < n; i++) {
        const dw = isDesk ? 0.4 : w - 0.12;
        const dh = isDesk ? (h - 0.14) / 3 - 0.04 : (h - 0.16) / 3 - 0.04;
        const x = isDesk ? -w / 2 + 0.25 : 0;
        const y = 0.06 + i * (dh + 0.04);
        const dr = new THREE.Group();
        dr.add(block(dw, dh, 0.05, WOOD_L, x, y, front + 0.02));
        dr.add(knob(x, y + dh / 2, front + 0.06));
        g.add(dr);
        drawers.push(dr);
      }
      open = (t) => drawers.forEach((dr, i) => (dr.position.z = t * (0.18 + 0.1 * ((i + 1) % 3))));
      break;
    }
    case 'crate': {
      g.add(block(w, h, d, 0xa07a4a));
      for (const y of [0.04, h - 0.12]) for (const sz of [-1, 1]) g.add(block(w + 0.02, 0.08, 0.03, 0x7a5a32, 0, y, sz * (d / 2 + 0.005)));
      for (const sz of [-1, 1]) {
        const brace = block(0.08, h * 1.25, 0.03, 0x7a5a32, 0, 0, 0);
        brace.position.set(0, h / 2, sz * (d / 2 + 0.01));
        brace.rotation.z = 0.78;
        g.add(brace);
      }
      break;
    }
    case 'barrel': {
      const r = w / 2;
      g.add(lathe([[0, 0], [r * 0.82, 0], [r, h * 0.5], [r * 0.82, h], [0, h]], 0x8a5a30));
      for (const y of [0.15, h - 0.15]) {
        const hoop = part(new THREE.TorusGeometry(r * 0.88, 0.022, 6, 20), IRON, 0, y, 0);
        hoop.rotation.x = Math.PI / 2;
        g.add(hoop);
      }
      const lid = cyl(r * 0.8, r * 0.8, 0.04, 0x6a4020, r * 0.8, 0, 0);
      const hg = new THREE.Group();
      hg.position.set(-r * 0.8, h, 0);
      hg.add(lid);
      g.add(hg);
      open = (t) => { hg.rotation.z = t * 1.6; };
      break;
    }
    case 'vase': {
      const c = R.pick([0x3a6ab0, 0xb04a3a, 0x4a8a6a, 0xd0b060]);
      g.add(lathe([[0, 0], [0.13, 0], [0.22, 0.3], [0.1, 0.62], [0.08, 0.72], [0.12, h]], c));
      g.add(part(new THREE.TorusGeometry(0.16, 0.02, 6, 20), 0xf0e0b0, 0, 0.32, 0).rotateX(Math.PI / 2));
      break;
    }
    case 'laundry': {
      const colors = [0xd0d0c0, 0x8a2a2a, 0x3a5a8a, 0xd0a040, 0x6a8a4a, 0xe0b0c0];
      for (let i = 0; i < 9; i++) {
        const s = ball(R.range(0.16, 0.26), R.pick(colors), R.range(-w / 2 + 0.2, w / 2 - 0.2), R.range(0.08, h * 0.6), R.range(-d / 2 + 0.2, d / 2 - 0.2));
        s.scale.set(R.range(1, 1.6), R.range(0.4, 0.7), R.range(0.9, 1.3));
        s.rotation.y = R.range(0, 3);
        g.add(s);
      }
      // A single sock on top.
      g.add(block(0.08, 0.06, 0.24, 0xf0f0e0, 0.05, h * 0.75, 0).rotateY(0.6));
      break;
    }
    case 'bed': {
      const blanket = R.pick([0x7a2a3a, 0x2a4a7a, 0x4a6a3a, 0x8a6a2a]);
      g.add(block(w, 0.3, d, WOOD, 0, 0.12, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(0.09, 0.14, 0.09, WOOD_D, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)));
      g.add(block(w - 0.08, 0.16, d - 0.1, 0xe8e0d0, 0, 0.42, 0.02));
      g.add(block(w - 0.02, 0.1, d * 0.62, blanket, 0, 0.5, d * 0.18));
      g.add(block(w * 0.7, 0.12, 0.32, 0xf4f0e6, 0, 0.56, -d / 2 + 0.3));
      g.add(block(w + 0.05, 1.05, 0.08, WOOD_D, 0, 0, -d / 2 + 0.04));
      g.add(ball(0.06, BRASS, -w / 2, 1.05, -d / 2 + 0.04));
      g.add(ball(0.06, BRASS, w / 2, 1.05, -d / 2 + 0.04));
      g.add(block(w + 0.05, 0.55, 0.07, WOOD_D, 0, 0, d / 2 - 0.035));
      break;
    }
    case 'toilet': {
      g.add(block(0.42, 0.55, 0.2, 0xf0f0ea, 0, 0.3, -d / 2 + 0.12));
      g.add(lathe([[0, 0], [0.16, 0], [0.2, 0.25], [0.24, 0.4], [0, 0.4]], 0xf0f0ea).translateZ(0.08));
      const lid = cyl(0.23, 0.23, 0.03, 0xe0e0d8, 0, 0, 0.23);
      const hg = new THREE.Group();
      hg.position.set(0, 0.41, -0.15);
      lid.position.y = 0;
      hg.add(lid);
      g.add(hg);
      g.add(cyl(0.18, 0.18, 0.01, 0x6a8a5a, 0, 0.38, 0.08));
      g.add(block(0.08, 0.03, 0.05, IRON, 0.18, 0.75, -d / 2 + 0.24));
      open = (t) => { hg.rotation.x = -t * 1.6; };
      break;
    }
    case 'bathtub': {
      g.add(block(w, h - 0.12, d, 0xf0ece0, 0, 0.12, 0));
      // Murky water. Who knows what's in there.
      const water = block(w - 0.16, 0.02, d - 0.16, toonOwn(0x5a7a4a, 0.1), 0, h - 0.12, 0);
      g.add(water);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(0.07, BRASS, sx * (w / 2 - 0.15), 0.06, sz * (d / 2 - 0.12)));
      g.add(cyl(0.025, 0.025, 0.25, BRASS, -w / 2 + 0.12, h - 0.1, 0));
      g.add(ball(0.06, 0xf0d040, R.range(-0.3, 0.3), h - 0.06, 0.1));
      tick = (time) => { water.position.y = h - 0.11 + Math.sin(time * 1.3 + seed) * 0.006; };
      break;
    }
    case 'sinkCab':
    case 'counter': {
      const sink = kind === 'sinkCab';
      const body = sink ? 0xe8e0d0 : R.pick([0x5a7a5a, 0x7a5a3a, 0x8a3a3a]);
      g.add(block(w, h - 0.06, d, body));
      g.add(block(w + 0.04, 0.06, d + 0.04, sink ? 0xd0c8b8 : 0x3a3430, 0, h - 0.06, 0));
      g.add(block(w - 0.08, h - 0.2, 0.02, DARK, 0, 0.08, front - 0.01));
      const dw = w / 2 - 0.05;
      const left = hinge(-w / 2 + 0.04, 0, front + 0.02, block(dw, h - 0.22, 0.04, body, -w / 2 + 0.04 + dw / 2, 0.08, front + 0.02));
      const right = hinge(w / 2 - 0.04, 0, front + 0.02, block(dw, h - 0.22, 0.04, body, w / 2 - 0.04 - dw / 2, 0.08, front + 0.02));
      left.add(knob(dw - 0.06, h * 0.6, 0.03));
      right.add(knob(-dw + 0.06, h * 0.6, 0.03));
      g.add(left, right);
      if (sink) {
        g.add(cyl(0.22, 0.18, 0.04, 0xb0b8b8, 0, h - 0.03, 0.02));
        g.add(cyl(0.02, 0.02, 0.22, 0xb0b0b0, 0, h, -d / 2 + 0.08));
      } else {
        g.add(cyl(0.08, 0.08, 0.16, R.pick([0xd0c070, 0x8ab0b0]), -0.25, h, -0.05));
        g.add(cyl(0.14, 0.12, 0.14, IRON, 0.22, h, 0));
      }
      open = (t) => { left.rotation.y = -t * 1.8; right.rotation.y = t * 1.8; };
      break;
    }
    case 'oven': {
      g.add(block(w, h, d, IRON));
      g.add(block(w + 0.04, 0.05, d + 0.04, 0x222020, 0, h, 0));
      for (const sx of [-0.2, 0.2]) g.add(cyl(0.1, 0.1, 0.02, 0x111, sx, h + 0.05, 0.05));
      g.add(cyl(0.16, 0.14, 0.18, 0x5a5a5a, 0.2, h + 0.06, 0.05));
      // Stove pipe up to the ceiling.
      g.add(cyl(0.08, 0.08, 1.6, 0x222020, 0, h, -d / 2 + 0.12));
      g.add(block(w - 0.14, h * 0.5, 0.02, DARK, 0, 0.12, front - 0.01));
      const door = block(w - 0.12, h * 0.5, 0.05, 0x4a4442, 0, 0, 0);
      door.add(block(0.4, 0.04, 0.04, BRASS, 0, h * 0.5 - 0.1, 0.04));
      const hg = new THREE.Group();
      hg.position.set(0, 0.12, front + 0.03);
      hg.add(door);
      g.add(hg);
      open = (t) => { hg.rotation.x = t * 1.45; };
      break;
    }
    case 'fridge': {
      const c = R.pick([0xe8e0c8, 0x9ac0b0, 0xd0a0a0]);
      g.add(block(w, h, d, c));
      g.add(block(w - 0.08, h - 0.12, 0.02, 0x2a3438, 0, 0.06, front - 0.01));
      // Something unspeakable inside.
      g.add(ball(0.12, 0x6a8a3a, 0.1, 1.2, front - 0.2));
      g.add(block(0.2, 0.15, 0.15, 0xd0c060, -0.15, 0.7, front - 0.2));
      const hg = new THREE.Group();
      hg.position.set(-w / 2 + 0.02, 0, front + 0.03);
      hg.add(block(w - 0.04, h - 0.08, 0.06, c, (w - 0.04) / 2, 0.04, 0));
      hg.add(block(0.04, 0.4, 0.06, 0x888888, w - 0.14, h * 0.45, 0.05));
      g.add(hg);
      open = (t) => { hg.rotation.y = -t * 1.9; };
      break;
    }
    case 'table': {
      const cloth = R.next() < 0.5;
      g.add(block(w, 0.07, d, cloth ? 0xe8e0d0 : WOOD, 0, h - 0.07, 0));
      if (cloth) for (const sz of [-1, 1]) g.add(block(w + 0.04, 0.2, 0.02, 0xe8e0d0, 0, h - 0.24, sz * (d / 2 + 0.01)));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(0.08, h - 0.07, 0.08, WOOD_D, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)));
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.25, 0.25]) g.add(cyl(0.12, 0.1, 0.02, 0xf0ece0, sx, h, sz));
      g.add(cyl(0.05, 0.07, 0.2, BRASS, 0, h, 0));
      g.add(cyl(0.025, 0.025, 0.14, 0xf0ead0, 0, h + 0.2, 0));
      const f = flame(0, h + 0.34, 0, 0.8);
      g.add(f);
      flames.push(f);
      // A suspicious roast.
      const roast = ball(0.13, 0x9a5a2a, 0.3, h + 0.08, 0);
      roast.scale.set(1.3, 0.8, 1);
      g.add(roast);
      break;
    }
    case 'chair': {
      const c = R.pick([WOOD, WOOD_D]);
      g.add(block(0.44, 0.05, 0.42, c, 0, 0.44, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(0.05, 0.44, 0.05, c, sx * 0.18, 0, sz * 0.17));
      g.add(block(0.44, 0.5, 0.05, c, 0, 0.49, -0.19));
      break;
    }
    case 'sofa':
    case 'armchair': {
      const c = R.pick([0x7a2a2a, 0x3a5a4a, 0x5a3a6a, 0x8a6a3a]);
      g.add(block(w, 0.32, d, c, 0, 0.1, 0));
      g.add(block(w, 0.55, 0.2, c, 0, 0.3, -d / 2 + 0.1));
      for (const sx of [-1, 1]) g.add(block(0.16, 0.3, d, c, sx * (w / 2 - 0.08), 0.32, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(block(0.07, 0.1, 0.07, WOOD_D, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)));
      const n = kind === 'sofa' ? 2 : 1;
      const cw = (w - 0.32) / n;
      for (let i = 0; i < n; i++) g.add(block(cw - 0.03, 0.12, d - 0.24, toon(new THREE.Color(c).multiplyScalar(1.15)), -w / 2 + 0.16 + cw * (i + 0.5), 0.42, 0.08));
      break;
    }
    case 'fireplace': {
      const stone = 0x7a7068;
      g.add(block(0.32, 1.1, d, stone, -w / 2 + 0.16, 0, 0));
      g.add(block(0.32, 1.1, d, stone, w / 2 - 0.16, 0, 0));
      g.add(block(w, 0.3, d, stone, 0, 0.8, 0));
      g.add(block(w + 0.2, 0.1, d + 0.12, WOOD_D, 0, 1.1, 0.02));
      g.add(block(w - 0.2, 1.4, d * 0.6, stone, 0, 1.2, -d * 0.2));
      g.add(block(w - 0.64, 0.8, 0.04, 0x0e0806, 0, 0, -d / 2 + 0.1));
      g.add(block(w - 0.64, 0.04, d - 0.1, 0x3a3230, 0, 0, 0));
      // Logs and flames.
      for (const sx of [-0.15, 0.15]) g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), 0x4a2a16, sx, 0.1, 0).rotateZ(Math.PI / 2).rotateY(sx * 2));
      for (let i = 0; i < 5; i++) {
        const f = part(new THREE.ConeGeometry(R.range(0.07, 0.12), R.range(0.3, 0.5), 7), glow(i % 2 ? 0xff7a20 : 0xffc040, 2.6), R.range(-0.28, 0.28), 0.3, R.range(-0.1, 0.1));
        f.castShadow = false;
        g.add(f);
        flames.push(f);
      }
      // Stuff on the mantel.
      g.add(cyl(0.05, 0.06, 0.18, BRASS, -0.5, 1.2, 0));
      g.add(ball(0.09, 0xe8e0c8, 0.45, 1.29, 0));
      g.add(ball(0.025, 0x111, 0.42, 1.31, 0.08));
      g.add(ball(0.025, 0x111, 0.48, 1.31, 0.08));
      break;
    }
    case 'painting': {
      const frame = block(w, h, 0.06, BRASS, 0, 0, 0.03);
      frame.position.y = -h / 2;
      const cw = w - 0.12, ch = h - 0.12;
      const canvas = part(new THREE.PlaneGeometry(cw, ch), toonOwn(0xffffff, 0.15, paintingTexture(seed)), 0, 0, 0.035);
      frame.add(canvas);
      // Portraits (all but the landscape) have eyes that follow you.
      if (seed % 4 !== 2) {
        const pupils: THREE.Mesh[] = [];
        for (const px of [56, 72]) {
          const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), new THREE.MeshBasicMaterial({ color: 0x14100e }));
          pupil.position.set((px / 128 - 0.5) * cw, (0.5 - 38 / 100) * ch, 0.003);
          pupil.userData.base = pupil.position.clone();
          canvas.add(pupil);
          pupils.push(pupil);
        }
        const local = new THREE.Vector3();
        tick = (_time, hero) => {
          if (!hero) return;
          local.copy(hero).setY(1.0);
          canvas.worldToLocal(local);
          const l = Math.hypot(local.x, local.y) || 1;
          for (const p of pupils) p.position.set(p.userData.base.x + (local.x / l) * 0.007, p.userData.base.y + (local.y / l) * 0.007, 0.003);
        };
      }
      const hg = new THREE.Group();
      hg.position.set(0, 1.85, -d / 2);
      hg.add(frame);
      g.add(hg);
      // What the painting hides: a dark hole in the wall.
      g.add(block(0.4, 0.3, 0.01, DARK, 0, 1.4, -d / 2 + 0.005));
      open = (t) => { hg.rotation.x = -t * 0.75; hg.rotation.z = t * 0.15; };
      break;
    }
    case 'cradle': {
      const rock = new THREE.Group();
      g.add(rock);
      const c = 0xe8d8c0;
      for (const sz of [-1, 1]) {
        const runner = part(new THREE.TorusGeometry(0.5, 0.03, 6, 16, Math.PI * 0.5), WOOD, 0, 0.5, sz * (d / 2 - 0.08));
        runner.rotation.z = Math.PI * 1.25;
        rock.add(runner);
      }
      rock.add(block(w, 0.4, d - 0.2, c, 0, 0.32, 0));
      rock.add(block(w - 0.1, 0.05, d - 0.3, 0xa0c0e0, 0, 0.7, 0));
      rock.add(block(w, 0.35, 0.06, c, 0, 0.7, -d / 2 + 0.13));
      // A doll with button eyes.
      rock.add(ball(0.09, 0xe0c0a0, 0, 0.8, -d / 2 + 0.35));
      rock.add(ball(0.02, 0x111, -0.03, 0.82, -d / 2 + 0.43));
      rock.add(ball(0.02, 0x111, 0.03, 0.82, -d / 2 + 0.43));
      tick = (time) => { rock.rotation.z = Math.sin(time * 1.4 + seed) * 0.08; };
      break;
    }
    case 'clock': {
      g.add(block(w, h - 0.5, d, WOOD_D, 0, 0, 0));
      g.add(block(w + 0.1, 0.5, d + 0.06, WOOD, 0, h - 0.5, 0));
      g.add(cyl(0.2, 0.2, 0.03, 0xf0ead8, 0, h - 0.47, front + 0.04).rotateX(Math.PI / 2));
      const hands = new THREE.Group();
      hands.position.set(0, h - 0.25, front + 0.07);
      hands.add(block(0.015, 0.14, 0.01, 0x111));
      hands.add(block(0.015, 0.1, 0.01, 0x111).rotateZ(2));
      g.add(hands);
      g.add(block(w - 0.14, h - 0.8, 0.02, DARK, 0, 0.2, front - 0.01));
      const pend = new THREE.Group();
      pend.position.set(0, h - 0.65, front - 0.05);
      pend.add(block(0.02, 0.7, 0.02, BRASS, 0, -0.7, 0));
      pend.add(cyl(0.08, 0.08, 0.03, BRASS, 0, -0.85, 0).rotateX(Math.PI / 2));
      g.add(pend);
      const dw = w - 0.12;
      const door = hinge(-w / 2 + 0.06, 0, front + 0.02, block(dw, h - 0.84, 0.04, WOOD, 0, 0.2, front + 0.02));
      (door.children[0] as THREE.Mesh).position.x = dw / 2;
      (door.children[0] as THREE.Mesh).material = new THREE.MeshToonMaterial({ color: WOOD, transparent: true, opacity: 0.5 });
      g.add(door);
      open = (t) => { door.rotation.y = -t * 1.8; };
      tick = (time) => { pend.rotation.z = Math.sin(time * Math.PI) * 0.25; hands.rotation.z = -time * 0.05; };
      break;
    }
    case 'piano': {
      g.add(block(w, h, d * 0.55, 0x1e1a1a, 0, 0, -d * 0.22));
      g.add(block(w, 0.12, d, 0x1e1a1a, 0, 0.65, 0));
      g.add(block(w - 0.1, 0.03, 0.16, 0xf4f0e6, 0, 0.77, front - 0.1));
      for (let i = 0; i < 12; i++) g.add(block(0.04, 0.03, 0.09, 0x111, -w / 2 + 0.15 + i * ((w - 0.3) / 11), 0.79, front - 0.13));
      for (const sx of [-1, 1]) g.add(block(0.08, 0.65, 0.08, 0x1e1a1a, sx * (w / 2 - 0.05), 0, front - 0.05));
      const lid = block(w, 0.04, d * 0.55, 0x2a2424, 0, 0, d * 0.275);
      const hg = new THREE.Group();
      hg.position.set(0, h, -d / 2);
      hg.add(lid);
      g.add(hg);
      g.add(cyl(0.04, 0.06, 0.12, BRASS, w * 0.35, h, 0));
      open = (t) => { hg.rotation.x = -t * 1.3; };
      break;
    }
    case 'plant': {
      g.add(lathe([[0, 0], [0.16, 0], [0.24, 0.42], [0.26, 0.45], [0, 0.45]], 0xb05a34));
      const leaf = R.pick([0x3a7a3a, 0x5a8a2a, 0x6a6a3a]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const l = part(new THREE.ConeGeometry(0.08, 0.6, 5), leaf, Math.cos(a) * 0.12, 0.7, Math.sin(a) * 0.12);
        l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        g.add(l);
      }
      g.add(ball(0.14, leaf, 0, 0.85, 0));
      break;
    }
    case 'trash': {
      g.add(lathe([[0, 0], [0.2, 0], [0.24, h], [0, h]], 0x7a8080));
      g.add(cyl(0.26, 0.26, 0.04, 0x6a7070, 0.05, h, 0).rotateZ(0.2));
      g.add(block(0.12, 0.12, 0.1, 0xd0d0c0, -0.18, 0, 0.22).rotateY(0.5));
      break;
    }
    case 'sack': {
      const s = ball(0.32, 0xb09a6a, 0, 0.26, 0);
      s.scale.set(1, 0.85, 0.9);
      g.add(s);
      g.add(cyl(0.06, 0.12, 0.14, 0xb09a6a, 0, 0.5, 0));
      g.add(part(new THREE.TorusGeometry(0.07, 0.015, 5, 12), 0x5a4020, 0, 0.56, 0).rotateX(Math.PI / 2));
      break;
    }
    case 'boxes': {
      g.add(block(0.9, 0.55, 0.85, 0xc09a6a, 0, 0, 0));
      g.add(block(0.62, 0.42, 0.6, 0xb08a5a, -0.08, 0.55, 0).rotateY(0.15));
      g.add(block(0.4, 0.28, 0.38, 0xc8a070, 0.08, 0.97, 0.02).rotateY(-0.3));
      for (const y of [0.55, 0.97]) g.add(block(0.08, 0.005, 0.6, 0xd8c8a0, 0, y, 0));
      break;
    }
    case 'rug': {
      const c = R.pick([0x8a2a2a, 0x2a4a6a, 0x6a4a2a, 0x3a5a3a]);
      const flap = new THREE.Group();
      const rug = part(new THREE.BoxGeometry(w, 0.025, d), c, 0, 0.012, d / 2);
      rug.receiveShadow = true;
      rug.userData.noInk = true;
      flap.add(rug);
      const border = part(new THREE.BoxGeometry(w - 0.3, 0.03, d - 0.3), toon(new THREE.Color(c).multiplyScalar(1.4)), 0, 0.014, d / 2);
      border.userData.noInk = true;
      flap.add(border);
      const mid = part(new THREE.BoxGeometry(w - 0.6, 0.035, d - 0.6), c, 0, 0.016, d / 2);
      mid.userData.noInk = true;
      flap.add(mid);
      flap.position.z = -d / 2;
      g.add(flap);
      // A trap door under the rug!
      const trap = block(0.8, 0.005, 0.6, 0x3a2414, 0, 0.002, 0);
      trap.userData.noInk = true;
      g.add(trap);
      open = (t) => { flap.rotation.x = -t * 1.2; };
      break;
    }
    case 'coatrack': {
      g.add(cyl(0.2, 0.22, 0.05, WOOD_D));
      g.add(cyl(0.035, 0.035, h, WOOD_D));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.add(block(0.03, 0.03, 0.2, WOOD_D, Math.cos(a) * 0.08, h - 0.15, Math.sin(a) * 0.08).rotateY(-a + Math.PI / 2));
      }
      g.add(cyl(0.16, 0.2, 0.14, 0x2a2a2a, 0.02, h - 0.04, 0));
      g.add(cyl(0.28, 0.28, 0.02, 0x2a2a2a, 0.02, h - 0.05, 0));
      g.add(block(0.3, 0.7, 0.12, 0x6a3a2a, 0.1, h - 0.9, 0.08));
      break;
    }
    case 'lamp': {
      g.add(cyl(0.18, 0.2, 0.05, BRASS));
      g.add(cyl(0.025, 0.025, h - 0.3, BRASS, 0, 0.05, 0));
      const shade = cyl(0.12, 0.26, 0.32, toonOwn(0xe8c890, 0.5), 0, h - 0.34, 0);
      shade.material = new THREE.MeshToonMaterial({ color: 0xe8c890, emissive: 0x806030, side: THREE.DoubleSide });
      (shade as THREE.Mesh).geometry = new THREE.CylinderGeometry(0.12, 0.26, 0.32, 14, 1, true);
      g.add(shade);
      g.add(ball(0.06, glow(0xffe0a0, 2.5), 0, h - 0.22, 0));
      break;
    }
    case 'candles': {
      g.add(cyl(0.16, 0.2, 0.06, IRON));
      g.add(cyl(0.04, 0.05, 0.9, IRON, 0, 0.06, 0));
      g.add(block(0.6, 0.03, 0.03, IRON, 0, 0.96, 0));
      for (const x of [-0.28, 0, 0.28]) {
        const ch = x === 0 ? 0.24 : 0.16;
        g.add(cyl(0.03, 0.03, ch, 0xf0e8d0, x, 0.99, 0));
        const f = flame(x, 0.99 + ch, 0);
        g.add(f);
        flames.push(f);
      }
      // Wax drips.
      g.add(ball(0.025, 0xf0e8d0, -0.25, 1.0, 0.02));
      break;
    }
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o.material instanceof THREE.MeshBasicMaterial)) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  ink(g);
  if (flames.length) {
    const base = flames.map((f) => f.scale.y);
    const prev = tick;
    tick = (time) => {
      prev?.(time);
      flames.forEach((f, i) => {
        const n = Math.sin(time * 13 + i * 2.1 + seed) * 0.5 + Math.sin(time * 7.3 + i) * 0.5;
        f.scale.set(1 + n * 0.12, base[i] * (1 + n * 0.25), 1 + n * 0.12);
      });
    };
  }
  return { group: g, open, tick };
}
