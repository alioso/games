// The maze's monster, as drawn: a tall dark slab with a rounded top, all scribbly pencil hatching,
// with one white diamond eye and a slit for a pupil, floating a little off the ground. Beside it, on
// its own, floats its hand: long pointed fingers and a gold ring. Calm, the ring sits on a finger;
// when it notices you, the ring rolls over its fingers, round and round, while it tingles.
import * as THREE from 'three';
import { canvasTex } from '../world/decor';
import { toon, toonOwn } from '../world/toon';

/** Pencil scribbles on dark grey. */
function hatchTex() {
  return canvasTex('hatch', 256, 256, (c) => {
    c.fillStyle = '#3a3a42';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 10 + Math.random() * 26, a = (Math.random() < 0.7 ? 0.9 : -0.6) + (Math.random() - 0.5) * 0.3;
      c.strokeStyle = Math.random() < 0.6 ? 'rgba(20,20,26,0.55)' : 'rgba(110,110,125,0.35)';
      c.lineWidth = 1 + Math.random();
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
  });
}

export class MonsterModel {
  readonly root = new THREE.Group();
  /** The body (it leans and bobs). */
  readonly body = new THREE.Group();
  /** The floating hand (it follows the body a little behind, on a spring). */
  readonly hand = new THREE.Group();
  readonly ring: THREE.Mesh;
  private fingerTips: THREE.Vector3[] = [];
  /** The eye (drawn bright even in the dark, so a stare can be spotted down a corridor). */
  readonly eye = new THREE.Group();
  private pupil: THREE.Mesh;
  private t = 0;
  private handVel = new THREE.Vector3();
  /** How much the ring is spinning (0 calm, 1 tingling). */
  tingle = 0;
  /** In a fight: where the hand should go instead (in the monster's own frame), and the eye's glow. */
  handTarget: THREE.Vector3 | null = null;
  handStiff = 30;
  private eyeWhite!: THREE.MeshBasicMaterial;

  constructor() {
    const hatch = toonOwn(0xffffff, 0, hatchTex());
    // The slab: a rounded-top box (a capsule squashed flat).
    const slab = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 6, 16), hatch);
    slab.scale.set(1, 1, 0.5);
    slab.position.y = 0.86;
    slab.castShadow = true;
    this.body.add(slab);
    // A flat bottom edge, frayed.
    for (let i = 0; i < 6; i++) {
      const frill = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), hatch);
      frill.rotation.x = Math.PI;
      frill.position.set(-0.27 + i * 0.11, 0.38, 0);
      frill.scale.z = 0.6;
      this.body.add(frill);
    }
    // The eye: a white diamond with a dark slit, and darker "cloak" lines down from it.
    const diamond = new THREE.Shape([new THREE.Vector2(0, 0.2), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.2), new THREE.Vector2(-0.17, 0)]);
    this.eyeWhite = new THREE.MeshBasicMaterial({ color: 0xf4f0e8, fog: false });
    const white = new THREE.Mesh(new THREE.ShapeGeometry(diamond), this.eyeWhite);
    this.eye.add(white);
    this.pupil = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: 0x1a1418, fog: false }));
    this.pupil.scale.set(0.55, 2.8, 1);
    this.pupil.position.z = 0.002;
    this.eye.add(this.pupil);
    // (Big, and turned up toward the sky, so it shows from the camera high above.)
    this.eye.position.set(0, 1.38, 0.16);
    this.eye.rotation.x = -0.75;
    this.eye.scale.setScalar(1.5);
    this.body.add(this.eye);
    for (const s of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.55, 0.01), toon(0x1a1a20));
      line.position.set(s * 0.12, 0.98, 0.18);
      line.rotation.z = s * 0.5;
      this.body.add(line);
    }
    this.root.add(this.body);
    // The hand: a dark palm with three long claw fingers, and the ring.
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), hatch);
    palm.scale.set(1.1, 0.8, 0.5);
    this.hand.add(palm);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 6), hatch);
      const x = -0.08 + i * 0.08;
      f.position.set(x, 0.24 + (i === 1 ? 0.05 : 0), 0);
      f.rotation.z = -x * 1.6;
      f.castShadow = true;
      this.hand.add(f);
      this.fingerTips.push(new THREE.Vector3(x * 1.4, 0.3 + (i === 1 ? 0.05 : 0), 0));
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 20), new THREE.MeshToonMaterial({ color: 0xf0c020, emissive: 0x6a4a00 }));
    this.ring.rotation.x = Math.PI / 2;
    this.hand.add(this.ring);
    this.hand.position.set(0.6, 1.0, 0.1);
    this.hand.scale.setScalar(1.7);
    this.root.add(this.hand);
  }

  /** The eye glows (0 normal … 1 blazing purple). */
  setEyeGlow(k: number) {
    this.eyeWhite.color.setRGB(0.96 + k * 0.6, 0.94 - k * 0.3, 0.91 + k * 1.2);
  }

  /** Every material but the eye's (which shines in the dark). */
  get darkParts() {
    const out: THREE.Object3D[] = [];
    this.root.traverse((o) => { if (o instanceof THREE.Mesh && !this.eye.children.includes(o)) out.push(o); });
    return out;
  }

  /** Bob, lean into the way it's going, the hand trailing after, the ring calm or rolling. */
  update(dt: number, speed: number, lookX = 0) {
    this.t += dt;
    const t = this.t;
    this.body.position.y = 0.25 + Math.sin(t * 1.6) * 0.07;
    this.body.rotation.x = -0.12 + Math.min(0.25, speed * 0.06);
    this.body.rotation.z = Math.sin(t * 1.1) * 0.04;
    // The pupil looks a little toward what it's after.
    this.pupil.position.x = Math.max(-0.06, Math.min(0.06, lookX * 0.06));
    // The hand: its spot beside the body, reached by a spring (so it lags and sways).
    const want = this.handTarget ?? new THREE.Vector3(0.75, 1.15 + Math.sin(t * 2.1) * 0.08, 0.15 - Math.min(0.4, speed * 0.1));
    const k = this.handStiff;
    const acc = want.clone().sub(this.hand.position).multiplyScalar(k).addScaledVector(this.handVel, -2.2 * Math.sqrt(k));
    this.handVel.addScaledVector(acc, dt);
    this.hand.position.addScaledVector(this.handVel, dt);
    this.hand.rotation.z = -0.3 + Math.sin(t * 1.3) * 0.15;
    // The ring: on the middle finger when calm; rolling over the fingertips when tingling.
    if (this.tingle > 0.05) {
      const a = t * 9;
      const k = (Math.sin(a) + 1) / 2;
      const p = this.fingerTips[0].clone().lerp(this.fingerTips[2], k);
      p.y += Math.abs(Math.cos(a)) * 0.1;
      this.ring.position.copy(p);
      this.ring.rotation.set(Math.PI / 2 + Math.sin(a * 2) * 0.6, a * 2, 0);
    } else {
      this.ring.position.copy(this.fingerTips[1]).setY(0.2);
      this.ring.rotation.set(Math.PI / 2, 0, 0);
    }
  }
}
