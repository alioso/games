// The house cat: naps on beds and sofas, purrs if you pet it, hisses and bolts if you startle it.
import * as THREE from 'three';
import { ball, ink, part } from '../world/toon';

export class Cat {
  readonly root = new THREE.Group();
  readonly headTop = new THREE.Object3D();
  state: 'sleep' | 'startled' | 'run' | 'gone' | 'purr' = 'sleep';
  x: number;
  z: number;
  y: number;
  private t = 0;
  private dx = 0;
  private dz = 0;
  private body: THREE.Group;
  private legs: THREE.Object3D[] = [];
  private tail: THREE.Group;
  private head: THREE.Group;
  petted = false;

  constructor(x: number, y: number, z: number, yaw: number, private solid: (x: number, z: number) => boolean) {
    this.x = x;
    this.y = y;
    this.z = z;
    const fur = 0xd88a3a, stripe = 0xa85a20, belly = 0xf4e0c0;
    this.body = new THREE.Group();
    const torso = ball(0.16, fur);
    torso.scale.set(0.85, 0.75, 1.35);
    this.body.add(torso);
    for (let i = 0; i < 3; i++) {
      const s = part(new THREE.TorusGeometry(0.13, 0.015, 4, 12, Math.PI), stripe, 0, 0.02, -0.1 + i * 0.1);
      s.rotation.y = Math.PI / 2;
      this.body.add(s);
    }
    this.head = new THREE.Group();
    this.head.position.set(0, 0.06, 0.22);
    const skull = ball(0.1, fur);
    skull.scale.set(1.1, 0.95, 1);
    this.head.add(skull);
    this.head.add(ball(0.04, belly, 0, -0.03, 0.08));
    this.head.add(ball(0.015, 0xd06070, 0, 0.0, 0.1));
    for (const s of [-1, 1]) {
      this.head.add(part(new THREE.ConeGeometry(0.04, 0.08, 4), fur, s * 0.06, 0.09, -0.01).rotateZ(-s * 0.3));
      // Closed, smug, sleeping eyes (a line), or open ones when awake.
      const eye = part(new THREE.BoxGeometry(0.035, 0.008, 0.01), 0x14100e, s * 0.04, 0.02, 0.09);
      eye.userData.noInk = true;
      eye.name = 'eye';
      this.head.add(eye);
    }
    this.body.add(this.head);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = part(new THREE.CylinderGeometry(0.025, 0.02, 0.16, 6), fur, sx * 0.07, -0.12, sz * 0.12);
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.02, -0.2);
    const t = part(new THREE.CapsuleGeometry(0.025, 0.25, 3, 6), fur);
    t.rotation.x = Math.PI / 2;
    t.position.z = -0.14;
    this.tail.add(t);
    this.body.add(this.tail);
    this.headTop.position.set(0, 0.35, 0.1);
    this.body.add(this.headTop);
    this.root.add(this.body);
    this.root.rotation.y = yaw;
    ink(this.root);
    this.root.position.set(x, y, z);
  }

  /** Startled awake: hiss, then bolt away from (fromX, fromZ). */
  startle(fromX: number, fromZ: number) {
    if (this.state !== 'sleep' && this.state !== 'purr') return false;
    this.state = 'startled';
    this.t = 0;
    const dx = this.x - fromX, dz = this.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dx = dx / l;
    this.dz = dz / l;
    this.root.rotation.y = Math.atan2(-this.dx, -this.dz);
    return true;
  }

  pet() {
    this.state = 'purr';
    this.petted = true;
    this.t = 0;
  }

  update(dt: number, time: number) {
    this.t += dt;
    const sleeping = this.state === 'sleep' || this.state === 'purr';
    for (const l of this.legs) l.visible = !sleeping;
    // Curled up asleep, breathing; purring makes it vibrate happily.
    if (sleeping) {
      const b = Math.sin(time * 1.6) * 0.03 + (this.state === 'purr' ? Math.sin(time * 60) * 0.01 : 0);
      this.body.scale.set(1 + b, 0.85 - b, 1);
      this.body.position.y = 0.1;
      this.tail.rotation.y = 1.8 + Math.sin(time * 0.8) * 0.1;
      this.head.rotation.set(0.3, 0.6, 0);
      if (this.state === 'purr' && this.t > 3) this.state = 'sleep';
    } else if (this.state === 'startled') {
      // Arched back, fur up, tail straight up!
      this.body.scale.set(1, 1.15, 0.9);
      this.body.position.y = 0.2 + Math.sin(Math.min(1, this.t * 4) * Math.PI) * 0.25;
      this.tail.rotation.set(-1.4, 0, 0);
      this.head.rotation.set(-0.2, 0, 0);
      this.y = Math.max(0, this.y - dt * 2);
      if (this.t > 0.6) { this.state = 'run'; this.t = 0; this.root.rotation.y = Math.atan2(this.dx, this.dz); }
    } else if (this.state === 'run') {
      const nx = this.x + this.dx * 3.4 * dt, nz = this.z + this.dz * 3.4 * dt;
      if (this.solid(nx, nz)) {
        const a = Math.atan2(this.dz, this.dx) + (Math.random() < 0.5 ? 1 : -1) * 1.6;
        this.dx = Math.cos(a);
        this.dz = Math.sin(a);
        this.root.rotation.y = Math.atan2(this.dx, this.dz);
      } else {
        this.x = nx;
        this.z = nz;
      }
      this.y = Math.max(0, this.y - dt * 3);
      this.body.scale.set(1, 1, 1.1);
      this.body.position.y = 0.16 + Math.abs(Math.sin(this.t * 18)) * 0.05;
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * 18 + (i % 2) * Math.PI) * 0.8));
      this.tail.rotation.set(-0.4, Math.sin(this.t * 10) * 0.3, 0);
      this.head.rotation.set(0, 0, 0);
      const fade = Math.max(0, 1 - (this.t - 2.2) / 0.4);
      this.root.scale.setScalar(Math.max(0.001, fade));
      if (this.t > 2.6) { this.state = 'gone'; this.root.visible = false; }
    }
    for (const c of this.head.children) if (c.name === 'eye') c.scale.y = sleeping ? 1 : 3;
    this.root.position.set(this.x, this.y, this.z);
  }
}
