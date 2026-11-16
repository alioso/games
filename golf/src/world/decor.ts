// The pretty things: hand-painted textures (wooden planks, dry-stone walls, hedges, bark, grass), and
// the bits that make the countryside feel lived in: leafy trees, pines and apple trees, bushes, rocks,
// flowers and grass tufts, toadstools, clouds, a signpost at every tee; and the hole's own set pieces:
// mushroom bumpers, hollow-log tunnels, hedge arches, the loop-the-loop and rabbit burrows.
import * as THREE from 'three';
import type { CoverDef, LoopDef } from '../data/holes';
import { loopPoint } from '../game/physics';
import { ball, cyl, toon, toonOwn } from './toon';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// ---------- textures ----------

const texCache = new Map<string, THREE.CanvasTexture>();
export function canvasTex(key: string | null, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true) {
  if (key && texCache.has(key)) return texCache.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (key) texCache.set(key, t);
  return t;
}

/** Speckle a canvas with little dabs. */
function speckle(c: CanvasRenderingContext2D, n: number, colors: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = pick(colors);
    c.fillRect(Math.random() * c.canvas.width, Math.random() * c.canvas.height, size * rnd(0.6, 1.6), size * rnd(0.6, 1.2));
  }
}

/** Wooden planks running along (u = 1 m along the wall, v = 0.5 m up it): three boards, grain, nails. */
export function woodTex() {
  return canvasTex('wood', 256, 128, (c) => {
    const boards = 3, bh = 128 / boards;
    for (let b = 0; b < boards; b++) {
      const base = pick(['#b07840', '#a87038', '#b88048', '#a06a34']);
      c.fillStyle = base;
      c.fillRect(0, b * bh, 256, bh);
      // Grain: long wavy lines.
      for (let k = 0; k < 7; k++) {
        c.strokeStyle = Math.random() < 0.5 ? 'rgba(90,50,20,0.25)' : 'rgba(255,220,160,0.15)';
        c.lineWidth = rnd(1, 2);
        c.beginPath();
        const y0 = b * bh + rnd(3, bh - 3);
        c.moveTo(0, y0);
        for (let x = 0; x <= 256; x += 32) c.lineTo(x, y0 + Math.sin(x * 0.03 + k) * 2);
        c.stroke();
      }
      // A knot or two.
      for (let k = 0; k < 2; k++) {
        c.fillStyle = 'rgba(80,45,20,0.45)';
        c.beginPath();
        c.ellipse(rnd(10, 246), b * bh + bh / 2, rnd(4, 8), rnd(2, 3.5), 0, 0, Math.PI * 2);
        c.fill();
      }
      // Board edges and a joint.
      c.fillStyle = 'rgba(50,28,12,0.7)';
      c.fillRect(0, b * bh, 256, 2.5);
      const joint = rnd(40, 216);
      c.fillRect(joint, b * bh, 2.5, bh);
      c.fillStyle = '#3a2a1e';
      for (const x of [joint - 6, joint + 8]) c.fillRect(x, b * bh + bh / 2 - 2, 3, 3);
    }
  });
}

/** A dry-stone wall: rounded grey stones with dark gaps (1 m along, 0.5 m up). */
export function stoneTex() {
  return canvasTex('stone', 256, 128, (c) => {
    c.fillStyle = '#4a4238';
    c.fillRect(0, 0, 256, 128);
    let y = 0;
    while (y < 128) {
      const h = rnd(22, 34);
      let x = -rnd(0, 30);
      while (x < 256) {
        const w = rnd(30, 56);
        c.fillStyle = pick(['#b8b0a0', '#a8a090', '#c4bca8', '#9c9484', '#b0a890']);
        c.beginPath();
        c.roundRect(x + 2, y + 2, w - 4, Math.min(h, 128 - y) - 4, 8);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(x + 6, y + 4, w - 14, 3);
        if (Math.random() < 0.3) { c.fillStyle = 'rgba(90,140,60,0.5)'; c.beginPath(); c.ellipse(x + rnd(8, w - 8), y + h - 6, 7, 3, 0, 0, Math.PI * 2); c.fill(); }
        x += w;
      }
      y += h;
    }
  });
}

