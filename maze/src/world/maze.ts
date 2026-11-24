// A maze in 3D: tall clipped hedges (leafy sides, a bumpy top), a gravel path along every passage,
// the entrance arch with its lanterns and a little courtyard outside it (where you start and where you
// must come back to), the ruby on its stone pedestal in its chamber, and the countryside round it all.
// Also answers "is this spot solid?" for walking about.
import * as THREE from 'three';
import type { Layout } from '../data/mazes';
import { ball, cyl, glow, toon, toonOwn } from './toon';
import { type TrapView, animateTrap, trapView } from './traps';
import { bush, canvasTex, cloud, flowersAt, leafTex, meadowTex, pine, rock, stoneTex, texMat, tree, tuftsAt } from './decor';

/** Wall tiles are thin, passage tiles wide (metres). */
export const WALL_W = 0.8;
export const CELL_W = 2.3;
export const HEDGE_H = 1.6;
const PERIOD = WALL_W + CELL_W;

/** Where tile i starts, and how wide it is (the same across and down). */
export const tileStart = (i: number) => Math.floor(i / 2) * PERIOD + (i % 2 ? WALL_W : 0);
export const tileSize = (i: number) => (i % 2 ? CELL_W : WALL_W);
export const tileMid = (i: number) => tileStart(i) + tileSize(i) / 2;
/** Which tile a coordinate is in. */
export function tileOf(v: number) {
  const k = Math.floor(v / PERIOD), r = v - k * PERIOD;
  return k * 2 + (r < WALL_W ? 0 : 1);
}

export class MazeWorld {
  readonly group = new THREE.Group();
  /** The whole maze's size (metres). */
  readonly width: number;
  readonly depth: number;
  /** The courtyard outside the way in, where you start: [x0, z0, x1, z1]. */
  readonly yard: [number, number, number, number];
  /** Where you start (and must come back to). */
  readonly start: THREE.Vector3;
  readonly rubyPos: THREE.Vector3;
  /** The ruby itself, and its glow (taken away when you pick it up). */
  readonly ruby = new THREE.Group();
  private rubyLight: THREE.PointLight;
  private lanterns: THREE.PointLight[] = [];
  private clouds: THREE.Object3D[] = [];
  /** The hedge meshes (rebuilt when the maze shifts), and hedges growing or sinking right now. */
  private hedgeGroup = new THREE.Group();
  private moving: { mesh: THREE.Mesh; grow: boolean; t: number }[] = [];
  /** Tiles left out of the hedge mesh while they grow (drawn by their own growing block). */
  private skip = new Set<number>();
  /** The traps as drawn (and where they are). */
  readonly traps: TrapView[] = [];
  /** Tiles you can't walk through though they're open (a keeper's shut gate). */
  readonly blockers = new Set<number>();
  /** Called with new meshes so they can be darkened like the rest. */
  onNewMeshes: (o: THREE.Object3D) => void = () => {};
  private t = 0;

