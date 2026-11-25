// What each maze is made of. The hedge maze: clipped hedges on gravel, an evening in the countryside.
// The city walls: old plastered town walls (bricks showing where the plaster's fallen off, ivy, red
// tiles along the top), cobbled lanes, street lamps on the corners, and the town's houses all round,
// at dusk. The castle: great grey stone blocks with battlements, flagstones, braziers burning on the
// corners, a moat round it all with a drawbridge in, and mountains under the moon.
import * as THREE from 'three';
import type { Theme } from '../data/mazes';
import { canvasTex, leafTex, texMat } from './decor';
import { ball, cyl, glow, toon } from './toon';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export interface ThemeStyle {
  /** Wall height (m). */
  wallH: number;
  /** The walls' sides, and the colour on top. */
  wallMat: () => THREE.Material;
  /** The side texture runs the wall's full height (city/castle) or tiles like leaves (hedges). */
  wallUVFull: boolean;
  top: number;
  /** On the map: walls, paths. */
  mapWall: string;
  mapPath: string;
  /** Sky colours top → horizon, the soft sky light (sky, ground, strength), the sun/moon. */
  sky: [string, string, string];
  hemi: [number, number, number];
  sun: [number, number];
  /** Background clear colour (behind everything). */
  clear: number;
  /** "The hedges have moved" etc. */
  shiftSub: string;
  /** Words for the shift banner. */
  wallWord: string;
}

export const STYLES: Record<Theme, ThemeStyle> = {
  bushes: {
    wallH: 1.6, wallMat: () => texMat('leaf', leafTex), wallUVFull: false, top: 0x3e7e30,
    mapWall: '#3e7a30', mapPath: '#d8c49a',
    sky: ['#2a5aa8', '#8ab0e0', '#f8d8b0'], hemi: [0xd8e4ff, 0x4a6a3a, 1.3], sun: [0xffe2b8, 2.2], clear: 0x0c0c14,
    shiftSub: 'Hedges have moved · find a new way out', wallWord: 'hedges',
  },
  city: {
    wallH: 1.7, wallMat: () => texMat('citywall', cityWallTex), wallUVFull: true, top: 0x8a4a3a,
    mapWall: '#b0604a', mapPath: '#d4ccc0',
    sky: ['#2a2a6a', '#b06a8a', '#f8b880'], hemi: [0xffe0d0, 0x5a4a5a, 1.35], sun: [0xffc090, 2.0], clear: 0x100c18,
    shiftSub: 'Walls have moved · find a new way out', wallWord: 'walls',
  },
  castle: {
    wallH: 1.8, wallMat: () => texMat('castlewall', castleWallTex), wallUVFull: true, top: 0x8a8478,
    mapWall: '#6a6a72', mapPath: '#cfc6b4',
    sky: ['#05081c', '#1a2252', '#3a3a6e'], hemi: [0xb8c4ff, 0x3a3440, 1.45], sun: [0xc8d4ff, 1.9], clear: 0x05060e,
    shiftSub: 'The stones have moved · find a new way out', wallWord: 'stones',
  },
};

// ---------- textures ----------