/** Hedge: dense little leaves. */
export function leafTex() {
  return canvasTex('leaf', 128, 128, (c) => {
    c.fillStyle = '#3e7e30';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      c.fillStyle = pick(['#2e6a26', '#4a9038', '#58a040', '#36762c', '#68b048']);
      c.beginPath();
      c.ellipse(Math.random() * 128, Math.random() * 128, rnd(3, 6), rnd(2, 4), Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Tree bark: vertical ridges. */
export function barkTex() {
  return canvasTex('bark', 64, 128, (c) => {
    c.fillStyle = '#7a5230';
    c.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = pick(['rgba(50,30,15,0.55)', 'rgba(140,100,60,0.4)']);
      c.lineWidth = rnd(1.5, 3);
      c.beginPath();
      const x = Math.random() * 64;
      c.moveTo(x, 0);
      for (let y = 0; y <= 128; y += 16) c.lineTo(x + rnd(-3, 3), y);
      c.stroke();
    }
  });
}

/** Field grass: soft patches of lighter and darker green, speckled (one tile is 4 m). */
export function meadowTex() {
  return canvasTex('meadow', 256, 256, (c) => {
    c.fillStyle = '#6cae4a';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = rnd(20, 50);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const col = Math.random() < 0.5 ? '120,190,80' : '80,140,50';
      g.addColorStop(0, `rgba(${col},0.35)`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) c.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
    }
    speckle(c, 2500, ['rgba(40,80,20,0.18)', 'rgba(210,240,140,0.2)', 'rgba(90,150,50,0.2)'], 2);
  });
}

/** Earth and rock for the steep banks. */
export function earthTex() {
  return canvasTex('earth', 128, 128, (c) => {
    c.fillStyle = '#9a7a55';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = pick(['#a89070', '#8a6a48', '#b4a080', '#7a5e40']);
      c.beginPath();
      c.ellipse(Math.random() * 128, Math.random() * 128, rnd(6, 14), rnd(4, 8), Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
    speckle(c, 400, ['rgba(60,40,20,0.3)', 'rgba(255,240,200,0.2)'], 2);
  });
}

/** A textured toon material (white so the picture's colours show). */
const texMats = new Map<string, THREE.MeshToonMaterial>();
export function texMat(name: string, tex: () => THREE.Texture, tint = 0xffffff) {
  const key = `${name}:${tint}`;
  if (!texMats.has(key)) texMats.set(key, toonOwn(tint, 0, tex()));
  return texMats.get(key)!;
}

// ---------- plants and things ----------

/** A leafy tree: a trunk and a cloud of blobs (sometimes with red apples). */
export function tree(scale = 1) {
  const k = scale * rnd(0.85, 1.25);
  const t = new THREE.Group();
  const trunk = cyl(0.13 * k, 0.2 * k, 1.5 * k, texMat('bark', barkTex), 0, 0, 0, 8);
  t.add(trunk);
  const leaf = pick([0x4a8e34, 0x3e7e2e, 0x58a03a, 0x6aa83e]);
  const blobs = Math.floor(rnd(4, 7));
  const apples = Math.random() < 0.25;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd(-0.3, 0.3);
    const r = (i === 0 ? 0.95 : rnd(0.55, 0.75)) * k;
    const d = i === 0 ? 0 : rnd(0.45, 0.7) * k;
    const shade = new THREE.Color(leaf).offsetHSL(rnd(-0.02, 0.02), 0, rnd(-0.05, 0.05)).getHex();
    const b = ball(r, toon(shade), Math.cos(a) * d, (i === 0 ? 2.1 : rnd(1.6, 2.4)) * k, Math.sin(a) * d);
    t.add(b);
    if (apples) for (let j = 0; j < 3; j++) {
      const u = Math.random() * Math.PI * 2, v = rnd(-0.6, 0.9);
      t.add(ball(0.07 * k, toon(0xd8302a), b.position.x + Math.cos(u) * Math.cos(v) * r, b.position.y + Math.sin(v) * r, b.position.z + Math.sin(u) * Math.cos(v) * r));
    }
  }
  t.traverse((o) => { o.castShadow = true; });
  return t;
}

/** A pine: stacked cones. */
export function pine(scale = 1) {
  const k = scale * rnd(0.85, 1.3);
  const t = new THREE.Group();
  t.add(cyl(0.1 * k, 0.15 * k, 1.0 * k, texMat('bark', barkTex), 0, 0, 0, 7));
  const col = pick([0x2e6a3a, 0x2a5e34, 0x3a7a42]);
  for (let j = 0; j < 4; j++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry((1.05 - j * 0.22) * k, 1.0 * k, 9), toon(new THREE.Color(col).offsetHSL(0, 0, j * 0.02).getHex()));
    c.position.y = (1.2 + j * 0.6) * k;
    c.rotation.y = Math.random() * 3;
    t.add(c);
  }
  t.traverse((o) => { o.castShadow = true; });
  return t;
}

/** A round bush, sometimes in flower. */
export function bush(size = 1) {
  const g = new THREE.Group();
  const col = pick([0x4e8e36, 0x5a9a3c, 0x448236]);
  const n = Math.floor(rnd(3, 5));
  for (let i = 0; i < n; i++) {
    const r = rnd(0.22, 0.34) * size;
    const b = ball(r, toon(new THREE.Color(col).offsetHSL(0, 0, rnd(-0.04, 0.04)).getHex()), rnd(-0.2, 0.2) * size, r * 0.8, rnd(-0.2, 0.2) * size);
    b.scale.y = 0.85;
    g.add(b);
  }
  if (Math.random() < 0.5) {
    const fc = pick([0xf06090, 0xffffff, 0xf8d040, 0xc070f0]);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, u = rnd(0.1, 1.2);
      g.add(ball(0.035 * size, toon(fc), Math.cos(a) * 0.3 * size, (0.25 + u * 0.25) * size, Math.sin(a) * 0.3 * size));
    }
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** A mossy rock. */
export function rock(size = 1) {
  const geo = new THREE.DodecahedronGeometry(0.3 * size, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rnd(0.85, 1.15), p.getY(i) * rnd(0.6, 0.8), p.getZ(i) * rnd(0.85, 1.15));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toon(pick([0xa8a498, 0x9a968a, 0xb4b0a0])));
  m.rotation.y = Math.random() * 3;
  m.castShadow = true;
  return m;
}

/** A little toadstool (scenery, not a bumper). */
export function toadstool(size = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.03 * size, 0.04 * size, 0.1 * size, toon(0xf4ecd8), 0, 0, 0, 8));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08 * size, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(pick([0xd83a30, 0xe8a030, 0xb86ad0])));
  cap.position.y = 0.09 * size;
  g.add(cap);
  return g;
}

