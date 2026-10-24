import * as THREE from 'three';
import { rand } from '@engine/math';
import type { Particles } from '@engine/particles';
import type { LiquidKind } from '../data/arenas';
import { SFX } from '../data/sounds';
import type { Terrain } from './terrain';

// What lives in the liquids, and what happens when you fall in:
// piranhas (pond), crocodiles (river), sharks (sea), and lava just burns.

const Y = 0.03;

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true, ...extra });

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

const WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000 });

function eye(size: number) {
  const e = part(new THREE.SphereGeometry(size, 8, 6), WHITE);
  e.add(part(new THREE.SphereGeometry(size * 0.55, 6, 4), BLACK, 0, 0, size * 0.6));
  return e;
}

function makePiranha() {
  const g = new THREE.Group();
  const back = mat(0x55636b, { metalness: 0.3 });
  const body = part(new THREE.SphereGeometry(0.3, 10, 8), back);
  body.scale.set(0.55, 0.85, 1);
  g.add(body);
  const jaw = part(new THREE.SphereGeometry(0.24, 10, 8), mat(0xe0392b), 0, -0.1, 0.08);
  jaw.scale.set(0.5, 0.6, 0.9);
  g.add(jaw);
  for (let i = 0; i < 4; i++) {
    const t = part(new THREE.ConeGeometry(0.03, 0.08, 4), WHITE, -0.07 + i * 0.045, -0.02, 0.27);
    t.rotation.x = Math.PI;
    g.add(t);
  }
  for (const s of [-1, 1]) {
    const e = eye(0.06);
    e.position.set(s * 0.14, 0.08, 0.15);
    g.add(e);
  }
  const tail = part(new THREE.ConeGeometry(0.2, 0.3, 4), back, 0, 0, -0.38);
  tail.scale.set(0.25, 1, 1);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  g.scale.setScalar(1.6);
  return g;
}

/** Crocodile head: upper and lower jaws on hinges, pointing along +z. */
function makeCroc() {
  const g = new THREE.Group();
  const green = mat(0x4e7a3a);
  const belly = mat(0xc8c08a);
  const upper = new THREE.Group();
  const top = part(new THREE.BoxGeometry(0.7, 0.22, 1.5), green, 0, 0.11, 0.75);
  upper.add(top);
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const t = part(new THREE.ConeGeometry(0.04, 0.12, 4), WHITE, s * 0.3, -0.04, 0.3 + i * 0.22);
      t.rotation.x = Math.PI;
      upper.add(t);
    }
  }
  for (const s of [-1, 1]) {
    const e = eye(0.1);
    e.position.set(s * 0.22, 0.3, 0.15);
    upper.add(e);
    upper.add(part(new THREE.SphereGeometry(0.05, 6, 4), mat(0x2e4a22), s * 0.12, 0.24, 1.45));
  }
  const lower = new THREE.Group();
  lower.add(part(new THREE.BoxGeometry(0.62, 0.16, 1.4), belly, 0, -0.08, 0.7));
  g.add(upper, lower);
  g.userData = { upper, lower };
  return g;
}

function makeShark() {
  const g = new THREE.Group();
  const grey = mat(0x7a8a99, { metalness: 0.2 });
  const body = part(new THREE.SphereGeometry(0.6, 12, 10), grey);
  body.scale.set(0.8, 0.8, 2);
  g.add(body);
  const fin = part(new THREE.ConeGeometry(0.3, 0.8, 4), grey, 0, 0.75, -0.1);
  fin.scale.set(0.2, 1, 1);
  g.add(fin);
  const tail = part(new THREE.ConeGeometry(0.45, 0.8, 4), grey, 0, 0.1, -1.4);
  tail.scale.set(0.15, 1, 1);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  g.add(tail);
  // Open mouth with teeth.
  const mouth = part(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a1020 }), 0, -0.1, 1.05);
  mouth.scale.set(1, 0.7, 0.4);
  g.add(mouth);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = part(new THREE.ConeGeometry(0.05, 0.14, 4), WHITE, Math.cos(a) * 0.36, -0.1 + Math.sin(a) * 0.24, 1.1);
    t.rotation.z = a + Math.PI / 2;
    g.add(t);
  }
  for (const s of [-1, 1]) {
    const e = eye(0.08);
    e.position.set(s * 0.42, 0.18, 0.75);
    g.add(e);
  }
  return g;
}

interface Wanderer {
  kind: LiquidKind;
  mesh: THREE.Object3D;
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  phase: number;
}