/** Town wall: a dark stone foot, plaster above (bricks showing where it's fallen off), some ivy. 2 m along, full height up. */
export function cityWallTex() {
  return canvasTex('citywall', 256, 256, (c) => {
    c.fillStyle = '#ead6b4';
    c.fillRect(0, 0, 256, 256);
    // Stains and shading in the plaster.
    for (let i = 0; i < 60; i++) {
      c.fillStyle = pick(['rgba(200,160,110,0.12)', 'rgba(255,245,220,0.18)', 'rgba(150,120,90,0.08)']);
      c.beginPath(); c.ellipse(rnd(0, 256), rnd(0, 220), rnd(10, 40), rnd(6, 24), 0, 0, Math.PI * 2); c.fill();
    }
    // Patches of bricks.
    const bricks = (x0: number, y0: number, w: number, h: number) => {
      c.save();
      c.beginPath(); c.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = '#7a4a34'; c.fillRect(x0, y0, w, h);
      for (let y = y0, row = 0; y < y0 + h; y += 9, row++) for (let x = x0 - (row % 2) * 9; x < x0 + w; x += 18) {
        c.fillStyle = pick(['#b0583a', '#a04c30', '#c06844', '#984a34']);
        c.fillRect(x + 1, y + 1, 16, 7);
      }
      c.restore();
      c.strokeStyle = 'rgba(120,90,60,0.5)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.stroke();
    };
    bricks(30, 60, 70, 46);
    bricks(170, 120, 54, 40);
    bricks(110, 20, 40, 26);
    // The stone foot.
    c.fillStyle = '#6a625a'; c.fillRect(0, 214, 256, 42);
    for (let x = 0; x < 256; x += rnd(28, 44)) { c.fillStyle = 'rgba(40,36,32,0.7)'; c.fillRect(x, 214, 2, 42); }
    c.fillStyle = 'rgba(40,36,32,0.6)'; c.fillRect(0, 212, 256, 3); c.fillRect(0, 234, 256, 2);
    // A drip line under the coping.
    c.fillStyle = 'rgba(90,70,50,0.25)'; c.fillRect(0, 0, 256, 8);
    // Ivy climbing up from the foot.
    for (const vx of [70, 200]) {
      c.strokeStyle = '#3a5a22'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(vx, 214);
      let x = vx, y = 214;
      while (y > 90) { x += rnd(-10, 10); y -= rnd(10, 18); c.lineTo(x, y); }
      c.stroke();
      for (let i = 0; i < 40; i++) {
        c.fillStyle = pick(['#3e7a2a', '#4e9032', '#2e6420', '#5aa03a']);
        c.beginPath(); c.ellipse(vx + rnd(-22, 22), rnd(100, 214), rnd(4, 7), rnd(3, 5), rnd(0, 3), 0, Math.PI * 2); c.fill();
      }
    }
  });
}

/** Castle wall: big grey dressed stones with mortar lines, some darker, moss at the foot. 2 m along, full height up. */
export function castleWallTex() {
  return canvasTex('castlewall', 256, 256, (c) => {
    c.fillStyle = '#4a4650';
    c.fillRect(0, 0, 256, 256);
    let y = 0, row = 0;
    while (y < 256) {
      const h = row === 0 ? 30 : rnd(36, 46);
      let x = -(row % 2) * rnd(20, 50);
      while (x < 256) {
        const w = rnd(50, 80);
        const base = pick(['#9a96a0', '#8a8690', '#a8a4ac', '#82808a', '#9490a0']);
        c.fillStyle = base;
        c.fillRect(x + 2, y + 2, w - 4, Math.min(h, 256 - y) - 4);
        c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x + 4, y + 4, w - 8, 3);
        c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(x + 4, y + h - 8, w - 8, 4);
        // Chips and cracks.
        for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(40,36,44,0.35)'; c.fillRect(x + rnd(6, w - 10), y + rnd(6, h - 10), rnd(2, 6), rnd(2, 4)); }
        x += w;
      }
      y += h; row++;
    }
    // Moss and damp at the foot.
    for (let i = 0; i < 70; i++) {
      c.fillStyle = pick(['rgba(70,110,50,0.55)', 'rgba(50,80,40,0.5)', 'rgba(90,130,60,0.4)']);
      c.beginPath(); c.ellipse(rnd(0, 256), rnd(220, 256), rnd(4, 12), rnd(3, 7), 0, 0, Math.PI * 2); c.fill();
    }
  });
}

/** A raw canvas (for ground patterns). */
function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  return cv;
}

/** Cobbles (drawn at 20 px a metre): rows of rounded grey-brown stones. */
export function cobblePattern() {
  return canvas(80, 80, (c) => {
    c.fillStyle = '#5a544e';
    c.fillRect(0, 0, 80, 80);
    for (let y = 0, row = 0; y < 80; y += 8, row++) for (let x = (row % 2) * -4; x < 80; x += 8) {
      c.fillStyle = pick(['#b4aca0', '#a49c92', '#c0b8aa', '#9a9288', '#aca294']);
      c.beginPath(); c.roundRect(x + 0.8, y + 0.8, 6.6 + rnd(-0.6, 0.4), 6.4, 2.4); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x + 2, y + 1.6, 3, 1);
    }
  });
}