/**
 * Flowers and grass tufts scattered over a set of spots: instanced, so thousands cost little. Each
 * flower is a stem and a head in one of a few colours; tufts are a few thin blades.
 */
export function flowersAt(spots: [number, number, number][]) {
  const g = new THREE.Group();
  const n = spots.length;
  const stemGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.16, 4).translate(0, 0.08, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.6, 1).translate(0, 0.17, 0);
  const stems = new THREE.InstancedMesh(stemGeo, toon(0x3a8a30), n);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshToonMaterial({ color: 0xffffff }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const colors = [0xffffff, 0xf8d040, 0xf06090, 0xe84a3a, 0xa070f0, 0xffa0c0, 0x60a0f0];
  spots.forEach(([x, y, z], i) => {
    q.setFromEuler(new THREE.Euler(rnd(-0.15, 0.15), Math.random() * 6, rnd(-0.15, 0.15)));
    s.setScalar(rnd(0.7, 1.3));
    m.compose(p.set(x, y, z), q, s);
    stems.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, col.set(pick(colors)));
  });
  g.add(stems, heads);
  return g;
}

export function tuftsAt(spots: [number, number, number][]) {
  const blade = new THREE.ConeGeometry(0.02, 0.18, 3).translate(0, 0.09, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const b = blade.clone();
    b.rotateZ(rnd(-0.4, 0.4));
    b.rotateY((i / 5) * Math.PI * 2);
    b.translate(rnd(-0.03, 0.03), 0, rnd(-0.03, 0.03));
    parts.push(b);
  }
  const geo = mergeGeos(parts);
  const mesh = new THREE.InstancedMesh(geo, toon(0x4e9a3a), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, y, z], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
    s.set(1, rnd(0.7, 1.4), 1);
    mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, s));
  });
  return mesh;
}

/** Glue simple geometries (positions and normals) into one. */
function mergeGeos(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    pos.push(...(g.attributes.position.array as Float32Array));
    nrm.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

/** A puffy cloud. */
export function cloud() {
  const g = new THREE.Group();
  const n = Math.floor(rnd(4, 7));
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x8090a0, fog: false });
  for (let i = 0; i < n; i++) {
    const r = rnd(1.8, 3.4);
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
    b.position.set((i - n / 2) * 2.4 + rnd(-0.5, 0.5), rnd(-0.4, 0.8), rnd(-1, 1));
    b.scale.y = 0.7;
    g.add(b);
  }
  return g;
}

