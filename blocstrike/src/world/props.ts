import * as THREE from 'three';
import { rng } from '@engine/math';
import type { PropKind, Theme } from '../data/arenas';
import { makeRock, makeTree } from './nature';

// 3D models for arena props, plus what's left after they're destroyed.

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}

export interface PropModel {
  group: THREE.Group;
  /** Canopy materials that fade when a bloc walks behind (trees only). */
  canopy: THREE.MeshStandardMaterial[];
  /** Main colour, for the debris when it breaks. */
  debris: number;
  /** How high flames should appear when it burns. */
  top: number;
}

const ROCK_TINT: Record<Theme, [number, number]> = {
  meadow: [0x8d939a, 0x6f9a4a],
  volcano: [0x3b3436, 0x5a2a1c],
  jungle: [0x7d8a80, 0x4f8a3a],
  beach: [0xc9b48a, 0xb79c6c],
};

function jungleTree(r: number, seed: number): PropModel {
  const rand = rng(seed);
  const g = new THREE.Group();
  const s = r / 0.8;
  g.add(part(new THREE.CylinderGeometry(0.22 * s, 0.4 * s, 2.4 * s, 8), flat(0x5b3b23), 0, 1.2 * s, 0));
  const canopy = flat(rand.pick([0x1f6b2a, 0x23752f, 0x1a5e25]), { transparent: true });
  for (const [x, y, z, rad, sy] of [[0, 2.7, 0, 1.4, 0.55], [0.6, 3.1, 0.3, 1.0, 0.5], [-0.6, 3.0, -0.3, 1.0, 0.5], [0, 3.5, 0, 0.8, 0.5]]) {
    const m = part(new THREE.IcosahedronGeometry(rad * s, 1), canopy, x * s, y * s, z * s);
    m.scale.y = sy;
    g.add(m);
  }
  // Hanging vines.
  const vine = flat(0x2e7d32);
  for (let i = 0; i < 5; i++) {
    const a = rand.next() * Math.PI * 2, d = rand.range(0.6, 1.2) * s;
    const len = rand.range(0.7, 1.4);
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, len, 4), vine, Math.cos(a) * d, 2.5 * s - len / 2, Math.sin(a) * d));
  }
  g.rotation.y = rand.next() * Math.PI * 2;
  return { group: g, canopy: [canopy], debris: 0x5b3b23, top: 2.8 * s };
}

function palm(r: number, seed: number): PropModel {
  const rand = rng(seed);
  const g = new THREE.Group();
  const bark = flat(0x9c7a4f);
  const lean = rand.range(-0.25, 0.25);
  let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    const seg = part(new THREE.CylinderGeometry(0.15 - i * 0.012, 0.18 - i * 0.012, 0.55, 7), bark, x, y + 0.27, 0);
    seg.rotation.z = -lean * 0.6;
    g.add(seg);
    x += lean * 0.18 * (1 + i * 0.3);
    y += 0.52;
  }
  const leaf = flat(0x3fa34d, { side: THREE.DoubleSide, transparent: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand.next() * 0.3;
    const frond = part(new THREE.ConeGeometry(0.28, 1.8, 4), leaf, x, y, 0);
    frond.scale.set(1, 1, 0.2);
    frond.rotation.set(0, -a, Math.PI / 2 - 0.45);
    frond.translateY(0.85);
    g.add(frond);
  }
  for (let i = 0; i < 3; i++) g.add(part(new THREE.SphereGeometry(0.11, 8, 6), flat(0x5d4037), x + Math.cos(i * 2.1) * 0.16, y - 0.12, Math.sin(i * 2.1) * 0.16));
  g.scale.setScalar(r / 0.45);
  g.rotation.y = rand.next() * Math.PI * 2;
  return { group: g, canopy: [leaf], debris: 0x9c7a4f, top: y * (r / 0.45) };
}

function deadTree(r: number, seed: number): PropModel {
  const rand = rng(seed);
  const g = new THREE.Group();
  const char = flat(0x2b2422);
  g.add(part(new THREE.CylinderGeometry(0.16, 0.3, 2.2, 6), char, 0, 1.1, 0));
  for (let i = 0; i < 4; i++) {
    const br = part(new THREE.CylinderGeometry(0.04, 0.09, rand.range(0.7, 1.1), 5), char, 0, rand.range(1.2, 2), 0);
    br.rotation.set(rand.range(-0.4, 0.4), rand.next() * 6, rand.range(0.7, 1.1) * (i % 2 ? 1 : -1));
    br.translateY(0.4);
    g.add(br);
  }
  // Glowing embers in the bark.
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(2.5) });
  for (let i = 0; i < 4; i++) {
    const a = rand.next() * Math.PI * 2;
    g.add(part(new THREE.SphereGeometry(0.035, 6, 4), ember, Math.cos(a) * 0.22, rand.range(0.3, 1.6), Math.sin(a) * 0.22));
  }
  g.scale.setScalar(r / 0.55);
  return { group: g, canopy: [], debris: 0x2b2422, top: 2 };
}