/** Flagstones (20 px a metre): big uneven slabs with dark joints. */
export function flagPattern() {
  return canvas(120, 120, (c) => {
    c.fillStyle = '#3e3a40';
    c.fillRect(0, 0, 120, 120);
    for (let y = 0, row = 0; y < 120; y += 20, row++) {
      let x = row % 2 ? -10 : 0;
      while (x < 120) {
        const w = pick([16, 20, 24, 30]);
        c.fillStyle = pick(['#a8a094', '#9c9488', '#b4ac9e', '#908a80', '#a29a8c']);
        c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, 18, 2); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x + rnd(3, w - 6), y + rnd(4, 14), rnd(3, 6), 1);
        if (x + w > 120) { c.fillStyle = pick(['#a8a094', '#9c9488']); c.beginPath(); c.roundRect(x + 1 - 120, y + 1, w - 2, 18, 2); c.fill(); }
        x += w;
      }
    }
  });
}

/** Wooden planks running across (for the drawbridge), 20 px a metre. */
export function plankPattern() {
  return canvas(40, 40, (c) => {
    for (let y = 0; y < 40; y += 5) {
      c.fillStyle = pick(['#8a6038', '#7a5430', '#946a40']);
      c.fillRect(0, y, 40, 5);
      c.fillStyle = 'rgba(40,24,10,0.6)'; c.fillRect(0, y, 40, 0.8);
      c.fillStyle = '#2a2a2a'; c.fillRect(4, y + 2, 1, 1); c.fillRect(35, y + 2, 1, 1);
    }
  });
}

// ---------- set pieces ----------

/** A street lamp (on a wall's corner, or a taller one on the ground): a post and a glowing lantern. */
export function wallLamp(x: number, z: number, y: number, post = 0.55) {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.05, post, toon(0x2a2a30), 0, 0, 0, 6));
  const cage = cyl(0.11, 0.08, 0.2, toon(0x2a2a30), 0, post, 0, 6);
  g.add(cage);
  g.add(cyl(0.08, 0.06, 0.16, glow(0xffd080, 2.2), 0, post + 0.02, 0, 6));
  g.add(cyl(0.02, 0.13, 0.08, toon(0x2a2a30), 0, post + 0.2, 0, 6));
  g.position.set(x, y, z);
  return g;
}

/** An iron brazier on a wall's corner, with a fire in it (the flame's returned to flicker). */
export function brazier(x: number, z: number, y: number) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.08, 0.25, toon(0x2a2626), 0, 0, 0, 6));
  g.add(cyl(0.2, 0.1, 0.14, toon(0x3a3434), 0, 0.25, 0, 8));
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 7), glow(0xff8020, 2.4));
  outer.position.y = 0.22;
  flame.add(outer);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), glow(0xffe060, 2.6));
  inner.position.y = 0.15;
  flame.add(inner);
  flame.position.y = 0.36;
  g.add(flame);
  g.position.set(x, y, z);
  return { group: g, flame };
}

/** A town house (outside the walls): a coloured box, a pitched tiled roof, windows and a door. */
export function house(w: number, d: number, h: number) {
  const g = new THREE.Group();
  const wallCol = pick([0xf0d8b0, 0xe8b890, 0xf4e8d0, 0xd8a888, 0xc8d8c0, 0xe8c8c8, 0xb8c8e0]);
  const tex = canvasTex(null, 128, 128, (c) => {
    c.fillStyle = '#' + new THREE.Color(wallCol).getHexString();
    c.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) {
      const x = 18 + i * 60, y = 18 + row * 56;
      c.fillStyle = '#2a3a5a'; c.fillRect(x, y, 32, 36);
      c.fillStyle = '#f8e090'; if (Math.random() < 0.55) c.fillRect(x + 3, y + 3, 26, 30);
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x, y, 32, 36);
      c.beginPath(); c.moveTo(x + 16, y); c.lineTo(x + 16, y + 36); c.moveTo(x, y + 18); c.lineTo(x + 32, y + 18); c.stroke();
      c.fillStyle = pick(['#3a6a3a', '#7a3a2a', '#3a4a7a']); c.fillRect(x - 7, y, 6, 36); c.fillRect(x + 33, y, 6, 36);
    }
  }, false);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(wallCol));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  // Windows on the long faces (planes just in front).
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.9), toon(0xffffff));
    (face.material as THREE.MeshToonMaterial).map = tex;
    face.position.set(0, h / 2, s * (d / 2 + 0.01));
    if (s < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  const roofH = Math.min(w, d) * 0.45;
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.2, 0), new THREE.Vector2(d / 2 + 0.2, 0), new THREE.Vector2(0, roofH)]);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.3, bevelEnabled: false });
  roofGeo.translate(0, 0, -(w + 0.3) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, toon(pick([0xb04a34, 0xa04030, 0x8a3a2e, 0x5a5a6a])));
  roof.position.y = h;
  roof.castShadow = true;
  g.add(roof);
  if (Math.random() < 0.6) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), toon(0x8a5a48)).translateX(w * 0.25).translateY(h + roofH * 0.7));
  return g;
}

