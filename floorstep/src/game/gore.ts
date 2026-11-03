// Cartoon blood: splats that stay on the floor, red droplets, and bits that fly off and bounce.
import * as THREE from 'three';
import type { Particles } from '@engine/particles';
import { applySection } from '../world/toon';

const SPLAT_SHAPES = 6;
let splatTextures: THREE.CanvasTexture[] | null = null;

/** A few hand-drawn splat shapes: a blob with droplets around it. */
function textures() {
  if (splatTextures) return splatTextures;
  splatTextures = [];
  for (let n = 0; n < SPLAT_SHAPES; n++) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#b01818';
    g.strokeStyle = '#3a0606';
    g.lineWidth = 3;
    g.beginPath();
    const r0 = 30 + n * 3;
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = r0 * (0.75 + 0.35 * Math.abs(Math.sin(a * (2 + n) + n)));
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(64 + Math.cos(a - 0.2) * r * 1.15, 64 + Math.sin(a - 0.2) * r * 1.15, x, y);
    }
    g.fill();
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + n;
      const d = r0 + 10 + ((i * 13 + n * 7) % 18);
      const r = 3 + ((i * 5 + n) % 5);
      g.beginPath();
      g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7);
      g.fill();
      g.stroke();
    }
    // A shine.
    g.fillStyle = 'rgba(255,180,180,0.5)';
    g.beginPath();
    g.ellipse(52, 52, 8, 4, -0.6, 0, 7);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    splatTextures.push(t);
  }
  return splatTextures;
}

interface Bit {
  obj: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  spin: THREE.Vector3;
  life: number;
  resting: boolean;
}

export class Gore {
  readonly group = new THREE.Group();
  private splats: THREE.Mesh[] = [];
  private bits: Bit[] = [];
  private mats: THREE.MeshToonMaterial[];

  constructor(private particles: Particles) {
    this.mats = textures().map((map) => {
      const m = new THREE.MeshToonMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      return m;
    });
  }

  /** A splat on the floor that stays for the rest of the floor. */
  splat(x: number, z: number, size = 0.6) {
    const mat = this.mats[Math.floor(Math.random() * this.mats.length)];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    m.position.set(x, 0.012 + this.splats.length * 0.0003, z);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.group.add(m);
    this.splats.push(m);
    // Keep it bounded: the oldest dry up.
    if (this.splats.length > 120) {
      const old = this.splats.shift()!;
      old.removeFromParent();
      old.geometry.dispose();
    }
  }

  /** A crack in the floorboards (something is digging underneath). */
  crack(x: number, z: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.85, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    m.position.set(x, 0.015, z);
    this.group.add(m);
    this.splats.push(m);
  }

  /** Blood flying from a hit at height y, in direction (dx, dz). */
  spray(x: number, y: number, z: number, dx: number, dz: number, amount = 1) {
    this.particles.burst({ x, y, z, count: Math.round(10 * amount), color: 0xc01818, speed: 3.5, up: 2.5, size: 0.06, life: 0.7, dirX: dx, dirZ: dz, spread: 1.4 });
    const n = Math.max(1, Math.round(amount * 1.5));
    for (let i = 0; i < n; i++) {
      const d = 0.3 + Math.random() * 0.8;
      this.splat(x + dx * d + (Math.random() - 0.5) * 0.4, z + dz * d + (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.45 * amount);
    }
  }

  /** Send a body part (already in world space) flying; it bounces and stays on the floor. */
  fling(obj: THREE.Object3D, dx: number, dz: number) {
    applySection(obj);
    this.group.add(obj);
    const s = 2 + Math.random() * 2;
    this.bits.push({ obj, vx: dx * s, vy: 3 + Math.random() * 2, vz: dz * s, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 0, resting: false });
  }

  update(dt: number) {
    for (const b of this.bits) {
      if (b.resting) continue;
      b.life += dt;
      b.vy -= 14 * dt;
      b.obj.position.x += b.vx * dt;
      b.obj.position.y += b.vy * dt;
      b.obj.position.z += b.vz * dt;
      b.obj.rotation.x += b.spin.x * dt;
      b.obj.rotation.y += b.spin.y * dt;
      b.obj.rotation.z += b.spin.z * dt;
      // Leave a little trail of drops.
      if (Math.random() < dt * 20) this.particles.burst({ x: b.obj.position.x, y: b.obj.position.y, z: b.obj.position.z, count: 1, color: 0xc01818, speed: 0.3, up: 0, size: 0.04, life: 0.5 });
      if (b.obj.position.y < 0.04) {
        b.obj.position.y = 0.04;
        if (Math.abs(b.vy) < 1.5) {
          b.resting = true;
          this.splat(b.obj.position.x, b.obj.position.z, 0.35);
        }
        b.vy *= -0.4;
        b.vx *= 0.5;
        b.vz *= 0.5;
        b.spin.multiplyScalar(0.5);
      }
    }
  }
}
