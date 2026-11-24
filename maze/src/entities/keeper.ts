// A riddle keeper at their gate: one of Floor Step's residents standing in a gap through the hedge,
// a little wooden gate shut on either side of them. They turn to watch you as you come near. Answer
// their riddle and they open the gate and step aside; get it wrong and they stay where they are.
import * as THREE from 'three';
import type { Keeper } from '../data/riddles';
import { cyl, toon } from '../world/toon';
import { buildResident } from './keeperModel';
import type { HeroRig, Pose } from './heroModel';

export type KeeperState = 'waiting' | 'refused' | 'opening' | 'open';

export class KeeperView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private rig: HeroRig;
  private idlePose: Pose;
  private gates: THREE.Group[] = [];
  state: KeeperState = 'waiting';
  private t = 0;
  private openT = 0;
  /** The gap runs along x (travel along z) or along z (travel along x). */
  readonly alongX: boolean;
  /** Where they stand when they step aside. */
  private aside = new THREE.Vector3();
  private yaw = 0;

  constructor(readonly keeper: Keeper, readonly tile: [number, number], x: number, z: number, width: number, alongX: boolean) {
    this.alongX = alongX;
    this.root.position.set(x, 0, z);
    const r = buildResident(keeper.look);
    this.rig = r.rig;
    this.idlePose = r.pose === 'sit' ? 'idle' : r.pose;
    this.body.add(r.root);
    this.root.add(this.body);
    // Two little gates, one either side of the keeper, hinged at the hedges.
    const half = width / 2;
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      const gate = new THREE.Group();
      const len = half - 0.35;
      for (let i = 0; i <= 4; i++) gate.add(cyl(0.025, 0.025, 0.75, toon(0xe8dcc0), (i / 4) * len, 0, 0, 5));
      for (const y of [0.25, 0.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.04), toon(0xd8c8a8));
        rail.position.set(len / 2, y, 0);
        rail.castShadow = true;
        gate.add(rail);
      }
      // The gate points from the hedge toward the keeper.
      gate.rotation.y = s > 0 ? Math.PI : 0;
      hinge.add(gate);
      hinge.position.set(alongX ? s * half : 0, 0, alongX ? 0 : s * half);
      hinge.rotation.y = alongX ? 0 : -Math.PI / 2;
      this.root.add(hinge);
      this.gates.push(hinge);
      hinge.userData.s = s;
    }
    this.aside.set(alongX ? 0.85 : 0, 0, alongX ? 0 : 0.85);
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  }

  /** Is the way through still shut? */
  get blocking() {
    return this.state === 'waiting' || this.state === 'refused';
  }

  /** Right answer: open the gates and step aside. */
  open() {
    this.state = 'opening';
    this.openT = 0;
  }

  refuse() {
    this.state = 'refused';
  }

  update(dt: number, hero: THREE.Vector3) {
    this.t += dt;
    const p = this.root.position;
    // Watch the hero when they're near.
    const dx = hero.x - (p.x + this.body.position.x), dz = hero.z - (p.z + this.body.position.z);
    const near = Math.hypot(dx, dz) < 6;
    const want = near ? Math.atan2(dx, dz) : this.yaw;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 4);
    this.body.rotation.y = this.yaw;
    let pose: Pose = this.idlePose;
    if (this.state === 'opening' || this.state === 'open') {
      this.openT += dt;
      const u = Math.min(1, this.openT / 1.2), e = u * u * (3 - 2 * u);
      for (const g of this.gates) {
        const base = this.alongX ? 0 : -Math.PI / 2;
        g.rotation.y = base + g.userData.s * e * (Math.PI / 2) * (this.alongX ? 1 : -1);
      }
      this.body.position.lerpVectors(new THREE.Vector3(), this.aside, e);
      pose = u < 1 ? 'walk' : this.idlePose;
      if (u >= 1) this.state = 'open';
    } else if (this.state === 'refused') {
      pose = this.t % 4 < 1.2 ? 'cheer' : this.idlePose;
    }
    this.rig.animate(dt, pose, { speed: pose === 'walk' ? 0.4 : 0, stride: pose === 'walk' ? dt * 0.8 : 0, turn: 0 }, this.t);
  }
}
