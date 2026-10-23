import * as THREE from 'three';
import { makeSpearModel } from './spearModel';
import type { Bloc } from './bloc';

export type SpearState = 'held' | 'flying' | 'falling' | 'grounded' | 'stuck' | 'sinking';

let nextId = 1;

/** Each bloc owns one spear. In the world it's only visible when not held. */
export class Spear {
  readonly id = nextId++;
  readonly mesh: THREE.Group;
  private marker: THREE.Mesh;
  state: SpearState = 'held';
  x = 0;
  z = 0;
  y = 1;
  dirX = 1;
  dirZ = 0;
  traveled = 0;
  kills = 0;
  hit = new Set<number>();
  timer = 0;
  private time = 0;

  constructor(readonly owner: Bloc) {
    this.mesh = makeSpearModel(owner.team.color);
    this.mesh.visible = false;
    // Bouncing arrow above a dropped spear, so its human owner can find it.
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.4, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(owner.team.color).multiplyScalar(1.8) }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
  }

  addTo(scene: THREE.Object3D) {
    scene.add(this.mesh, this.marker);
  }

  launch(x: number, z: number, dx: number, dz: number) {
    this.state = 'flying';
    this.x = x;
    this.z = z;
    this.y = 1.0;
    this.dirX = dx;
    this.dirZ = dz;
    this.traveled = 0;
    this.kills = 0;
    this.hit.clear();
    this.mesh.visible = true;
  }

  updateView(dt: number) {
    this.time += dt;
    const m = this.mesh;
    m.visible = this.state !== 'held';
    m.position.set(this.x, this.y, this.z);
    const yaw = Math.atan2(this.dirX, this.dirZ);
    switch (this.state) {
      case 'flying':
        m.rotation.set(0, yaw, 0);
        break;
      case 'falling':
      case 'grounded':
        m.rotation.set(0, yaw, 0);
        m.rotateX(this.state === 'grounded' ? 0.08 : 0.2);
        break;
      case 'stuck':
        m.rotation.set(0, yaw, 0);
        m.rotateX(0.12);
        break;
      case 'sinking':
        m.rotation.set(0, yaw, 0);
        m.rotateX(0.5);
        break;
    }
    const showMarker = this.owner.human !== null && this.owner.alive &&
      (this.state === 'grounded' || this.state === 'stuck');
    this.marker.visible = showMarker;
    if (showMarker) this.marker.position.set(this.x, this.y + 0.9 + Math.abs(Math.sin(this.time * 4)) * 0.35, this.z);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.marker.removeFromParent();
  }
}
