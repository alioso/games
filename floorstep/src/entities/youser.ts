// Youser, the baby bunny at the top of the house: tiny, round, a bit scruffy too (one ear up, one
// flopped over, a knitted scarf that's too long), and very, very happy to be rescued.
import * as THREE from 'three';
import { ball, block, ink, part } from '../world/toon';
import { Springs } from './springs';

export class Youser {
  readonly root = new THREE.Group();
  readonly headTop = new THREE.Object3D();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private ears: THREE.Group[] = [];
  private feet: THREE.Object3D[] = [];
  private sp = new Springs();
  readonly cage = new THREE.Group();
  private bars: THREE.Object3D[] = [];

  constructor() {
    const fur = 0xece2d4, inner = 0xe8a8b0, scarf = 0xc83a3a;
    const torso = ball(0.13, fur, 0, 0.13, 0);
    torso.scale.set(1, 1.05, 0.95);
    this.body.add(torso);
    this.body.add(ball(0.07, 0xf8f2ea, 0, 0.11, 0.08));
    this.body.add(ball(0.05, 0xffffff, 0, 0.1, -0.12));
    for (const s of [-1, 1]) {
      const foot = ball(0.05, fur, s * 0.06, 0.02, 0.07);
      foot.scale.set(0.8, 0.6, 1.4);
      this.body.add(foot);
      this.feet.push(foot);
    }
    // The scarf: a ring and a long tail flapping behind.
    this.body.add(part(new THREE.TorusGeometry(0.075, 0.025, 6, 14), scarf, 0, 0.23, 0).rotateX(Math.PI / 2));
    const tail = block(0.05, 0.16, 0.02, scarf, 0.05, 0.08, -0.08);
    tail.rotation.z = -0.3;
    this.body.add(tail);
    this.head.position.y = 0.32;
    const skull = ball(0.11, fur);
    skull.scale.set(1.08, 0.98, 1);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      // Big dark eyes with a shine.
      this.head.add(ball(0.033, 0x1a1210, s * 0.045, 0.01, 0.085));
      const shine = ball(0.01, 0xffffff, s * 0.045 + 0.01, 0.025, 0.115);
      shine.userData.noInk = true;
      this.head.add(shine);
      const cheek = ball(0.022, 0xf0a0a0, s * 0.07, -0.04, 0.07);
      cheek.scale.z = 0.4;
      cheek.userData.noInk = true;
      this.head.add(cheek);
      const ear = new THREE.Group();
      ear.position.set(s * 0.045, 0.08, -0.01);
      const e = ball(0.04, fur, 0, 0.12, 0);
      e.scale.set(0.8, 3, 0.5);
      ear.add(e);
      const ei = ball(0.025, inner, 0, 0.12, 0.012);
      ei.scale.set(0.7, 2.6, 0.3);
      ei.userData.noInk = true;
      ear.add(ei);
      // One ear always flops over.
      ear.rotation.z = s > 0 ? -1.2 : 0.1;
      this.head.add(ear);
      this.ears.push(ear);
    }
    this.head.add(ball(0.016, 0xd06070, 0, -0.02, 0.105));
    this.head.add(block(0.022, 0.025, 0.01, 0xffffff, 0, -0.065, 0.098));
    this.headTop.position.y = 0.3;
    this.head.add(this.headTop);
    this.body.add(this.head);
    this.root.add(this.body);
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    ink(this.root);

    // A rusty little cage around it.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bar = part(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), 0x5a5a5a, Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3);
      this.cage.add(bar);
      this.bars.push(bar);
    }
    this.cage.add(part(new THREE.TorusGeometry(0.3, 0.02, 4, 20), 0x5a5a5a, 0, 0.7, 0).rotateX(Math.PI / 2));
    this.cage.add(part(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 20), 0x4a3a2a, 0, 0.02, 0));
    this.cage.add(part(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a5a5a, 0, 0.7, 0));
    ink(this.cage);

    this.sp.add('body', this.body, 18, 0.4);
    this.sp.add('head', this.head, 10, 0.3);
    this.ears.forEach((e, i) => this.sp.add(`ear${i}`, e, 7, 0.25));
  }

  /** Lift the cage (0 → closed, 1 → gone). */
  openCage(k: number) {
    this.cage.position.y = k * 1.4;
    this.cage.rotation.y = k * 0.6;
    this.cage.visible = k < 0.99;
  }

  /**
   * @param hop 0..1 progress through a hop (0 when standing)
   * @param mood 'sad' in the cage, 'happy' once free
   */
  animate(dt: number, t: number, hop: number, mood: 'sad' | 'happy') {
    this.sp.begin();
    if (hop > 0) {
      // Bunny hop: squash, stretch, ears trail behind.
      const s = Math.sin(hop * Math.PI);
      this.sp.pos('body', 0, s * 0.25, 0);
      this.sp.rot('body', -0.3 * s);
      this.sp.rot('ear0', -0.8 * s);
      this.sp.rot('ear1', -0.8 * s);
      this.body.scale.set(1 - 0.1 * s, 1 + 0.2 * s, 1);
    } else if (mood === 'sad') {
      // Huddled, shivering a little, looking up hopefully now and then.
      this.sp.rot('head', 0.35 + Math.sin(t * 0.7) * 0.15, Math.sin(t * 0.5) * 0.3);
      this.sp.pos('body', Math.sin(t * 40) * 0.003);
      this.body.scale.set(1.05, 0.95, 1);
    } else {
      // Bouncing with joy.
      this.sp.pos('body', 0, Math.abs(Math.sin(t * 9)) * 0.08);
      this.sp.rot('head', -0.2, Math.sin(t * 4) * 0.3);
      this.sp.rot('ear0', Math.sin(t * 9) * 0.3);
      this.body.scale.set(1, 1, 1);
    }
    this.sp.step(dt);
  }
}