function crate(r: number, seed: number): PropModel {
  const rand = rng(seed);
  const g = new THREE.Group();
  const s = r * 1.5;
  const wood = flat(0xb5824a);
  const dark = flat(0x7a5530);
  g.add(part(new THREE.BoxGeometry(s, s, s), wood, 0, s / 2, 0));
  for (const y of [0.06, s - 0.06]) for (const z of [-s / 2, s / 2]) g.add(part(new THREE.BoxGeometry(s + 0.02, 0.1, 0.06), dark, 0, y, z));
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) g.add(part(new THREE.BoxGeometry(0.08, s, 0.08), dark, x, s / 2, z));
  g.rotation.y = rand.next() * Math.PI;
  return { group: g, canopy: [], debris: 0xb5824a, top: s };
}

function pillar(r: number, seed: number): PropModel {
  const rand = rng(seed);
  const g = new THREE.Group();
  const stone = flat(0x9e9a86);
  const moss = flat(0x5d8a3a);
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const h = rand.range(0.45, 0.6);
    const seg = part(new THREE.CylinderGeometry(r * 0.85, r * 0.9, h, 8), i === 3 ? moss : stone, rand.range(-0.04, 0.04), y + h / 2, 0);
    seg.rotation.y = rand.next();
    g.add(seg);
    y += h;
  }
  g.add(part(new THREE.BoxGeometry(r * 2.1, 0.2, r * 2.1), stone, 0, y + 0.1, 0));
  return { group: g, canopy: [], debris: 0x9e9a86, top: y };
}

function sandcastle(r: number): PropModel {
  const g = new THREE.Group();
  const sand = flat(0xe0c48a);
  g.add(part(new THREE.CylinderGeometry(r, r * 1.1, 0.5, 10), sand, 0, 0.25, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(part(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8), sand, Math.cos(a) * r * 0.7, 0.75, Math.sin(a) * r * 0.7));
    g.add(part(new THREE.ConeGeometry(0.24, 0.3, 8), sand, Math.cos(a) * r * 0.7, 1.17, Math.sin(a) * r * 0.7));
  }
  g.add(part(new THREE.CylinderGeometry(0.28, 0.3, 0.8, 8), sand, 0, 0.9, 0));
  const flag = part(new THREE.BoxGeometry(0.02, 0.18, 0.28), flat(0xe53935), 0, 1.62, 0.14);
  g.add(flag, part(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), flat(0x5d4037), 0, 1.5, 0));
  return { group: g, canopy: [], debris: 0xe0c48a, top: 1.3 };
}

export function makeProp(kind: PropKind, r: number, seed: number, theme: Theme): PropModel {
  switch (kind) {
    case 'tree': {
      const t = makeTree(r, seed);
      return { group: t.group, canopy: [t.foliage], debris: 0x7a4a2a, top: 2.4 };
    }
    case 'rock': {
      const g = new THREE.Group();
      const [stone, top] = ROCK_TINT[theme];
      g.add(makeRock(r, seed, stone, top));
      return { group: g, canopy: [], debris: stone, top: r };
    }
    case 'jungleTree': return jungleTree(r, seed);
    case 'palm': return palm(r, seed);
    case 'deadTree': return deadTree(r, seed);
    case 'crate': return crate(r, seed);
    case 'pillar': return pillar(r, seed);
    case 'sandcastle': return sandcastle(r);
  }
}

/** What's left on the ground: a stump, rubble, planks or a sand heap. */
export function makeRemains(kind: PropKind, r: number, color: number) {
  const g = new THREE.Group();
  const m = flat(color);
  if (kind === 'tree' || kind === 'jungleTree' || kind === 'palm' || kind === 'deadTree') {
    g.add(part(new THREE.CylinderGeometry(r * 0.35, r * 0.45, 0.35, 7), flat(0x4a3020), 0, 0.17, 0));
  } else if (kind === 'sandcastle') {
    const heap = part(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
    heap.scale.y = 0.35;
    g.add(heap);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const piece = part(kind === 'crate' ? new THREE.BoxGeometry(0.6, 0.06, 0.15) : new THREE.DodecahedronGeometry(r * 0.25, 0), m, Math.cos(a) * r * 0.6, 0.08, Math.sin(a) * r * 0.6);
      piece.rotation.set(Math.random(), Math.random() * 6, Math.random());
      g.add(piece);
    }
  }
  return g;
}
