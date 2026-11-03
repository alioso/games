// Turns a floor plan into the house you see: floors, walls,
// doors that swing, windows with wind, stairwells, darkness over rooms not yet explored.
import * as THREE from 'three';
import { damp } from '@engine/math';
import { HOUSE } from '../data/tuning';
import { ROOMS } from '../data/rooms';
import { type Door, type FloorPlan, type Rect, stairRects } from './plan';
import { block, glow, hinge, ink, toon, toonOwn } from './toon';
import { floorTexture, wallTexture } from './textures';

const H = HOUSE.wallHeight;
const T = HOUSE.wallThick / 2;
const OUTSIDE = 0x3a302c;
const CAP = 0x1e1612;

export interface DoorRT {
  door: Door;
  pivot: THREE.Group;
  angle: number;
  target: number;
  opened: boolean;
  /** Hinge on the low end (+1) or the high end (-1) of the doorway. */
  side: number;
  root: THREE.Group;
}

interface WindowRT {
  curtains: THREE.Object3D[];
  open: boolean;
  x: number;
  z: number;
  phase: number;
}

export interface LightSource {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  flicker: number;
  room: number;
}

/** Scale a box's side-face UVs so wallpaper repeats every unit along the wall. */
function wallBox(len: number, h: number, axis: 'h' | 'v', vFrom = 0, vTo = 1) {
  const geo = axis === 'h' ? new THREE.BoxGeometry(len, h, HOUSE.wallThick) : new THREE.BoxGeometry(HOUSE.wallThick, h, len);
  geo.translate(0, h / 2, 0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const sides = axis === 'h' ? [4, 5] : [0, 1];
  for (const f of sides)
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * len, vFrom + uv.getY(i) * (vTo - vFrom));
  uv.needsUpdate = true;
  return geo;
}

export class House {
  readonly group = new THREE.Group();
  readonly doors: DoorRT[] = [];
  readonly lights: LightSource[] = [];
  exitDoor!: DoorRT;
  private windows: WindowRT[] = [];
  private overlays = new Map<number, { mesh: THREE.Mesh; fade: number }>();
  private wallMats = new Map<number, THREE.Material>();

  constructor(readonly plan: FloorPlan) {
    this.buildFloors();
    this.buildWalls();
    this.buildDoors();
    this.buildWindows();
    this.buildStairs();
    for (const r of plan.rooms) this.addOverlay(r.id, r.rect);
  }

  private wallMat(room: number) {
    let m = this.wallMats.get(room);
    if (!m) {
      m = room < 0 ? toon(OUTSIDE) : toonOwn(0xffffff, 0, wallTexture(this.plan.rooms[room].walls));
      this.wallMats.set(room, m);
    }
    return m;
  }

  private buildFloors() {
    for (const room of this.plan.rooms) {
      const r = room.rect;
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2, (uv.getY(i) * d) / 2);
      const mesh = new THREE.Mesh(geo, toonOwn(0xffffff, 0, floorTexture(ROOMS[room.type].floor)));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // The floor's edge, seen around the stairwells.
    const b = this.plan.bounds;
    const slab = block(b.x1 - b.x0 + 0.2, 0.5, b.z1 - b.z0 + 0.2, CAP, (b.x0 + b.x1) / 2, -0.53, (b.z0 + b.z1) / 2);
    slab.receiveShadow = false;
    this.group.add(slab);
  }

