import * as THREE from 'three';

/**
 * Tilted overhead camera that keeps a rectangle of ground fully on screen,
 * whatever the screen shape, plus a decaying screen shake.
 */
export class ArenaCamera {
  private base = new THREE.Vector3();
  private target = new THREE.Vector3();
  private trauma = 0;
  private t = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private halfW: number,
    private halfD: number,
    private tiltDeg = 58,
    public margin = 1.06,
  ) {}

  /** Recompute distance so the arena (plus margin) fits. Call on resize. */
  fit() {
    const cam = this.camera;
    const tilt = THREE.MathUtils.degToRad(this.tiltDeg);
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const corners = [
      new THREE.Vector3(-this.halfW, 0, -this.halfD),
      new THREE.Vector3(this.halfW, 0, -this.halfD),
      new THREE.Vector3(-this.halfW, 0, this.halfD),
      new THREE.Vector3(this.halfW, 0, this.halfD),
      new THREE.Vector3(-this.halfW, 1.6, -this.halfD),
      new THREE.Vector3(this.halfW, 1.6, -this.halfD),
    ];
    // Binary search the distance at which every corner projects inside the view.
    let lo = 5, hi = 300;
    const p = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(dir).multiplyScalar(d);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      let ok = true;
      for (const c of corners) {
        p.copy(c).project(cam);
        if (Math.abs(p.x) * this.margin > 1 || Math.abs(p.y) * this.margin > 1) { ok = false; break; }
      }
      if (ok) hi = d; else lo = d;
    }
    this.base.copy(dir).multiplyScalar(hi);
    cam.position.copy(this.base);
    cam.lookAt(this.target);
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 0.6;
    this.camera.position.set(
      this.base.x + s * Math.sin(this.t * 47),
      this.base.y + s * Math.sin(this.t * 53 + 1),
      this.base.z + s * Math.sin(this.t * 41 + 2),
    );
    this.camera.lookAt(this.target);
  }
}