/** A wooden signpost: the hole's number, name and par on a board. */
export function signpost(number: number, name: string, par: number) {
  const g = new THREE.Group();
  const tex = canvasTex(null, 256, 160, (c) => {
    c.fillStyle = '#c8945a';
    c.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 9; i++) { c.strokeStyle = 'rgba(90,50,20,0.25)'; c.beginPath(); c.moveTo(0, 10 + i * 17); c.lineTo(256, 12 + i * 17); c.stroke(); }
    c.strokeStyle = '#6a4424';
    c.lineWidth = 10;
    c.strokeRect(5, 5, 246, 150);
    c.fillStyle = '#f4d040';
    c.beginPath(); c.arc(52, 62, 34, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3a2410'; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#2a1a0e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 40px "Bungee", "Arial Black", sans-serif';
    c.fillText(String(number), 52, 64);
    c.font = '700 24px "Fredoka", "Arial Rounded MT Bold", sans-serif';
    c.textAlign = 'left';
    c.fillText(`PAR ${par}`, 100, 62);
    c.textAlign = 'center';
    c.font = '700 26px "Fredoka", "Arial Rounded MT Bold", sans-serif';
    const words = name.toUpperCase();
    c.fillText(words, 128, 124, 230);
  }, false);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), [toon(0x8a5a30), toon(0x8a5a30), toon(0x8a5a30), toon(0x8a5a30), toonOwn(0xffffff, 0, tex), toon(0x8a5a30)]);
  board.position.y = 0.95;
  board.castShadow = true;
  g.add(board);
  for (const s of [-0.3, 0.3]) g.add(cyl(0.035, 0.04, 1.0, toon(0x6a4428), s, 0, -0.04, 6));
  // A little flower pot at its foot.
  g.add(cyl(0.12, 0.09, 0.16, toon(0xc0603a), 0.42, 0, 0.1, 10));
  const pot = flowersAt(Array.from({ length: 6 }, () => [0.42 + rnd(-0.06, 0.06), 0.12, 0.1 + rnd(-0.06, 0.06)] as [number, number, number]));
  g.add(pot);
  return g;
}

// ---------- the hole's set pieces ----------

/** A mushroom bumper: a red cap with white spots on a fat stem (squashes when hit). */
export function mushroomBumper(r: number) {
  const g = new THREE.Group();
  const stem = cyl(r * 0.8, r * 0.95, 0.22, toon(0xf4ecd8), 0, -0.02, 0, 16);
  g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe0302a));
  cap.scale.y = 0.75;
  cap.position.y = 0.19;
  cap.castShadow = true;
  g.add(cap);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd(-0.2, 0.2), e = i === 0 ? Math.PI / 2 : rnd(0.35, 0.9);
    const rr = r * 1.45;
    const spot = ball(r * rnd(0.16, 0.24), toon(0xfff8f0), Math.cos(a) * Math.cos(e) * rr, 0.19 + Math.sin(e) * rr * 0.75, Math.sin(a) * Math.cos(e) * rr);
    spot.scale.y = 0.5;
    g.add(spot);
  }
  return g;
}

/** A hollow log (or a hedge arch, or a stone tunnel) lying along a→b, the lane running through it. */
export function coverMesh(c: CoverDef, h: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const [ax, az] = c.a, [bx, bz] = c.b;
  const len = Math.hypot(bx - ax, bz - az), r = c.width / 2;
  const y = Math.min(h(ax, az), h(bx, bz));
  const outer = c.kind === 'log' ? texMat('bark', barkTex) : c.kind === 'hedge' ? texMat('leaf', leafTex) : texMat('stone', stoneTex);
  const inner = new THREE.MeshToonMaterial({ color: c.kind === 'log' ? 0xc89a60 : c.kind === 'hedge' ? 0x2e5e26 : 0x6a6458, side: THREE.BackSide });
  // Shell: the top part of a thick tube.
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.14, r + 0.14, len, 24, 1, true, -Math.PI / 2, Math.PI), outer);
  shell.rotation.x = -Math.PI / 2;
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true, -Math.PI / 2, Math.PI), inner);
  lining.rotation.x = -Math.PI / 2;
  const body = new THREE.Group();
  body.add(shell, lining);
  // The two ends: rings (tree rings on a log).
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.14, 24, 1, 0, Math.PI), c.kind === 'log' ? toon(0xe0b878) : toon(c.kind === 'hedge' ? 0x3e7e30 : 0xa8a090));
    ring.position.z = (s * len) / 2;
    ring.rotation.y = s > 0 ? 0 : Math.PI;
    body.add(ring);
  }
  if (c.kind === 'log') {
    // Moss and a toadstool on top.
    const moss = ball(0.25, toon(0x5a9a3a), 0, r + 0.1, len * 0.2);
    moss.scale.set(1.4, 0.35, 2);
    body.add(moss);
    const t = toadstool(2.2);
    t.position.set(0.1, r + 0.1, -len * 0.25);
    body.add(t);
  }
  if (c.kind === 'hedge') {
    for (let i = 0; i < Math.round(len / 0.35); i++) {
      const b = ball(0.2, toon(pick([0x3e7e30, 0x4a9038, 0x356e2a])), rnd(-0.2, 0.2), r + 0.12, -len / 2 + 0.2 + i * 0.35);
      body.add(b);
    }
  }
  body.traverse((o) => { o.castShadow = true; });
  body.position.set((ax + bx) / 2, y, (az + bz) / 2);
  body.rotation.y = Math.atan2(bx - ax, bz - az);
  g.add(body);
  return g;
}