  private buildWalls() {
    const hw = HOUSE.doorWidth / 2;
    const dh = HOUSE.doorHeight;
    const cap = toon(CAP);
    for (const w of this.plan.walls) {
      const doors = this.plan.doors.filter((d) => d.axis === w.axis && d.at === w.at && d.c > w.from && d.c < w.to).sort((a, b) => a.c - b.c);
      const spans: [number, number][] = [];
      let from = w.from - T;
      for (const d of doors) {
        spans.push([from, d.c - hw]);
        from = d.c + hw;
      }
      spans.push([from, w.to + T]);
      const lo = this.wallMat(w.lo), hi = this.wallMat(w.hi), out = toon(OUTSIDE);
      // Box faces: +x, -x, +y, -y, +z, -z.
      const mats = w.axis === 'h' ? [out, out, cap, cap, hi, lo] : [hi, lo, cap, cap, out, out];
      for (const [a, b] of spans) {
        if (b - a < 0.02) continue;
        const mesh = new THREE.Mesh(wallBox(b - a, H, w.axis), mats);
        const c = (a + b) / 2;
        if (w.axis === 'h') mesh.position.set(c, 0, w.at);
        else mesh.position.set(w.at, 0, c);
        mesh.castShadow = mesh.receiveShadow = true;
        ink(mesh);
        this.group.add(mesh);
      }
      for (const d of doors) {
        const mesh = new THREE.Mesh(wallBox(HOUSE.doorWidth, H - dh, w.axis, dh / H, 1), mats);
        if (w.axis === 'h') mesh.position.set(d.c, dh, w.at);
        else mesh.position.set(w.at, dh, d.c);
        mesh.castShadow = true;
        ink(mesh);
        this.group.add(mesh);
      }
    }
  }

  private buildDoors() {
    const hw = HOUSE.doorWidth / 2;
    for (const d of this.plan.doors) {
      if (d.kind === 'arrival') continue;
      const root = new THREE.Group();
      if (d.axis === 'h') root.position.set(d.c, 0, d.at);
      else { root.position.set(d.at, 0, d.c); root.rotation.y = Math.PI / 2; }
      // Frame.
      const frame = toon(0x3a2416);
      for (const s of [-1, 1]) root.add(block(0.1, HOUSE.doorHeight, HOUSE.wallThick + 0.06, frame, s * (hw + 0.02), 0, 0));
      root.add(block(HOUSE.doorWidth + 0.24, 0.1, HOUSE.wallThick + 0.06, frame, 0, HOUSE.doorHeight - 0.02, 0));
      const exit = d.kind === 'exit';
      const leafW = HOUSE.doorWidth - 0.06;
      const leaf = new THREE.Group();
      const wood = exit ? 0x4a2a1a : 0x7a4a2a;
      leaf.add(block(leafW, HOUSE.doorHeight - 0.04, 0.07, wood, leafW / 2, 0, 0));
      if (exit) {
        // Iron bands, studs, a huge keyhole: this door means business.
        for (const y of [0.35, 1.0, 1.65]) leaf.add(block(leafW, 0.1, 0.09, 0x2a2624, leafW / 2, y, 0));
        leaf.add(block(0.22, 0.3, 0.1, 0xc8a040, leafW - 0.22, 0.85, 0));
        leaf.add(block(0.05, 0.12, 0.12, 0x111111, leafW - 0.22, 0.88, 0));
      } else {
        for (const y of [0.25, 1.15]) leaf.add(block(leafW - 0.3, 0.75, 0.085, 0x6a3e22, leafW / 2, y, 0));
        leaf.add(block(0.06, 0.06, 0.12, 0xc8a040, leafW - 0.12, 0.98, 0));
      }
      const pivot = new THREE.Group();
      pivot.position.set(-hw + 0.03, 0, 0);
      pivot.add(leaf);
      ink(root);
      ink(pivot);
      root.add(pivot);
      this.group.add(root);
      const rt: DoorRT = { door: d, pivot, angle: 0, target: 0, opened: false, side: 1, root };
      this.doors.push(rt);
      if (exit) this.exitDoor = rt;
      // The exit glows a little so you can find it once the room is lit.
      if (exit) this.lights.push({ x: d.c, y: 2.2, z: d.at + 0.6, color: 0x9ad0ff, intensity: 3, distance: 4, flicker: 0, room: d.hi });
    }
  }

  /** Swing a door open, away from (x, z). */
  openDoor(rt: DoorRT, x: number, z: number) {
    if (rt.opened) return;
    rt.opened = true;
    const d = rt.door;
    // Which side is the opener on? Swing the other way.
    const side = d.axis === 'h' ? Math.sign(z - d.at) || 1 : Math.sign(x - d.at) || 1;
    rt.target = side * 1.75;
  }

