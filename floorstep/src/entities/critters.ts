// Little house animals: mice that scurry off, bats that burst out of wardrobes.
import * as THREE from 'three';
import { ball, block, ink, part, toon } from '../world/toon';

export type CritterKind = 'mouse' | 'bat' | 'spider';

interface Critter {
  kind: CritterKind;
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  t: number;
  life: number;
  wings?: THREE.Object3D[];
}

function makeMouse() {
  const g = new THREE.Group();
  const body = ball(0.11, 0x8a8480, 0, 0.09, 0);
  body.scale.set(0.8, 0.75, 1.3);
  g.add(body);
  g.add(ball(0.06, 0x8a8480, 0, 0.11, 0.14));
  for (const s of [-1, 1]) {
    const ear = part(new THREE.CircleGeometry(0.045, 10), toon(0xe0a0a8), s * 0.05, 0.17, 0.11);
    ear.material = new THREE.MeshToonMaterial({ color: 0xe0a0a8, side: THREE.DoubleSide });
    g.add(ear);
    const e = ball(0.014, 0x111111, s * 0.03, 0.13, 0.19);
    e.userData.noInk = true;
    g.add(e);
  }
  g.add(ball(0.015, 0xe07080, 0, 0.11, 0.2));
  const tail = block(0.012, 0.012, 0.25, 0xd09090, 0, 0.06, -0.24);
  tail.rotation.x = 0.3;
  g.add(tail);
  ink(g);
  return g;
}

function makeBat() {
  const g = new THREE.Group();
  const body = ball(0.08, 0x2a2228);
  body.scale.set(0.9, 1, 1.1);
  g.add(body);
  for (const s of [-1, 1]) {
    const ear = part(new THREE.ConeGeometry(0.025, 0.07, 4), 0x2a2228, s * 0.04, 0.08, 0.02);
    g.add(ear);
    const eye = ball(0.016, 0xff4040, s * 0.03, 0.02, 0.07);
    eye.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2), toneMapped: false });
    g.add(eye);
  }
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(s * 0.3, 0.08);
    shape.lineTo(s * 0.26, -0.04);
    shape.lineTo(s * 0.18, 0.0);
    shape.lineTo(s * 0.12, -0.06);
    shape.lineTo(0, -0.04);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color: 0x3a2e36, side: THREE.DoubleSide }));
    wing.rotation.x = -Math.PI / 2;
    pivot.add(wing);
    g.add(pivot);
    wings.push(pivot);
  }
  ink(g);
  return { g, wings };
}

function makeSpider() {
  const g = new THREE.Group();
  const body = ball(0.07, 0x1a1418);
  body.scale.set(1, 0.85, 1.2);
  g.add(body);
  g.add(ball(0.04, 0x1a1418, 0, 0.02, 0.08));
  for (const s of [-1, 1]) {
    const e = ball(0.012, 0xff3030, s * 0.018, 0.04, 0.11);
    e.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2), toneMapped: false });
    g.add(e);
    for (let i = 0; i < 4; i++) {
      const leg = part(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 3), 0x1a1418, s * 0.09, -0.02, -0.05 + i * 0.035);
      leg.rotation.z = s * 1.1;
      leg.rotation.y = (i - 1.5) * 0.4;
      leg.name = 'leg';
      g.add(leg);
    }
  }
  // The thread it hangs from.
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 3), new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }));
  thread.name = 'thread';
  thread.position.y = 0.5;
  g.add(thread);
  ink(g, 0.004);
  return g;
}

export class Critters {
  readonly group = new THREE.Group();
  private list: Critter[] = [];

  constructor(private solid: (x: number, z: number) => boolean) {}

  /** Spawn one at (x, z), heading away from (fromX, fromZ). */
  spawn(kind: CritterKind, x: number, z: number, fromX: number, fromZ: number) {
    let dx = x - fromX, dz = z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    if (kind === 'spider') {
      const mesh = makeSpider();
      this.group.add(mesh);
      this.list.push({ kind, mesh, x, y: 2.6, z, dx, dz, t: 0, life: 2.8 });
      return;
    }
    if (kind === 'mouse') {
      const mesh = makeMouse();
      this.group.add(mesh);
      this.list.push({ kind, mesh, x, y: 0, z, dx, dz, t: 0, life: 3.2 });
    } else {
      const { g, wings } = makeBat();
      this.group.add(g);
      this.list.push({ kind, mesh: g, x, y: 1.2, z, dx, dz, t: 0, life: 2.8, wings });
    }
  }

  get count() {
    return this.list.length;
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.t += dt;
      if (c.kind === 'spider') {
        // Drops on its thread to dangle right in your face, wiggles, then climbs back up.
        const down = c.t < 0.35 ? 2.6 - (c.t / 0.35) * 1.15 : c.t > 2.2 ? 1.45 + (c.t - 2.2) * 2.5 : 1.45 + Math.sin(c.t * 5) * 0.04;
        c.y = down;
        c.mesh.position.set(c.x, c.y, c.z);
        c.mesh.rotation.y = Math.sin(c.t * 2) * 0.6;
        const thread = c.mesh.getObjectByName('thread')!;
        thread.scale.y = 3 - c.y;
        thread.position.y = (3 - c.y) / 2;
        c.mesh.children.forEach((o) => { if (o.name === 'leg') o.rotation.x = Math.sin(c.t * 20 + o.id) * 0.3; });
      } else if (c.kind === 'mouse') {
        const speed = 4.2;
        // Zig-zag, and turn when something's in the way.
        const wob = Math.sin(c.t * 9) * 0.5;
        let mx = c.dx + -c.dz * wob, mz = c.dz + c.dx * wob;
        const l = Math.hypot(mx, mz);
        mx /= l;
        mz /= l;
        const nx = c.x + mx * speed * dt, nz = c.z + mz * speed * dt;
        if (this.solid(nx, nz)) {
          const a = Math.atan2(c.dz, c.dx) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random());
          c.dx = Math.cos(a);
          c.dz = Math.sin(a);
        } else {
          c.x = nx;
          c.z = nz;
        }
        c.mesh.position.set(c.x, Math.abs(Math.sin(c.t * 22)) * 0.03, c.z);
        c.mesh.rotation.y = Math.atan2(mx, mz);
      } else {
        // Flutter up, swoop about, then off into the dark.
        const up = c.t < 2 ? 0 : (c.t - 2) * 3;
        c.x += (c.dx * 2.6 + Math.sin(c.t * 5) * 1.5) * dt;
        c.z += (c.dz * 2.6 + Math.cos(c.t * 4) * 1.5) * dt;
        c.y = 1.4 + Math.sin(c.t * 7) * 0.25 + up;
        c.mesh.position.set(c.x, c.y, c.z);
        c.mesh.rotation.y = Math.atan2(c.dx, c.dz);
        const flap = Math.sin(c.t * 34) * 0.9;
        c.wings![0].rotation.z = flap;
        c.wings![1].rotation.z = -flap;
      }
      const fade = Math.min(1, (c.life - c.t) / 0.3);
      c.mesh.scale.setScalar(Math.max(0.001, fade));
      if (c.t >= c.life) {
        c.mesh.removeFromParent();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const c of this.list) c.mesh.removeFromParent();
    this.list = [];
  }
}