  constructor(readonly layout: Layout) {
    const { tw, th } = layout;
    this.width = tileStart(tw - 1) + WALL_W;
    this.depth = tileStart(th - 1) + WALL_W;
    const [gx] = layout.entrance.gap;
    const ex = tileMid(gx);
    this.yard = [ex - 3.2, this.depth, ex + 3.2, this.depth + 4.5];
    this.start = new THREE.Vector3(ex, 0, this.depth + 2.6);
    this.rubyPos = new THREE.Vector3(tileMid(layout.ruby[0] * 2 + 1), 0, tileMid(layout.ruby[1] * 2 + 1));

    this.ground();
    this.group.add(this.hedgeGroup);
    this.hedges();
    this.entrance();
    this.rubyChamber();
    for (const t of layout.traps) {
      const v = trapView(t);
      this.traps.push(v);
      this.group.add(v.group);
    }
    this.countryside();

    // Light: a low evening sun, a soft sky.
    this.group.add(new THREE.HemisphereLight(0xd8e4ff, 0x4a6a3a, 1.3));
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
    const cx = this.width / 2, cz = this.depth / 2;
    sun.position.set(cx - 18, 26, cz + 14);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    const span = Math.max(this.width, this.depth) / 2 + 8;
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 90;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun, sun.target);
    this.rubyLight = new THREE.PointLight(0xff3050, 6, 6, 1.6);
    this.rubyLight.position.copy(this.rubyPos).setY(1.4);
    this.group.add(this.rubyLight);
  }

  isWallTile(tx: number, ty: number) {
    const { tw, th, wall } = this.layout;
    if (tx < 0 || ty < 0 || tx >= tw || ty >= th) return false;
    return wall[ty * tw + tx] === 1;
  }

  /** Can't stand here: inside a hedge, or outside both the maze and its courtyard. */
  solidAt(x: number, z: number) {
    const [x0, , x1, z1] = this.yard;
    if (z >= this.depth) return !(x > x0 && x < x1 && z < z1);
    if (x <= 0 || z <= 0 || x >= this.width) return true;
    return this.isWallTile(tileOf(x), tileOf(z));
  }

  /** Push a circle (radius r) out of the hedges; returns where it ends up. */
  collide(p: THREE.Vector3, r: number) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const tx0 = tileOf(p.x - r - 0.01), tx1 = tileOf(p.x + r + 0.01), tz0 = tileOf(p.z - r - 0.01), tz1 = tileOf(p.z + r + 0.01);
      for (let ty = tz0; ty <= tz1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.isWallTile(tx, ty) && !this.blockers.has(ty * this.layout.tw + tx)) continue;
        const bx0 = tileStart(tx), bx1 = bx0 + tileSize(tx), bz0 = tileStart(ty), bz1 = bz0 + tileSize(ty);
        const cx = Math.max(bx0, Math.min(bx1, p.x)), cz = Math.max(bz0, Math.min(bz1, p.z));
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-5) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
        else {
          // Inside: out the nearest side.
          const opts = [[p.x - bx0, -1, 0], [bx1 - p.x, 1, 0], [p.z - bz0, 0, -1], [bz1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          p.x += opts[1] * (opts[0] + r); p.z += opts[2] * (opts[0] + r);
        }
        moved = true;
      }
      // The maze's outline and the courtyard's fence.
      const [x0, , x1, z1] = this.yard;
      if (p.z > this.depth) { p.x = Math.max(x0 + r, Math.min(x1 - r, p.x)); p.z = Math.min(z1 - r, p.z); }
      if (!moved) break;
    }
    return p;
  }

  /** The ground: grass, with a gravel path painted along every open passage. */
  private ground() {
    const { tw, th, wall } = this.layout;
    const M = 10, PPM = 20;
    const W = this.width + 2 * M, D = this.depth + 2 * M + 6;
    const tex = canvasTex(null, Math.ceil(W * PPM), Math.ceil(D * PPM), (c) => {
      const px = (v: number) => (v + M) * PPM;
      c.fillStyle = '#5f9e42';
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      for (let i = 0; i < W * D * 6; i++) {
        c.fillStyle = ['rgba(40,80,20,0.18)', 'rgba(200,230,130,0.16)', 'rgba(90,140,50,0.2)'][i % 3];
        c.fillRect(Math.random() * c.canvas.width, Math.random() * c.canvas.height, 3, 2);
      }
      // Gravel along the passages, then grass at the hedges' feet (a soft edge round every hedge).
      c.fillStyle = '#c8b48a';
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
        if (wall[ty * tw + tx]) continue;
        c.fillRect(px(tileStart(tx)) - 1, px(tileStart(ty)) - 1, tileSize(tx) * PPM + 2, tileSize(ty) * PPM + 2);
      }
      const gravel = (x0: number, z0: number, x1: number, z1: number) => {
        c.fillStyle = '#c8b48a';
        c.beginPath();
        c.roundRect(px(x0) + 5, px(z0) + 5, (x1 - x0) * PPM - 10, (z1 - z0) * PPM - 10, 8);
        c.fill();
      };
      c.fillStyle = '#5f9e42';
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
        if (!wall[ty * tw + tx]) continue;
        const e = 0.16;
        c.beginPath();
        c.roundRect(px(tileStart(tx) - e), px(tileStart(ty) - e), (tileSize(tx) + 2 * e) * PPM, (tileSize(ty) + 2 * e) * PPM, 5);
        c.fill();
      }
      const [yx0, yz0, yx1, yz1] = this.yard;
      gravel(yx0, yz0 - 0.4, yx1, yz1);
      // Pebbles.
      const img = c.getImageData(0, 0, c.canvas.width, c.canvas.height);
      for (let i = 0; i < W * D * 30; i++) {
        const x = Math.floor(Math.random() * c.canvas.width), y = Math.floor(Math.random() * c.canvas.height);
        const k = (y * c.canvas.width + x) * 4;
        if (img.data[k] < 150) continue;
        c.fillStyle = ['rgba(120,100,70,0.5)', 'rgba(255,250,230,0.5)', 'rgba(150,130,100,0.6)'][i % 3];
        c.beginPath();
        c.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }, false);
    const geo = new THREE.PlaneGeometry(W, D);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2 - M, 0, D / 2 - M);
    const g = new THREE.Mesh(geo, toonOwn(0xffffff, 0, tex));
    g.receiveShadow = true;
    this.group.add(g);
    // Further out: meadow.
    const far = new THREE.PlaneGeometry(400, 400);
    far.rotateX(-Math.PI / 2);
    const fuv = far.attributes.uv as THREE.BufferAttribute, fp = far.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fp.getX(i) / 4, fp.getZ(i) / 4);
    far.translate(this.width / 2, -0.02, this.depth / 2);
    const fm = new THREE.Mesh(far, toonOwn(0xffffff, 0, meadowTex()));
    fm.receiveShadow = true;
    this.group.add(fm);
  }

  /** The hedges: one mesh of leafy blocks (only the sides you can see), with a bumpy clipped top. */
  private hedges() {
    for (const c of [...this.hedgeGroup.children]) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
    const { tw, th } = this.layout;
    const pos: number[] = [], uv: number[] = [], nrm: number[] = [];
    const quad = (p: number[][], n: number[], t: number[][]) => {
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); nrm.push(...n); uv.push(...t[k]); }
    };
    const H = HEDGE_H, S = 0.9;
    const bumps: [number, number, number, number][] = [];
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      if (!this.isWallTile(tx, ty) || this.skip.has(ty * tw + tx)) continue;
      const x0 = tileStart(tx), x1 = x0 + tileSize(tx), z0 = tileStart(ty), z1 = z0 + tileSize(ty);
      quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], [0, 1, 0], [[x0 / S, z1 / S], [x1 / S, z1 / S], [x1 / S, z0 / S], [x0 / S, z0 / S]]);
      if (!this.isWallTile(tx, ty + 1)) quad([[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1], [[x0 / S, 0], [x1 / S, 0], [x1 / S, H / S], [x0 / S, H / S]]);
      if (!this.isWallTile(tx, ty - 1)) quad([[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1], [[x1 / S, 0], [x0 / S, 0], [x0 / S, H / S], [x1 / S, H / S]]);
      if (!this.isWallTile(tx + 1, ty)) quad([[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0], [[z1 / S, 0], [z0 / S, 0], [z0 / S, H / S], [z1 / S, H / S]]);
      if (!this.isWallTile(tx - 1, ty)) quad([[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0], [[z0 / S, 0], [z1 / S, 0], [z1 / S, H / S], [z0 / S, H / S]]);
      // Bumps along the top.
      const n = Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 0.55));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const bx = tileSize(tx) > tileSize(ty) ? x0 + (x1 - x0) * u : (x0 + x1) / 2, bz = tileSize(tx) > tileSize(ty) ? (z0 + z1) / 2 : z0 + (z1 - z0) * u;
        bumps.push([bx + (Math.random() - 0.5) * 0.15, H - 0.02, bz + (Math.random() - 0.5) * 0.15, 0.3 + Math.random() * 0.12]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, texMat('leaf', leafTex));
    mesh.castShadow = mesh.receiveShadow = true;
    this.hedgeGroup.add(mesh);
    const bumpMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshToonMaterial({ color: 0xffffff }), bumps.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    bumps.forEach(([x, y, z, r], i) => {
      bumpMesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(r * 1.2, r * 0.6, r * 1.2)));
      bumpMesh.setColorAt(i, col.set([0x3e7e30, 0x4a9038, 0x356e2a, 0x56a040][i % 4]));
    });
    bumpMesh.castShadow = true;
    this.hedgeGroup.add(bumpMesh);
    this.onNewMeshes(this.hedgeGroup);
  }

  /** The way in: a wooden arch with lanterns, a sign, and a fenced courtyard outside. */
  private entrance() {
    const g = this.group;
    const [gx] = this.layout.entrance.gap;
    const x0 = tileStart(gx) - 0.1, x1 = x0 + tileSize(gx) + 0.2, z = this.depth;
    for (const x of [x0, x1]) {
      g.add(cyl(0.12, 0.14, 2.6, toon(0x7a5230), x, 0, z - 0.4, 10));
      // A lantern on each post.
      const lamp = new THREE.Group();
      lamp.add(cyl(0.09, 0.09, 0.2, glow(0xffc060, 1.6), 0, 0, 0, 8));
      lamp.add(cyl(0.12, 0.05, 0.06, toon(0x2a2a2a), 0, 0.2, 0, 8));
      lamp.position.set(x, 2.1, z - 0.4 + 0.18);
      g.add(lamp);
      const light = new THREE.PointLight(0xffb050, 3, 5, 1.6);
      light.position.set(x, 2.2, z);
      this.lanterns.push(light);
      g.add(light);
    }
    // The arch: a beam with the name.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.5, 0.45, 0.12), [toon(0x8a5a30), toon(0x8a5a30), toon(0x8a5a30), toon(0x8a5a30), toonOwn(0xffffff, 0, this.signTex()), toon(0x8a5a30)]);
    beam.position.set((x0 + x1) / 2, 2.45, z - 0.4);
    beam.castShadow = true;
    g.add(beam);
    // The courtyard's low fence.
    const [yx0, , yx1, yz1] = this.yard;
    const fence = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.9);
      for (let i = 0; i <= n; i++) g.add(cyl(0.05, 0.06, 0.8, toon(0x8a6a48), ax + ((bx - ax) * i) / n, 0, az + ((bz - az) * i) / n, 6));
      for (const y of [0.35, 0.65]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.04), toon(0xa0805a));
        rail.position.set((ax + bx) / 2, y, (az + bz) / 2);
        rail.rotation.y = -Math.atan2(bz - az, bx - ax);
        rail.castShadow = true;
        g.add(rail);
      }
    };
    fence(yx0, z, yx0, yz1);
    fence(yx1, z, yx1, yz1);
    fence(yx0, yz1, yx1, yz1);
    // Flowers in the courtyard's corners.
    const fl: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) {
      const left = i % 2 === 0;
      fl.push([(left ? yx0 + 0.35 : yx1 - 0.35) + (Math.random() - 0.5) * 0.4, 0, z + 0.6 + Math.random() * 3.2]);
    }
    g.add(flowersAt(fl));
  }

  private signTex() {
    return canvasTex(null, 512, 96, (c) => {
      c.fillStyle = '#c8945a';
      c.fillRect(0, 0, 512, 96);
      for (let i = 0; i < 5; i++) { c.strokeStyle = 'rgba(90,50,20,0.25)'; c.beginPath(); c.moveTo(0, 12 + i * 18); c.lineTo(512, 14 + i * 18); c.stroke(); }
      c.strokeStyle = '#6a4424';
      c.lineWidth = 8;
      c.strokeRect(4, 4, 504, 88);
      c.fillStyle = '#2a1a0e';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 52px "Bungee", "Arial Black", sans-serif';
      c.fillText(this.layout.def.name.toUpperCase(), 256, 52, 470);
    }, false);
  }

  /** The ruby's chamber: a ring of stones, a pedestal, and the ruby turning slowly above it. */
  private rubyChamber() {
    const g = this.group;
    const { x, z } = this.rubyPos;
    const stone = texMat('stone', stoneTex);
    const ped = cyl(0.32, 0.42, 0.9, stone, x, 0, z, 10);
    g.add(ped);
    g.add(cyl(0.4, 0.4, 0.08, toon(0xd8d0bc), x, 0.9, z, 12));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = rock(0.8 + Math.random() * 0.4);
      r.position.set(x + Math.cos(a) * 2.4, 0, z + Math.sin(a) * 2.4);
      g.add(r);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshToonMaterial({ color: 0xe0203a, emissive: 0x801020 }));
    gem.scale.y = 1.3;
    gem.castShadow = true;
    this.ruby.add(gem);
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glow(0xff5070, 2.2));
    inner.scale.y = 1.3;
    this.ruby.add(inner);
    this.ruby.position.set(x, 1.35, z);
    g.add(this.ruby);
  }

  /** Outside: fields, trees, bushes, rocks, clouds, sky. */
  private countryside() {
    const g = this.group;
    const cx = this.width / 2, cz = this.depth / 2, R = Math.max(this.width, this.depth) / 2;
    const sky = canvasTex(null, 4, 256, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#2a5aa8');
      grd.addColorStop(0.45, '#8ab0e0');
      grd.addColorStop(0.62, '#f8d8b0');
      grd.addColorStop(1, '#f8d8b0');
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 256);
    }, false);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(230, 24, 12), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })));
    for (let i = 0; i < 8; i++) {
      const c = cloud();
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 80;
      c.position.set(cx + Math.cos(a) * d, 30 + Math.random() * 25, cz + Math.sin(a) * d);
      c.scale.setScalar(1 + Math.random());
      c.lookAt(cx, c.position.y, cz);
      this.clouds.push(c);
      g.add(c);
    }
    const outside = (x: number, z: number, m: number) => x < -m || z < -m || x > this.width + m || z > this.depth + 5 + m;
    let n = 0;
    for (let tries = 0; n < 50 && tries < 2000; tries++) {
      const a = Math.random() * Math.PI * 2, d = R + 4 + Math.random() * 30;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!outside(x, z, 3)) continue;
      const t = Math.random() < 0.7 ? tree(1.2) : pine(1.3);
      t.position.set(x, 0, z);
      g.add(t);
      n++;
    }
    for (let i = 0, k = 0; k < 30 && i < 1000; i++) {
      const x = -6 + Math.random() * (this.width + 12), z = -6 + Math.random() * (this.depth + 17);
      if (!outside(x, z, 0.8)) continue;
      const o = Math.random() < 0.6 ? bush(1 + Math.random() * 0.5) : rock(0.8 + Math.random());
      o.position.set(x, 0, z);
      g.add(o);
      k++;
    }
    const fl: [number, number, number][] = [], tf: [number, number, number][] = [];
    for (let i = 0; i < 3000; i++) {
      const x = -12 + Math.random() * (this.width + 24), z = -12 + Math.random() * (this.depth + 30);
      if (!outside(x, z, 0.5)) continue;
      (Math.random() < 0.5 ? fl : tf).push([x, 0, z]);
    }
    g.add(flowersAt(fl), tuftsAt(tf));
    // Tufts and the odd flower at the hedges' feet inside the maze.
    const inner: [number, number, number][] = [];
    const { tw, th } = this.layout;
    for (let ty = 1; ty < th - 1; ty++) for (let tx = 1; tx < tw - 1; tx++) {
      if (this.isWallTile(tx, ty) || Math.random() < 0.6) continue;
      const x = tileStart(tx) + 0.15 + Math.random() * (tileSize(tx) - 0.3), z = tileStart(ty) + 0.15 + Math.random() * (tileSize(ty) - 0.3);
      // Near a hedge only.
      if (!(this.solidAt(x - 0.35, z) || this.solidAt(x + 0.35, z) || this.solidAt(x, z - 0.35) || this.solidAt(x, z + 0.35))) continue;
      inner.push([x, 0, z]);
    }
    g.add(tuftsAt(inner));
    void ball;
  }

  /**
   * The maze shifts (the layout has already changed): new hedges grow up out of the ground across
   * the closed passages, and the opened ones sink away.
   */
  shift(closed: number[], opened: number[]) {
    const { tw } = this.layout;
    const block = (k: number) => {
      const tx = k % tw, ty = Math.floor(k / tw);
      const geo = new THREE.BoxGeometry(tileSize(tx) + 0.04, HEDGE_H, tileSize(ty) + 0.04);
      geo.translate(0, HEDGE_H / 2, 0);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
      const m = new THREE.Mesh(geo, texMat('leaf', leafTex));
      m.position.set(tileMid(tx), 0, tileMid(ty));
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    for (const k of closed) { this.skip.add(k); this.moving.push({ mesh: block(k), grow: true, t: 0 }); }
    for (const k of opened) this.moving.push({ mesh: block(k), grow: false, t: 0 });
    this.hedges();
  }

  /** Is a hedge growing or sinking right now? */
  get shifting() {
    return this.moving.length > 0;
  }

  /** The ruby turns and bobs; lanterns flicker; clouds drift. */
  update(dt: number) {
    this.t += dt;
    this.ruby.rotation.y += dt * 1.4;
    if (this.ruby.userData.free !== true) this.ruby.position.y = 1.35 + Math.sin(this.t * 2) * 0.06;
    this.rubyLight.intensity = this.ruby.visible ? 5 + Math.sin(this.t * 3) * 1 : 0;
    for (const l of this.lanterns) l.intensity = 2.6 + Math.sin(this.t * 13 + l.position.x) * 0.25 + Math.sin(this.t * 7.3) * 0.2;
    for (const c of this.clouds) c.position.x += dt * 0.5;
    for (const tr of this.traps) animateTrap(tr, this.t, dt);
    // Hedges growing up (with a shiver) or sinking down.
    if (this.moving.length) {
      for (const mv of this.moving) {
        mv.t += dt;
        const u = Math.min(1, mv.t / 1.8), e = u * u * (3 - 2 * u);
        const h = mv.grow ? e : 1 - e;
        mv.mesh.scale.set(1 + Math.sin(mv.t * 30) * 0.03 * (1 - u), Math.max(0.01, h), 1 + Math.cos(mv.t * 27) * 0.03 * (1 - u));
      }
      if (this.moving.every((mv) => mv.t >= 1.8)) {
        for (const mv of this.moving) { mv.mesh.removeFromParent(); mv.mesh.geometry.dispose(); }
        this.moving = [];
        this.skip.clear();
        this.hedges();
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