  private buildWindows() {
    for (const w of this.plan.windows) {
      const g = new THREE.Group();
      const x = w.axis === 'h' ? w.c : w.at, z = w.axis === 'h' ? w.at : w.c;
      g.position.set(x, 0, z);
      // Face into the room.
      g.rotation.y = w.axis === 'h' ? (w.inward > 0 ? 0 : Math.PI) : w.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      const off = T + 0.01;
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.15), new THREE.MeshBasicMaterial({ color: 0x1a2a52 }));
      sky.position.set(0, 1.55, off);
      g.add(sky);
      const moon = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), glow(0xf0e8c0, 1.6));
      moon.position.set(0.25, 1.85, off + 0.005);
      g.add(moon);
      const wood = toon(0x4a2e1c);
      g.add(block(1.3, 0.1, 0.14, wood, 0, 0.92, off + 0.04));
      g.add(block(1.3, 0.1, 0.1, wood, 0, 2.12, off + 0.03));
      for (const s of [-1, 1]) g.add(block(0.1, 1.2, 0.1, wood, s * 0.6, 0.98, off + 0.03));
      if (w.open) {
        // Casements flung open.
        for (const s of [-1, 1]) {
          const pane = hinge(s * 0.55, 0.98, off + 0.06, block(0.55, 1.12, 0.04, toonOwn(0x5a7a9a, 0.2), s * 0.28, 0.98, off + 0.06));
          pane.rotation.y = s * 1.2;
          g.add(pane);
        }
      } else {
        g.add(block(0.05, 1.12, 0.05, wood, 0, 0.98, off + 0.03));
        g.add(block(1.1, 0.05, 0.05, wood, 0, 1.53, off + 0.03));
      }
      // Curtains hang from a rod; they billow when the window is open.
      const curtains: THREE.Object3D[] = [];
      const cloth = toon(0x7a2a3a);
      for (const s of [-1, 1]) {
        const c = hinge(s * 0.72, 2.2, off + 0.12, block(0.3, 1.45, 0.06, cloth, s * 0.72, 0.75, off + 0.12));
        g.add(c);
        curtains.push(c);
      }
      g.add(block(1.7, 0.04, 0.04, 0x2a2018, 0, 2.2, off + 0.12));
      ink(g);
      // A patch of moonlight on the floor.
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), new THREE.MeshBasicMaterial({ color: 0x6a88c0, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(0, 0.02, off + 1.1);
      g.add(patch);
      this.group.add(g);
      const inX = w.axis === 'v' ? w.inward : 0, inZ = w.axis === 'h' ? w.inward : 0;
      this.windows.push({ curtains, open: w.open, x, z, phase: Math.random() * 10 });
      this.lights.push({ x: x + inX * 0.8, y: 1.8, z: z + inZ * 0.8, color: 0x8aa8e0, intensity: 2.2, distance: 5, flicker: 0, room: w.room });
    }
  }

  private buildStairs() {
    const [down, up] = stairRects(this.plan);
    const stoneTop = toon(0x5a4a40), stoneSide = toon(0x3a302a);
    const steps = (r: Rect, dir: 1 | -1) => {
      const g = new THREE.Group();
      const w = r.x1 - r.x0;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const z0 = dir < 0 ? r.z1 - 0.45 - i * 0.36 : r.z0 + 0.45 + i * 0.36;
        const y = dir < 0 ? (i + 1) * 0.25 : -(i + 1) * 0.22;
        // Solid steps: up from the floor, or down to the bottom of the stairwell.
        const height = dir < 0 ? y + 0.01 : 1.6 + y;
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.36), [stoneSide, stoneSide, stoneTop, stoneSide, stoneSide, stoneSide]);
        s.position.set((r.x0 + r.x1) / 2, dir < 0 ? height / 2 : y - height / 2, z0 + (dir < 0 ? -0.18 : 0.18));
        s.receiveShadow = true;
        g.add(s);
      }
      // Landing at floor level by the door.
      const land = block(w, 0.02, 0.45, stoneTop, (r.x0 + r.x1) / 2, -0.02, dir < 0 ? r.z1 - 0.225 : r.z0 + 0.225);
      g.add(land);
      // Side walls and the end wall.
      const out = toon(OUTSIDE);
      for (const sx of [r.x0 - 0.1, r.x1 + 0.1]) {
        const wall = new THREE.Mesh(wallBox(r.z1 - r.z0 + 0.2, H + 1.6, 'v'), [out, out, toon(CAP), out, out, out]);
        wall.position.set(sx, -1.6, (r.z0 + r.z1) / 2);
        ink(wall);
        g.add(wall);
      }
      const endZ = dir < 0 ? r.z0 - 0.1 : r.z1 + 0.1;
      const end = new THREE.Mesh(wallBox(r.x1 - r.x0 + 0.4, H + 1.6, 'h'), [out, out, toon(CAP), out, out, out]);
      end.position.set((r.x0 + r.x1) / 2, -1.6, endZ);
      ink(end);
      g.add(end);
      // Down there it's dark; up there there's a light.
      if (dir > 0) {
        const pit = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
        pit.rotation.x = -Math.PI / 2;
        pit.position.set((r.x0 + r.x1) / 2, -0.75, r.z1 - 0.65);
        g.add(pit);
      }
      this.group.add(g);
    };
    steps(down, 1);
    steps(up, -1);
    this.lights.push({ x: (up.x0 + up.x1) / 2, y: 2.4, z: up.z0 + 0.5, color: 0xffd8a0, intensity: 5, distance: 5, flicker: 0, room: -2 });
  }

  /** Height of the ground at (x, z): stairs outside the house, flat floor inside. */
  groundY(x: number, z: number) {
    const [down, up] = stairRects(this.plan);
    if (x > down.x0 - 0.3 && x < down.x1 + 0.3 && z > down.z0) return -Math.min(6, Math.max(0, (z - (down.z0 + 0.45)) / 0.36)) * 0.22;
    if (x > up.x0 - 0.3 && x < up.x1 + 0.3 && z < up.z1) return Math.min(6, Math.max(0, (up.z1 - 0.45 - z) / 0.36)) * 0.25;
    return 0;
  }

  private addOverlay(id: number, r: Rect) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(r.x1 - r.x0 - 0.1, r.z1 - r.z0 - 0.1),
      new THREE.MeshBasicMaterial({ color: 0x050408, transparent: true, opacity: 1, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((r.x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.overlays.set(id, { mesh, fade: 1 });
  }

  /** Lift the darkness off a room. Returns true the first time. */
  reveal(id: number) {
    const o = this.overlays.get(id);
    if (!o || o.fade < 1) return false;
    o.fade = 0.999;
    return true;
  }

  isRevealed(id: number) {
    const o = this.overlays.get(id);
    return !o || o.fade < 1;
  }

  update(dt: number, time: number) {
    for (const rt of this.doors) {
      rt.angle = damp(rt.angle, rt.target, 7, dt);
      rt.pivot.rotation.y = rt.angle;
    }
    for (const w of this.windows) {
      const gust = w.open ? 0.35 + Math.sin(time * 0.7 + w.phase) * 0.25 : 0.03;
      w.curtains.forEach((c, i) => {
        const s = i ? -1 : 1;
        c.rotation.x = -Math.abs(Math.sin(time * 2.3 + w.phase + i)) * gust;
        c.rotation.z = s * Math.sin(time * 1.7 + w.phase) * gust * 0.4;
      });
    }
    for (const [id, o] of this.overlays) {
      if (o.fade >= 1) continue;
      o.fade -= dt * 2.5;
      (o.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, o.fade);
      if (o.fade <= 0) {
        o.mesh.removeFromParent();
        this.overlays.delete(id);
      }
    }
  }

  /** Windows near (x, z) that are open: for wind sounds and blowing leaves. */
  openWindowsNear(x: number, z: number, r: number) {
    return this.windows.filter((w) => w.open && Math.hypot(w.x - x, w.z - z) < r);
  }
}