/** A far-off mountain with snow on top. */
export function mountain(r: number, h: number) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), toon(0x3a3e5a));
  m.position.y = h / 2;
  m.rotation.y = Math.random() * 3;
  g.add(m);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), toon(0xdde4f4));
  cap.position.y = h - h * 0.16 + 0.05;
  cap.rotation.y = m.rotation.y;
  g.add(cap);
  return g;
}

/** A hanging banner (castle): a coloured cloth with a pointed foot and a gold device. */
export function banner(w: number, h: number, color: number) {
  const tex = canvasTex(null, 64, 128, (c) => {
    c.fillStyle = '#' + new THREE.Color(color).getHexString();
    c.fillRect(0, 0, 64, 128);
    c.fillStyle = '#f0c030';
    c.fillRect(0, 0, 64, 6);
    c.beginPath(); c.moveTo(32, 30); c.lineTo(46, 54); c.lineTo(32, 78); c.lineTo(18, 54); c.closePath(); c.fill();
    c.fillStyle = '#' + new THREE.Color(color).getHexString();
    c.beginPath(); c.arc(32, 54, 7, 0, Math.PI * 2); c.fill();
  }, false);
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, -h), new THREE.Vector2(0, -h * 0.82), new THREE.Vector2(-w / 2, -h)]);
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, 1 + pos.getY(i) / h);
  const m = new THREE.Mesh(geo, toon(0xffffff));
  (m.material as THREE.MeshToonMaterial).map = tex;
  (m.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  return m;
}

/** A wooden barrel standing up. */
export function barrel(r = 0.28, h = 0.7) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, h, 12), toon(0x9a6a3a));
  const pos = body.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / (h / 2), k = 1 + 0.13 * (1 - y * y);
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
  }
  body.geometry.computeVertexNormals();
  body.castShadow = true;
  g.add(body);
  for (const y of [-0.32, 0.32]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.02, 4, 16), toon(0x3a3a3e));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y * h;
    g.add(hoop);
  }
  g.add(cyl(r * 0.86, r * 0.86, 0.02, toon(0x7a5028), 0, h / 2 - 0.01, 0, 12));
  return g;
}

/** Flowers in a terracotta pot. */
export function flowerpot(s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.13 * s, 0.09 * s, 0.2 * s, toon(0xc0603a), 0, 0, 0, 10));
  g.add(cyl(0.14 * s, 0.14 * s, 0.04 * s, toon(0xa85030), 0, 0.18 * s, 0, 10));
  g.add(cyl(0.11 * s, 0.11 * s, 0.02 * s, toon(0x4a3020), 0, 0.17 * s, 0, 10));
  const col = pick([0xe83a5a, 0xf0c020, 0xb050e0, 0xf07a30]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(ball(0.05 * s, toon(0x3a7a2a), Math.cos(a) * 0.06 * s, 0.24 * s, Math.sin(a) * 0.06 * s));
    g.add(ball(0.045 * s, toon(col), Math.cos(a + 0.6) * 0.07 * s, 0.3 * s, Math.sin(a + 0.6) * 0.07 * s));
  }
  return g;
}
