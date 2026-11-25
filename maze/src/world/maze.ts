// A maze in 3D: its walls (clipped hedges, town walls or castle stones, by the maze's theme), a path
// along every passage (gravel, cobbles or flagstones), the way in with a little courtyard outside it
// (where you start and where you must come back to), the ruby on its pedestal in its chamber, and
// the world round it all (countryside, the town, or a moat and mountains). Also answers "is this spot
// solid?" for walking about.
import * as THREE from 'three';
import type { Layout } from '../data/mazes';
import { ball, cyl, glow, toon, toonOwn } from './toon';
import { type TrapView, animateTrap, trapView } from './traps';
import { bush, canvasTex, cloud, flowersAt, meadowTex, pine, rock, stoneTex, texMat, tree, tuftsAt } from './decor';
import { STYLES, type ThemeStyle, banner, barrel, brazier, cobblePattern, flagPattern, flowerpot, house, mountain, plankPattern, wallLamp } from './themes';

/** Wall tiles are thin, passage tiles wide (metres). */
export const WALL_W = 0.8;
export const CELL_W = 2.3;
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
  readonly style: ThemeStyle;
  /** Fires burning (braziers on the castle's corners), to flicker. */
  private flames: THREE.Object3D[] = [];
  /** The castle's moat (it shimmers). */
  private water: THREE.MeshToonMaterial | null = null;

  constructor(readonly layout: Layout) {
    this.style = STYLES[layout.def.theme];
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
    this.cornerLights();
    this.entrance();
    this.rubyChamber();
    for (const t of layout.traps) {
      const v = trapView(t, { isWall: (x, y) => this.isWallTile(x, y), wallH: this.style.wallH });
      this.traps.push(v);
      this.group.add(v.group);
    }
    this.countryside();

    // Light: a low evening sun (the hedges), dusk (the town), the moon (the castle); a soft sky.
    const st = this.style;
    this.group.add(new THREE.HemisphereLight(st.hemi[0], st.hemi[1], st.hemi[2]));
    const sun = new THREE.DirectionalLight(st.sun[0], st.sun[1]);
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

  /**
   * The ground: a path painted along every open passage (gravel between grass verges in the hedge
   * maze, cobbles with stone kerbs in the town, flagstones in the castle).
   */
  private ground() {
    const { tw, th, wall } = this.layout;
    const theme = this.layout.def.theme;
    // (Finer for the town and castle: cobbles and flagstones need it.)
    const M = 10, PPM = theme === 'bushes' ? 20 : 28;
    const W = this.width + 2 * M, D = this.depth + 2 * M + 6;
    const tex = canvasTex(null, Math.ceil(W * PPM), Math.ceil(D * PPM), (c) => {
      const px = (v: number) => (v + M) * PPM;
      const [yx0, yz0, yx1, yz1] = this.yard;
      if (theme !== 'bushes') {
        // Cobbles or flagstones everywhere, a kerb (or a dark damp edge) at every wall's foot.
        c.fillStyle = theme === 'city' ? '#4e5a3a' : '#2e3a2a';
        c.fillRect(0, 0, c.canvas.width, c.canvas.height);
        const pat = c.createPattern(theme === 'city' ? cobblePattern() : flagPattern(), 'repeat')!;
        c.fillStyle = pat;
        c.fillRect(px(-0.2), px(-0.2), (this.width + 0.4) * PPM, (this.depth + 0.4) * PPM);
        c.fillStyle = theme === 'city' ? '#cfc6b6' : 'rgba(20,18,24,0.45)';
        for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
          if (!wall[ty * tw + tx]) continue;
          const e = 0.2;
          c.fillRect(px(tileStart(tx) - e), px(tileStart(ty) - e), (tileSize(tx) + 2 * e) * PPM, (tileSize(ty) + 2 * e) * PPM);
        }
        // The courtyard: a cobbled square (town), the drawbridge's planks (castle).
        c.fillStyle = theme === 'city' ? pat : c.createPattern(plankPattern(), 'repeat')!;
        c.fillRect(px(yx0), px(yz0 - 0.4), (yx1 - yx0) * PPM, (yz1 - yz0 + 0.4) * PPM);
        if (theme === 'castle') {
          // (Straw strewn about.)
          for (let i = 0; i < W * D * 3; i++) {
            c.strokeStyle = ['rgba(220,190,110,0.5)', 'rgba(190,160,90,0.45)'][i % 2];
            c.lineWidth = 1;
            const x = Math.random() * c.canvas.width, y = Math.random() * c.canvas.height, a = Math.random() * 3;
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); c.stroke();
          }
        } else {
          // (Puddles here and there.)
          for (let i = 0; i < W * D * 0.02; i++) {
            c.fillStyle = 'rgba(80,90,120,0.35)';
            c.beginPath(); c.ellipse(Math.random() * c.canvas.width, Math.random() * c.canvas.height, 10 + Math.random() * 14, 6 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2); c.fill();
          }
        }
        return;
      }
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
    const fm = new THREE.Mesh(far, toonOwn(theme === 'castle' ? 0x8a9a8a : 0xffffff, 0, meadowTex()));
    fm.receiveShadow = true;
    this.group.add(fm);
    if (theme === 'castle') this.moat();
  }

  /** The castle's moat: water all round, just outside the walls (the drawbridge crosses it). */
  private moat() {
    const tex = canvasTex(null, 128, 128, (c) => {
      c.fillStyle = '#2a4a6a'; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) { c.strokeStyle = 'rgba(160,200,240,0.35)'; c.lineWidth = 1.5; const x = Math.random() * 128, y = Math.random() * 128; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 3, x + 12, y); c.stroke(); }
    });
    this.water = toonOwn(0xffffff, 0, tex);
    const [yx0, , yx1] = this.yard;
    const W = this.width, D = this.depth, IN = 1.0, OUT = 4.2;
    const strip = (x0: number, z0: number, x1: number, z1: number) => {
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 3, uv.getY(i) * (z1 - z0) / 3);
      const m = new THREE.Mesh(geo, this.water!);
      m.position.set((x0 + x1) / 2, -0.01, (z0 + z1) / 2);
      this.group.add(m);
    };
    strip(-OUT, -OUT, W + OUT, -IN);
    strip(-OUT, -IN, -IN, D + OUT);
    strip(W + IN, -IN, W + OUT, D + OUT);
    // (Along the front, both sides of the drawbridge.)
    strip(-IN, D + IN, yx0, D + OUT);
    strip(yx1, D + IN, W + IN, D + OUT);
  }

  /**
   * The walls: one mesh of blocks (only the sides you can see) and their tops. Hedges get a bumpy
   * clipped top; town walls a row of red tiles; castle walls battlements.
   */
  private hedges() {
    for (const c of [...this.hedgeGroup.children]) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
    const { tw, th } = this.layout;
    const theme = this.layout.def.theme, st = this.style;
    const pos: number[] = [], uv: number[] = [], nrm: number[] = [];
    const tpos: number[] = [], tuv: number[] = [], tnrm: number[] = [];
    const quad = (p: number[][], n: number[], t: number[][], top = false) => {
      for (const k of [0, 1, 2, 0, 2, 3]) { (top ? tpos : pos).push(...p[k]); (top ? tnrm : nrm).push(...n); (top ? tuv : uv).push(...t[k]); }
    };
    const H = st.wallH, S = 0.9;
    // Hedges: leaves tile every 0.9 m. Walls: the picture is 2 m along and the wall's full height.
    const U = st.wallUVFull ? 2 : S, V = (y: number) => (st.wallUVFull ? y / H : y / S);
    const bumps: [number, number, number, number][] = [];
    const caps: [number, number, number, number, number][] = [];
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      if (!this.isWallTile(tx, ty) || this.skip.has(ty * tw + tx)) continue;
      const x0 = tileStart(tx), x1 = x0 + tileSize(tx), z0 = tileStart(ty), z1 = z0 + tileSize(ty);
      quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], [0, 1, 0], [[x0 / S, z1 / S], [x1 / S, z1 / S], [x1 / S, z0 / S], [x0 / S, z0 / S]], theme !== 'bushes');
      if (!this.isWallTile(tx, ty + 1)) quad([[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1], [[x0 / U, V(0)], [x1 / U, V(0)], [x1 / U, V(H)], [x0 / U, V(H)]]);
      if (!this.isWallTile(tx, ty - 1)) quad([[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1], [[x1 / U, V(0)], [x0 / U, V(0)], [x0 / U, V(H)], [x1 / U, V(H)]]);
      if (!this.isWallTile(tx + 1, ty)) quad([[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0], [[z1 / U, V(0)], [z0 / U, V(0)], [z0 / U, V(H)], [z1 / U, V(H)]]);
      if (!this.isWallTile(tx - 1, ty)) quad([[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0], [[z0 / U, V(0)], [z1 / U, V(0)], [z1 / U, V(H)], [z0 / U, V(H)]]);
      const long = tileSize(tx) > tileSize(ty), len = Math.max(x1 - x0, z1 - z0);
      if (theme === 'bushes') {
        // Bumps along the top.
        const n = Math.max(1, Math.round(len / 0.55));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          const bx = long ? x0 + (x1 - x0) * u : (x0 + x1) / 2, bz = long ? (z0 + z1) / 2 : z0 + (z1 - z0) * u;
          bumps.push([bx + (Math.random() - 0.5) * 0.15, H - 0.02, bz + (Math.random() - 0.5) * 0.15, 0.3 + Math.random() * 0.12]);
        }
      } else if (theme === 'city') {
        // A tiled coping over the whole top, a little wider than the wall.
        caps.push([(x0 + x1) / 2, H + 0.06, (z0 + z1) / 2, x1 - x0 + 0.12, z1 - z0 + 0.12]);
      } else {
        // Battlements: square teeth along the top with gaps between.
        if (tileSize(tx) === tileSize(ty)) caps.push([(x0 + x1) / 2, H + 0.17, (z0 + z1) / 2, 0.5, 0.5]);
        else {
          const n = Math.max(1, Math.round(len / 0.75));
          for (let k = 0; k < n; k++) {
            const u = (k + 0.5) / n;
            caps.push([long ? x0 + (x1 - x0) * u : (x0 + x1) / 2, H + 0.17, long ? (z0 + z1) / 2 : z0 + (z1 - z0) * u, long ? 0.38 : 0.62, long ? 0.62 : 0.38]);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, st.wallMat());
    mesh.castShadow = mesh.receiveShadow = true;
    this.hedgeGroup.add(mesh);
    if (tpos.length) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
      tg.setAttribute('normal', new THREE.Float32BufferAttribute(tnrm, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
      const tm = new THREE.Mesh(tg, toon(theme === 'city' ? 0x8a7a68 : 0x7a7680));
      tm.receiveShadow = true;
      this.hedgeGroup.add(tm);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    if (bumps.length) {
      const bumpMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshToonMaterial({ color: 0xffffff }), bumps.length);
      bumps.forEach(([x, y, z, r], i) => {
        bumpMesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, sc.set(r * 1.2, r * 0.6, r * 1.2)));
        bumpMesh.setColorAt(i, col.set([0x3e7e30, 0x4a9038, 0x356e2a, 0x56a040][i % 4]));
      });
      bumpMesh.castShadow = true;
      this.hedgeGroup.add(bumpMesh);
    }
    if (caps.length) {
      const city = theme === 'city';
      const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, city ? 0.12 : 0.34, 1), new THREE.MeshToonMaterial({ color: 0xffffff }), caps.length);
      caps.forEach(([x, y, z, w, d], i) => {
        capMesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, sc.set(w, 1, d)));
        capMesh.setColorAt(i, col.set(city ? [0x8a4a3a, 0x824434, 0x925040][i % 3] : [0x9a96a0, 0x8a8690, 0xa4a0a8][i % 3]));
      });
      capMesh.castShadow = capMesh.receiveShadow = true;
      this.hedgeGroup.add(capMesh);
    }
    this.onNewMeshes(this.hedgeGroup);
  }

  /**
   * Lights on the wall corners (they never move when the maze shifts): street lamps in the town,
   * braziers burning in the castle.
   */
  private cornerLights() {
    const theme = this.layout.def.theme;
    if (theme === 'bushes') return;
    const { tw, th } = this.layout;
    const r = (() => { let a = this.layout.def.seed; return () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296); })();
    for (let ty = 2; ty < th - 2; ty += 2) for (let tx = 2; tx < tw - 2; tx += 2) {
      // Only corners where passages meet (a lamp in a solid block of wall would be wasted).
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !this.isWallTile(tx + dx, ty + dy)).length;
      if (open < 2 || r() > (theme === 'city' ? 0.2 : 0.17)) continue;
      const x = tileMid(tx), z = tileMid(ty), y = this.style.wallH + (theme === 'city' ? 0.12 : 0);
      if (theme === 'city') this.group.add(wallLamp(x, z, y));
      else { const b = brazier(x, z, y); this.group.add(b.group); this.flames.push(b.flame); }
    }
  }

  /**
   * The way in, and the courtyard outside it. Hedges: a wooden arch with lanterns, a low fence and
   * flowers. Town: a stone gateway, iron railings, street lamps and pots of flowers. Castle: two round
   * towers with the portcullis up, and the drawbridge over the moat.
   */
  private entrance() {
    const g = this.group;
    const theme = this.layout.def.theme;
    const [gx] = this.layout.entrance.gap;
    const x0 = tileStart(gx) - 0.1, x1 = x0 + tileSize(gx) + 0.2, z = this.depth;
    const stone = texMat('stone', stoneTex);
    const lantern = (x: number, y: number, zz: number) => {
      const lamp = new THREE.Group();
      lamp.add(cyl(0.09, 0.09, 0.2, glow(0xffc060, 1.6), 0, 0, 0, 8));
      lamp.add(cyl(0.12, 0.05, 0.06, toon(0x2a2a2a), 0, 0.2, 0, 8));
      lamp.position.set(x, y, zz);
      g.add(lamp);
      const light = new THREE.PointLight(0xffb050, 3, 5, 1.6);
      light.position.set(x, y + 0.1, zz + 0.3);
      this.lanterns.push(light);
      g.add(light);
    };
    let beamY = 2.45;
    if (theme === 'bushes') {
      for (const x of [x0, x1]) {
        g.add(cyl(0.12, 0.14, 2.6, toon(0x7a5230), x, 0, z - 0.4, 10));
        lantern(x, 2.1, z - 0.4 + 0.18);
      }
    } else if (theme === 'city') {
      // Stone pillars either side, a little higher than the walls, with a lantern on each.
      for (const x of [x0 - 0.2, x1 + 0.2]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.9, 0.9), stone);
        pil.position.set(x, 1.45, z - 0.4);
        pil.castShadow = true;
        g.add(pil);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 1.05), toon(0xb05a40)).translateX(x).translateY(2.95).translateZ(z - 0.4));
        lantern(x, 2.2, z + 0.1);
      }
      beamY = 2.6;
    } else {
      // Two round towers with pointed roofs and battlements, torches burning on them.
      for (const x of [x0 - 0.75, x1 + 0.75]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 3.6, 14), this.style.wallMat());
        tower.position.set(x, 1.8, z - 0.3);
        tower.castShadow = true;
        g.add(tower);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), toon(0x9a96a0)).translateX(x + Math.cos(a) * 0.82).translateY(3.75).translateZ(z - 0.3 + Math.sin(a) * 0.82));
        }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 12), toon(0x3a4a8a));
        roof.position.set(x, 4.5, z - 0.3);
        roof.castShadow = true;
        g.add(roof);
        const flag = banner(0.5, 0.35, 0xc02838);
        flag.rotation.z = Math.PI / 2;
        flag.position.set(x, 5.4, z - 0.3);
        g.add(flag, cyl(0.02, 0.02, 0.6, toon(0x2a2a2a), x, 5.1, z - 0.3, 5));
        lantern(x + (x < x0 ? 0.6 : -0.6), 2.2, z + 0.35);
      }
      // The portcullis, pulled up over the way in.
      const gate = new THREE.Group();
      const w = x1 - x0;
      for (let i = 0; i <= 6; i++) gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), toon(0x2a2a30)).translateX(-w / 2 + (i / 6) * w));
      for (const y of [-0.3, 0.1]) gate.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), toon(0x2a2a30)).translateY(y));
      for (let i = 0; i <= 6; i++) gate.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), toon(0x2a2a30)).translateX(-w / 2 + (i / 6) * w).translateY(-0.5).rotateX(Math.PI));
      gate.position.set((x0 + x1) / 2, 2.4, z - 0.1);
      g.add(gate);
      beamY = 3.15;
    }
    // The arch: a beam with the name.
    const wood = theme === 'city' ? 0x6a6058 : theme === 'castle' ? 0x5a5660 : 0x8a5a30;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + (theme === 'bushes' ? 0.5 : 1.0), 0.45, 0.12), [toon(wood), toon(wood), toon(wood), toon(wood), toonOwn(0xffffff, 0, this.signTex()), toon(wood)]);
    beam.position.set((x0 + x1) / 2, beamY, z - 0.4 + (theme === 'castle' ? 0.5 : 0));
    beam.castShadow = true;
    g.add(beam);
    // The courtyard's sides.
    const [yx0, , yx1, yz1] = this.yard;
    const fence = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / (theme === 'city' ? 0.25 : 0.9));
      const post = theme === 'city' ? 0x22242a : theme === 'castle' ? 0x5a4028 : 0x8a6a48;
      const railC = theme === 'city' ? 0x22242a : theme === 'castle' ? 0x6a4a30 : 0xa0805a;
      for (let i = 0; i <= n; i++) {
        const px = ax + ((bx - ax) * i) / n, pz = az + ((bz - az) * i) / n;
        g.add(cyl(theme === 'city' ? 0.015 : 0.05, theme === 'city' ? 0.015 : 0.06, theme === 'city' ? 0.95 : 0.8, toon(post), px, 0, pz, 6));
        if (theme === 'city') g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), toon(0xc8a040)).translateX(px).translateY(0.98).translateZ(pz));
      }
      for (const y of theme === 'city' ? [0.12, 0.85] : [0.35, 0.65]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, theme === 'city' ? 0.03 : 0.06, 0.04), toon(railC));
        rail.position.set((ax + bx) / 2, y, (az + bz) / 2);
        rail.rotation.y = -Math.atan2(bz - az, bx - ax);
        rail.castShadow = true;
        g.add(rail);
      }
    };
    fence(yx0, z, yx0, yz1);
    fence(yx1, z, yx1, yz1);
    if (theme !== 'castle') fence(yx0, yz1, yx1, yz1);
    if (theme === 'bushes') {
      // Flowers in the courtyard's corners.
      const fl: [number, number, number][] = [];
      for (let i = 0; i < 40; i++) {
        const left = i % 2 === 0;
        fl.push([(left ? yx0 + 0.35 : yx1 - 0.35) + (Math.random() - 0.5) * 0.4, 0, z + 0.6 + Math.random() * 3.2]);
      }
      g.add(flowersAt(fl));
    } else if (theme === 'city') {
      // Pots of flowers and a pair of street lamps.
      for (const [px, pz] of [[yx0 + 0.4, z + 0.8], [yx1 - 0.4, z + 0.8], [yx0 + 0.4, z + 3.6], [yx1 - 0.4, z + 3.6], [yx0 + 0.4, z + 2.2], [yx1 - 0.4, z + 2.2]]) {
        const fp = flowerpot(1.6);
        fp.position.set(px, 0, pz);
        g.add(fp);
      }
      for (const px of [yx0 + 0.45, yx1 - 0.45]) g.add(wallLamp(px, z + 3.0, 0, 2.0));
      for (const px of [yx0 - 0.6, yx1 + 0.6]) { const b = barrel(); b.position.set(px, 0.35, z + 1.4); g.add(b); }
    } else {
      // Chains from the towers down to the drawbridge's far corners.
      for (const [ax, bx] of [[x0 - 0.75, yx0 + 0.1], [x1 + 0.75, yx1 - 0.1]]) {
        const from = new THREE.Vector3(ax, 3.0, z - 0.1), to = new THREE.Vector3(bx, 0.15, yz1 - 0.3);
        const len = from.distanceTo(to);
        const ch = cyl(0.025, 0.025, len, toon(0x3a3a40), 0, 0, 0, 5);
        ch.position.copy(from).add(to).multiplyScalar(0.5);
        ch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        g.add(ch);
      }
    }
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
    const theme = this.layout.def.theme;
    if (theme === 'bushes') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = rock(0.8 + Math.random() * 0.4);
        r.position.set(x + Math.cos(a) * 2.4, 0, z + Math.sin(a) * 2.4);
        g.add(r);
      }
    } else if (theme === 'city') {
      // A town square: a round fountain basin round the pedestal, pots of flowers in a ring.
      const basin = cyl(0.78, 0.82, 0.32, stone, x, 0, z, 20);
      g.add(basin);
      g.add(cyl(0.68, 0.68, 0.02, toon(0x4a8ac8), x, 0.28, z, 20));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const fp = flowerpot(1.8);
        fp.position.set(x + Math.cos(a) * 2.5, 0, z + Math.sin(a) * 2.5);
        g.add(fp);
      }
    } else {
      // A throne room: a red carpet with a gold edge, a brazier at each corner.
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), toon(0x9a1a2a));
      carpet.position.set(x, 0.012, z);
      carpet.receiveShadow = true;
      g.add(carpet);
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7).rotateX(-Math.PI / 2), toon(0xd0a030));
      edge.position.set(x, 0.008, z);
      g.add(edge);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const b = brazier(x + dx * 2.3, z + dz * 2.3, 0);
        b.group.scale.setScalar(1.6);
        this.flames.push(b.flame);
        g.add(b.group);
      }
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

  /** Outside: the sky, and fields and trees (hedges), the town's houses (city), mountains under the moon (castle). */
  private countryside() {
    const g = this.group;
    const theme = this.layout.def.theme, st = this.style;
    const cx = this.width / 2, cz = this.depth / 2, R = Math.max(this.width, this.depth) / 2;
    const sky = canvasTex(null, 4, 256, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, st.sky[0]);
      grd.addColorStop(0.45, st.sky[1]);
      grd.addColorStop(0.62, st.sky[2]);
      grd.addColorStop(1, st.sky[2]);
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 256);
    }, false);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(230, 24, 12), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })));
    if (theme !== 'bushes') {
      // Stars (and the moon over the castle).
      for (let i = 0; i < (theme === 'castle' ? 160 : 50); i++) {
        const a = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 1.1;
        const st2 = new THREE.Mesh(new THREE.CircleGeometry(0.4 + Math.random() * 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
        st2.position.set(cx + Math.cos(a) * Math.cos(el) * 220, Math.sin(el) * 220, cz + Math.sin(a) * Math.cos(el) * 220);
        st2.lookAt(cx, 0, cz);
        g.add(st2);
      }
      if (theme === 'castle') {
        const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false }));
        moon.position.set(cx - 90, 120, cz - 150);
        moon.lookAt(cx, 0, cz);
        g.add(moon);
      }
    }
    for (let i = 0; i < (theme === 'castle' ? 4 : 8); i++) {
      const c = cloud();
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 80;
      c.position.set(cx + Math.cos(a) * d, 30 + Math.random() * 25, cz + Math.sin(a) * d);
      c.scale.setScalar(1 + Math.random());
      c.lookAt(cx, c.position.y, cz);
      this.clouds.push(c);
      g.add(c);
    }
    const outside = (x: number, z: number, m: number) => x < -m || z < -m || x > this.width + m || z > this.depth + 5 + m;
    if (theme === 'city') { this.town(outside); return; }
    if (theme === 'castle') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, d = R + 60 + Math.random() * 40;
        const m = mountain(20 + Math.random() * 14, 26 + Math.random() * 20);
        m.position.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
        g.add(m);
      }
    }
    let n = 0;
    for (let tries = 0; n < 50 && tries < 2000; tries++) {
      const a = Math.random() * Math.PI * 2, d = R + 4 + Math.random() * 30;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!outside(x, z, 3)) continue;
      const t = theme === 'castle' ? pine(1.2 + Math.random() * 0.6) : Math.random() < 0.7 ? tree(1.2) : pine(1.3);
      t.position.set(x, 0, z);
      g.add(t);
      n++;
    }
    for (let i = 0, k = 0; k < 30 && i < 1000; i++) {
      const x = -6 + Math.random() * (this.width + 12), z = -6 + Math.random() * (this.depth + 17);
      if (!outside(x, z, theme === 'castle' ? 4.6 : 0.8)) continue;
      const o = Math.random() < (theme === 'castle' ? 0.2 : 0.6) ? bush(1 + Math.random() * 0.5) : rock(0.8 + Math.random());
      o.position.set(x, 0, z);
      g.add(o);
      k++;
    }
    const fl: [number, number, number][] = [], tf: [number, number, number][] = [];
    for (let i = 0; i < 3000; i++) {
      const x = -12 + Math.random() * (this.width + 24), z = -12 + Math.random() * (this.depth + 30);
      if (!outside(x, z, theme === 'castle' ? 4.4 : 0.5)) continue;
      (Math.random() < (theme === 'castle' ? 0.1 : 0.5) ? fl : tf).push([x, 0, z]);
    }
    g.add(flowersAt(fl), tuftsAt(tf));
    if (theme === 'castle') return;
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

  /** The town round the walls: rows of houses facing in, a few trees, lamps and barrels. */
  private town(outside: (x: number, z: number, m: number) => boolean) {
    const g = this.group;
    const W = this.width, D = this.depth;
    // A ring of houses, a street's width from the walls.
    const row = (x0: number, z0: number, x1: number, z1: number, face: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let u = 0; u < len;) {
        const w = 3 + Math.random() * 2.5, d = 4 + Math.random() * 2, h = 3.4 + Math.random() * 2.6;
        const k = Math.min(1, (u + w / 2) / len);
        const hs = house(w, d, h);
        hs.position.set(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k);
        hs.rotation.y = face;
        g.add(hs);
        u += w + 0.15;
      }
    };
    const S = 6.5;
    row(-S, -S - 2, W + S, -S - 2, 0);
    row(-S - 2, -S, -S - 2, D + S + 4, Math.PI / 2);
    row(W + S + 2, -S, W + S + 2, D + S + 4, Math.PI / 2);
    const [yx0, , yx1] = this.yard;
    row(-S, D + S + 6, yx0 - 2, D + S + 6, 0);
    row(yx1 + 2, D + S + 6, W + S, D + S + 6, 0);
    for (let i = 0, k = 0; k < 24 && i < 600; i++) {
      const x = -4 + Math.random() * (W + 8), z = -4 + Math.random() * (D + 14);
      if (!outside(x, z, 1.2) || x < -5 || x > W + 5 || z < -5 || z > D + 10) continue;
      const r = Math.random();
      const o = r < 0.35 ? tree(0.9) : r < 0.65 ? barrel() : r < 0.8 ? wallLamp(0, 0, 0, 2.0) : flowerpot(1.8);
      o.position.set(x, r >= 0.35 && r < 0.65 ? 0.35 : 0, z);
      g.add(o);
      k++;
    }
  }

  /**
   * The maze shifts (the layout has already changed): new hedges grow up out of the ground across
   * the closed passages, and the opened ones sink away.
   */
  shift(closed: number[], opened: number[]) {
    const { tw } = this.layout;
    const block = (k: number) => {
      const tx = k % tw, ty = Math.floor(k / tw);
      const H = this.style.wallH;
      const geo = new THREE.BoxGeometry(tileSize(tx) + 0.04, H, tileSize(ty) + 0.04);
      geo.translate(0, H / 2, 0);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      if (!this.style.wallUVFull) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
      const m = new THREE.Mesh(geo, this.style.wallMat());
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

  /** The ruby turns and bobs; lanterns and fires flicker; clouds drift; the traps do their thing (some watch where you are). */
  update(dt: number, hero: THREE.Vector3) {
    this.t += dt;
    this.ruby.rotation.y += dt * 1.4;
    if (this.ruby.userData.free !== true) this.ruby.position.y = 1.35 + Math.sin(this.t * 2) * 0.06;
    this.rubyLight.intensity = this.ruby.visible ? 5 + Math.sin(this.t * 3) * 1 : 0;
    for (const l of this.lanterns) l.intensity = 2.6 + Math.sin(this.t * 13 + l.position.x) * 0.25 + Math.sin(this.t * 7.3) * 0.2;
    for (const c of this.clouds) c.position.x += dt * 0.5;
    for (const tr of this.traps) animateTrap(tr, this.t, dt, hero);
    for (const [i, f] of this.flames.entries()) {
      const k = 1 + Math.sin(this.t * 17 + i * 2.3) * 0.12 + Math.sin(this.t * 29 + i) * 0.08;
      f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    }
    if (this.water?.map) this.water.map.offset.set(Math.sin(this.t * 0.3) * 0.1, this.t * 0.02);
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