/** The loop-the-loop: a red track with yellow rails going right round, on two posts. */
export function loopMesh(l: LoopDef, h: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const dx = Math.sin(l.angle), dz = -Math.cos(l.angle), nx = -dz, nz = dx;
  // The track runs just outside the ball's path.
  const pts: THREE.Vector3[] = [], rails: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  const centre = (theta: number) => {
    const p = loopPoint(l, theta, h);
    const cy = h(l.at[0], l.at[1]) + l.radius;
    return { p, cy };
  };
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const { p, cy } = centre(th);
    // Out from the loop's middle by a ball radius: the track surface under the ball.
    const ox = Math.sin(th) * 0.05, oy = -Math.cos(th) * 0.05;
    const q = new THREE.Vector3(p.x + dx * ox, p.y + oy - 0.04, p.z + dz * ox);
    if (th < 0.05 || th > Math.PI * 2 - 0.05) q.y = Math.max(q.y, h(l.at[0], l.at[1]) + 0.005);
    pts.push(q);
    void cy;
    for (const s of [0, 1] as const) {
      const w = s ? 0.07 : -0.07;
      rails[s].push(new THREE.Vector3(q.x + nx * w, q.y + 0.03, q.z + nz * w));
    }
  }
  // The track: a ribbon between the rails.
  const pos: number[] = [], idx: number[] = [];
  pts.forEach((q) => {
    pos.push(q.x + nx * 0.075, q.y, q.z + nz * 0.075, q.x - nx * 0.075, q.y, q.z - nz * 0.075);
  });
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const ribbon = new THREE.Mesh(rg, new THREE.MeshToonMaterial({ color: 0xe0402a, side: THREE.DoubleSide }));
  ribbon.castShadow = true;
  g.add(ribbon);
  for (const r of rails) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), 96, 0.018, 6, false), toon(0xf4d040));
    tube.castShadow = true;
    g.add(tube);
  }
  // Two posts holding it up, either side.
  const top = h(l.at[0], l.at[1]) + l.radius;
  for (const s of [-1, 1]) {
    const sx = l.at[0] + nx * (s > 0 ? (l.shift ?? 0.3) + 0.2 : -0.2), sz = l.at[1] + nz * (s > 0 ? (l.shift ?? 0.3) + 0.2 : -0.2);
    const post = cyl(0.03, 0.04, top - h(sx, sz), toon(0x3a6ab0), sx, h(sx, sz), sz, 8);
    g.add(post);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), toon(0x3a6ab0));
    strut.position.set(sx - nx * s * 0.1, top, sz - nz * s * 0.1);
    strut.rotation.set(0, 0, Math.PI / 2);
    strut.lookAt(l.at[0] + nx * (l.shift ?? 0.3) / 2, top, l.at[1] + nz * (l.shift ?? 0.3) / 2);
    strut.rotateX(Math.PI / 2);
    g.add(strut);
  }
  // A star on top.
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), toon(0xf8d040, 0.3));
  star.position.set(l.at[0] + nx * (l.shift ?? 0.3) / 2, top + l.radius + 0.12, l.at[1] + nz * (l.shift ?? 0.3) / 2);
  star.userData.spin = true;
  g.add(star);
  return g;
}

/** A rabbit burrow's mouth: a dark hole in a little mound of earth, with a tuft. */
export function burrowMouth(x: number, y: number, z: number, r: number) {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.06, 6, 20), toon(0x8a6a44));
  mound.rotation.x = Math.PI / 2;
  mound.scale.z = 0.6;
  mound.position.set(x, y + 0.01, z);
  g.add(mound);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: 0x120c08 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, y + 0.006, z);
  g.add(hole);
  return g;
}
