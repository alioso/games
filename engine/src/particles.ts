import * as THREE from 'three';

export interface BurstOpts {
  x: number;
  y: number;
  z: number;
  count: number;
  color: THREE.ColorRepresentation;
  /** Multiplies the colour; above 1 makes particles glow through the bloom pass. */
  intensity?: number;
  speed?: number;
  /** Extra upward kick. */
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  /** Spread direction: cone around (dx, dz) when given, otherwise all around. */
  dirX?: number;
  dirZ?: number;
  spread?: number;
}

/** Pooled cube particles drawn as a single InstancedMesh. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private spin: Float32Array;
  private next = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(private capacity = 1500, glow = false) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = glow
      ? new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !glow;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, this.color.set(0xffffff));
    this.hideAll();
  }

  private hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  burst(o: BurstOpts) {
    this.color.set(o.color).multiplyScalar(o.intensity ?? 1);
    const speed = o.speed ?? 4;
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      let a = Math.random() * Math.PI * 2;
      if (o.dirX !== undefined && o.dirZ !== undefined) {
        a = Math.atan2(o.dirZ, o.dirX) + (Math.random() - 0.5) * (o.spread ?? 0.8);
      }
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = o.x;
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = (o.up ?? 3) * (0.5 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      const l = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = (o.size ?? 0.18) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.gravity ?? 14;
      this.spin[i] = (Math.random() - 0.5) * 12;
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    const d = this.dummy;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[k + 1] = 0.05;
        this.vel[k + 1] *= -0.35;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
      }
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      d.position.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      d.rotation.set(this.spin[i] * t, this.spin[i] * t * 0.7, 0);
      d.scale.setScalar(this.size[i] * Math.min(1, t * 2.5));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.hideAll();
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
