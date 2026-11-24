// You, in the maze: one of the heroes (or Youser) walking, creeping, or holding the wand up high. The
// wand is a plain wooden stick until the ruby wakes it: then its tip is a glowing red jewel, with a
// little light of its own and sparkles now and then.
import * as THREE from 'three';
import type { Character } from '../data/characters';
import { buildHero, type HeroRig, type Pose } from './heroModel';
import { Youser } from './youser';
import { cyl, glow, toon } from '../world/toon';

export type WalkerPose = 'walk' | 'raise' | 'cheer' | 'hurt';

export class Walker {
  readonly root = new THREE.Group();
  private rig: HeroRig | null = null;
  private youser: Youser | null = null;
  readonly wand = new THREE.Group();
  /** The wand's tip (where magic comes from). */
  readonly tip = new THREE.Object3D();
  private jewel: THREE.Mesh;
  private stickTip: THREE.Mesh;
  readonly light = new THREE.PointLight(0xff4060, 0, 3.5, 1.5);
  private t = 0;
  private hop = 0;
  private pose: WalkerPose = 'walk';
  private poseT = 0;
  yaw = 0;
  powered = false;

  constructor(readonly character: Character) {
    // The wand: a knobbly stick.
    const stick = cyl(0.016, 0.022, 0.46, toon(0x7a5230), 0, 0, 0, 6);
    this.wand.add(stick);
    this.stickTip = cyl(0.026, 0.02, 0.04, toon(0x5a3a20), 0, 0.45, 0, 6);
    this.wand.add(this.stickTip);
    this.jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), glow(0xff3050, 2.4));
    this.jewel.position.y = 0.5;
    this.jewel.scale.y = 1.4;
    this.jewel.visible = false;
    this.wand.add(this.jewel);
    this.tip.position.y = 0.5;
    this.wand.add(this.tip);
    this.light.position.y = 0.55;
    this.wand.add(this.light);
    if (character.kind === 'hero') {
      this.rig = buildHero(character.look, { noWeapon: true });
      this.root.add(this.rig.root);
      this.wand.rotation.x = 0.9;
      this.rig.hand.add(this.wand);
    } else {
      this.youser = new Youser();
      this.root.add(this.youser.root);
      this.wand.position.set(0.1, 0.17, 0.1);
      this.wand.rotation.x = 0.7;
      this.wand.scale.setScalar(0.7);
      this.youser.root.add(this.wand);
    }
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  }

  /** Ouch: a flinch for a moment. */
  flinch() {
    this.setPose('hurt');
    this.flinchT = 0.45;
  }
  private flinchT = 0;

  /** The ruby's power goes into the wand. */
  power() {
    this.powered = true;
    this.jewel.visible = true;
    this.stickTip.visible = false;
  }

  setPose(p: WalkerPose) {
    if (p !== this.pose) { this.pose = p; this.poseT = 0; }
  }

  /** Where the wand's tip is in the world. */
  tipWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.tip.getWorldPosition(out);
  }

  /**
   * In a fight: a fight pose (an attack's progress p, 0..1, with the hit at `hit`), the body lifted by
   * `lift` (jumping). Youser has no fighting poses: it hops, squats and swings its wand instead.
   */
  fightPose(dt: number, pose: Pose, p = 0, hit = 0.35, lift = 0, speed = 0) {
    this.t += dt;
    this.root.rotation.y = this.yaw;
    if (this.powered) {
      this.jewel.rotation.y += dt * 3;
      this.light.intensity = 2.2 + Math.sin(this.t * 5) * 0.4;
    }
    if (this.rig) {
      this.rig.animate(dt, pose, { speed, stride: speed * dt * 3, turn: 0 }, this.t, p, hit);
    } else if (this.youser) {
      if (speed > 0.02) this.hop = (this.hop + dt * 3) % 1;
      const crouch = pose === 'crouch' || pose === 'crouchblock';
      this.youser.root.scale.set(1, crouch ? 0.7 : 1, 1);
      this.youser.animate(dt, this.t, lift > 0.05 ? 0.5 : speed > 0.02 ? this.hop : 0, pose === 'hurt' || pose === 'down' ? 'sad' : 'happy');
      // The wand: swung down through the hit, held up to cast or block.
      let want = 0.7;
      if (pose === 'swing1' || pose === 'swing2' || pose === 'heavy') want = p < hit ? 0.7 - (p / hit) * 2.2 : -1.5 + Math.min(1, (p - hit) / 0.2) * 2.6;
      else if (pose === 'cast') want = -0.2;
      else if (pose === 'block' || pose === 'crouchblock') want = -1.2;
      this.wand.rotation.x += (want - this.wand.rotation.x) * Math.min(1, dt * 18);
      if (pose === 'down') this.youser.root.rotation.z = Math.min(1.4, this.youser.root.rotation.z + dt * 4);
      else this.youser.root.rotation.z = 0;
    }
  }

  /** Each frame: speed 0..1 (of a full run), how far it stepped, which way it faces. */
  update(dt: number, speed: number, stride: number) {
    this.t += dt;
    this.poseT += dt;
    this.root.rotation.y = this.yaw;
    if (this.flinchT > 0 && (this.flinchT -= dt) <= 0 && this.pose === 'hurt') this.setPose('walk');
    if (this.powered) {
      this.jewel.rotation.y += dt * 3;
      this.light.intensity = 2.2 + Math.sin(this.t * 5) * 0.4;
    }
    if (this.youser) { this.youser.root.scale.set(1, 1, 1); this.youser.root.rotation.z = 0; }
    if (this.rig) {
      let pose: Pose = speed > 0.02 ? 'walk' : 'idle';
      if (this.pose === 'raise') pose = 'joy';
      if (this.pose === 'cheer') pose = 'joy';
      if (this.pose === 'hurt') pose = 'hurt';
      this.rig.animate(dt, pose, { speed, stride, turn: 0 }, this.poseT);
    } else if (this.youser) {
      if (speed > 0.02) this.hop = (this.hop + dt * (2 + speed * 2.4)) % 1;
      else this.hop = 0;
      const hop = this.pose === 'raise' || this.pose === 'cheer' ? (this.poseT * 2.2) % 1 : this.hop;
      this.youser.animate(dt, this.t, hop, this.pose === 'hurt' ? 'sad' : 'happy');
      // Youser lifts the wand high when it's raised.
      const want = this.pose === 'raise' || this.pose === 'cheer' ? -1.6 : 0.7;
      this.wand.rotation.x += (want - this.wand.rotation.x) * Math.min(1, dt * 8);
    }
  }
}