interface Attack {
  kind: LiquidKind;
  mesh: THREE.Object3D;
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  t: number;
  dur: number;
  color: number;
  bitten: boolean;
}

export class Critters {
  readonly group = new THREE.Group();
  private wanderers: Wanderer[] = [];
  private attacks: Attack[] = [];
  private pending: { at: number; kind: LiquidKind; x: number; z: number; color: number }[] = [];
  private pool = new Map<LiquidKind, THREE.Object3D[]>();
  private time = 0;
  private bubbleT = 0;

  constructor(private terrain: Terrain, private particles: Particles, private glow: Particles) {
    const kinds = new Set<LiquidKind>(terrain.def.liquids.map((l) => l.kind));
    if (terrain.def.shore) kinds.add('sea');
    const finGeo = new THREE.ConeGeometry(0.14, 0.32, 3).scale(0.35, 1, 1);
    for (const kind of kinds) {
      const count = kind === 'pond' ? 4 : kind === 'river' ? 3 : kind === 'sea' ? 4 : 0;
      for (let i = 0; i < count; i++) {
        let mesh: THREE.Object3D;
        if (kind === 'pond') mesh = new THREE.Mesh(finGeo, mat(0x3d474d));
        else if (kind === 'sea') {
          mesh = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 3).scale(0.25, 1, 1.4), mat(0x6f7f8e));
        } else {
          // Croc eyes and nostrils just above the surface.
          const g = new THREE.Group();
          for (const s of [-1, 1]) {
            const e = eye(0.1);
            e.position.set(s * 0.22, 0.05, 0);
            g.add(e, part(new THREE.SphereGeometry(0.06, 6, 4), mat(0x3b5e2b), s * 0.12, 0.02, 1.2));
          }
          g.add(part(new THREE.BoxGeometry(0.62, 0.06, 1.3), mat(0x3b5e2b), 0, -0.02, 0.6));
          mesh = g;
        }
        this.group.add(mesh);
        const p = this.randomSpot(kind) ?? { x: 0, z: 0 };
        this.wanderers.push({ kind, mesh, x: p.x, z: p.z, tx: p.x, tz: p.z, speed: kind === 'sea' ? 1.6 : kind === 'river' ? 0.5 : 1.2, phase: Math.random() * 6 });
      }
      const n = kind === 'pond' ? 8 : kind === 'lava' ? 0 : 2;
      const list: THREE.Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const m = kind === 'pond' ? makePiranha() : kind === 'river' ? makeCroc() : makeShark();
        m.visible = false;
        this.group.add(m);
        list.push(m);
      }
      this.pool.set(kind, list);
    }
  }

  /** A random spot inside a liquid of this kind (near the beach for the sea). */
  private randomSpot(kind: LiquidKind) {
    const { halfW, halfD } = this.terrain.def;
    for (let i = 0; i < 300; i++) {
      const x = rand(-halfW, halfW), z = rand(-halfD, halfD + 3);
      if (this.terrain.liquidAt(x, z, 0.6) !== kind || this.terrain.onBridge(x, z, 0.5)) continue;
      if (kind === 'sea' && this.terrain.def.shore && z > this.terrain.shoreZ(x) + 4) continue;
      return { x, z };
    }
    return null;
  }

  /** Something fell in at (x, z): the locals react. */
  feed(kind: LiquidKind, x: number, z: number, color: number, sound: boolean) {
    if (kind === 'lava') {
      if (sound) SFX.sizzle();
      this.glow.burst({ x, y: 0.4, z, count: 40, color: 0xff7a20, intensity: 3, speed: 3, up: 6, size: 0.16, life: 0.9, gravity: 2 });
      this.particles.burst({ x, y: 0.6, z, count: 20, color: 0x333333, speed: 1, up: 3, size: 0.35, life: 1.6, gravity: -1.5 });
      return;
    }
    if (sound) {
      SFX.splash();
      if (kind === 'pond') SFX.chomp();
      else if (kind === 'river') SFX.snap();
      else SFX.shark();
    }
    this.particles.burst({ x, y: 0.2, z, count: 30, color: 0xe8fbff, speed: 3, up: 6, size: 0.14, life: 0.9 });
    const count = kind === 'pond' ? 7 : 1;
    for (let i = 0; i < count; i++) this.pending.push({ at: this.time + i * 0.16, kind, x, z, color });
  }

  update(dt: number) {
    this.time += dt;

    // Idle wandering.
    for (const w of this.wanderers) {
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        const p = this.randomSpot(w.kind);
        if (p) { w.tx = p.x; w.tz = p.z; }
      } else {
        const nx = w.x + (dx / d) * w.speed * dt, nz = w.z + (dz / d) * w.speed * dt;
        // Stay in the water (the tide can strand a shark: then it picks somewhere else).
        if (this.terrain.liquidAt(nx, nz, 0.3) === w.kind) { w.x = nx; w.z = nz; }
        else { const p = this.randomSpot(w.kind); if (p) { w.tx = p.x; w.tz = p.z; } }
      }
      const bob = Math.sin(this.time * 2 + w.phase);
      w.mesh.position.set(w.x, Y + (w.kind === 'river' ? 0.02 + bob * 0.02 : 0.12 + bob * 0.04), w.z);
      w.mesh.rotation.y = Math.atan2(dx, dz);
      w.mesh.visible = this.terrain.liquidAt(w.x, w.z, 0.2) === w.kind;
    }

    // Lava bubbles.
    if (this.terrain.def.edge === 'lava' || this.terrain.def.liquids.some((l) => l.kind === 'lava')) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.12;
        const p = this.randomSpot('lava');
        if (p) this.glow.burst({ x: p.x, y: 0.05, z: p.z, count: 3, color: 0xff8a2a, intensity: 2.5, speed: 0.6, up: 2.5, size: 0.12, life: 0.6, gravity: 5 });
      }
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > this.time) continue;
      this.pending.splice(i, 1);
      const mesh = this.pool.get(p.kind)?.find((m) => !m.visible);
      if (!mesh) continue;
      const a = Math.random() * Math.PI * 2;
      const r = p.kind === 'pond' ? 1.6 : p.kind === 'sea' ? 2.5 : 0;
      mesh.visible = true;
      this.attacks.push({
        kind: p.kind, mesh, x: p.x, z: p.z, fromX: p.x + Math.cos(a) * r, fromZ: p.z + Math.sin(a) * r,
        t: 0, dur: p.kind === 'pond' ? 0.66 : p.kind === 'river' ? 1.3 : 1.1, color: p.color, bitten: false,
      });
    }

    for (let i = this.attacks.length - 1; i >= 0; i--) {
      const a = this.attacks[i];
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        a.mesh.visible = false;
        this.attacks.splice(i, 1);
        this.particles.burst({ x: a.x, y: 0.1, z: a.z, count: 10, color: 0xe8fbff, speed: 2, up: 3, size: 0.1 });
        continue;
      }
      const m = a.mesh;
      if (a.kind === 'pond') {
        // Leap in, bite, dive past.
        const s = k * 1.6;
        m.position.set(a.fromX + (a.x - a.fromX) * s, -0.3 + Math.sin(k * Math.PI) * 1.2, a.fromZ + (a.z - a.fromZ) * s);
        m.rotation.set(0, Math.atan2(a.x - a.fromX, a.z - a.fromZ), 0);
        m.rotateX(-Math.cos(k * Math.PI) * 0.9);
        if (!a.bitten && s >= 1) { a.bitten = true; this.bite(a); }
      } else if (a.kind === 'river') {
        // Jaws burst up, snap twice, sink.
        const { upper, lower } = m.userData as { upper: THREE.Object3D; lower: THREE.Object3D };
        const rise = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        m.position.set(a.x, -0.6 + rise * 0.8, a.z - 0.8);
        m.rotation.set(-0.5 * rise, 0, 0);
        const snap = Math.abs(Math.sin(k * Math.PI * 3));
        upper.rotation.x = -snap * 0.9;
        lower.rotation.x = snap * 0.35;
        if (!a.bitten && k > 0.3) { a.bitten = true; this.bite(a); }
      } else {
        // Shark leaps out over the victim, mouth first.
        const x = a.fromX + (a.x - a.fromX) * k * 1.4, z = a.fromZ + (a.z - a.fromZ) * k * 1.4;
        m.position.set(x, -0.8 + Math.sin(k * Math.PI) * 2.0, z);
        m.rotation.set(0, Math.atan2(a.x - a.fromX, a.z - a.fromZ), 0);
        m.rotateX(-Math.cos(k * Math.PI) * 0.8);
        if (!a.bitten && k > 0.5) { a.bitten = true; this.bite(a); }
      }
    }
  }

  private bite(a: Attack) {
    this.particles.burst({ x: a.x, y: 0.5, z: a.z, count: 8, color: a.color, speed: 2.5, up: 4, size: 0.16 });
  }

  clear() {
    this.pending.length = 0;
    for (const a of this.attacks) a.mesh.visible = false;
    this.attacks.length = 0;
  }
}
