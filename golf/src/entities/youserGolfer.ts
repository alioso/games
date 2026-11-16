// Youser, the baby bunny, as a golfer: tiny, with two stubby paws on a little putter that's
// nearly as tall as it is. Hops instead of walking, bounces for joy, droops its ears when sad.
import * as THREE from 'three';
import { BALL } from '../data/tuning';
import { ball, toon } from '../world/toon';
import { type GolferLike, type GolferPose, type P3, Walk, addressFrom, ghostify } from './golfer';
import { Youser } from './youser';

export class YouserGolfer implements GolferLike {
  readonly youser = new Youser();
  readonly root: THREE.Group;
  /** The club swings from the paws, at the chest. */
  private pivot = new THREE.Group();
  private head = new THREE.Object3D();
  private headOffset = new THREE.Vector3();
  private pose: GolferPose = 'idle';
  private t = 0;
  private hop = 0;
  private walk: Walk | null = null;
  private swingNow = 0;
  swing = 0;
  yaw = 0;

  constructor(clubColor = 0xc8ccd4) {
    this.root = this.youser.root;
    // Paws round the grip, a short shaft down to a head on the ground in front.
    this.pivot.position.set(0, 0.17, 0.12);
    const len = 0.2;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), toon(clubColor));
    shaft.position.y = -len / 2;
    const clubHead = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.11), toon(clubColor));
    clubHead.position.y = -len;
    this.head.position.y = -len;
    for (const s of [-1, 1]) this.pivot.add(ball(0.03, 0xece2d4, s * 0.025, 0, 0));
    this.pivot.add(shaft, clubHead, this.head);
    this.pivot.rotation.x = -0.25;
    this.pivot.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.root.add(this.pivot);
    // Where the club head rests, relative to Youser's feet.
    this.root.updateMatrixWorld(true);
    this.head.getWorldPosition(this.headOffset);
  }

  get walking() {
    return !!this.walk;
  }

  addressSpot(ballX: number, ballY: number, ballZ: number, dx: number, dz: number, left = false) {
    return addressFrom(this.headOffset, ballX, ballY, ballZ, dx, dz, BALL.radius + 0.05, left);
  }

  private left = false;
  private ghost = false;
  setLeft(left: boolean) {
    if (left === this.left) return;
    this.left = left;
    this.root.scale.x = left ? -1 : 1;
  }

  setGhost(on: boolean) {
    if (on === this.ghost) return;
    this.ghost = on;
    ghostify(this.root, on);
  }

  placeAt(x: number, y: number, z: number, yaw: number) {
    this.walk = null;
    this.root.position.set(x, y, z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  walkTo(x: number, y: number, z: number, yaw: number, via: P3[] = []) {
    this.walk = new Walk(this.root.position, [...via, { x, y, z }], yaw);
  }

  setPose(p: GolferPose) {
    if (p !== this.pose) { this.pose = p; this.t = 0; }
  }

  update(dt: number) {
    this.t += dt;
    const w = this.walk;
    let hop = 0;
    if (w) {
      // Bunny hops over to the ball.
      const r = this.root.position, d = w.left(r);
      const { dx, dz, arrived } = w.advance(r, 1.6 * dt);
      if (arrived) this.walk = null;
      else {
        this.hop = (this.hop + dt * 3.2) % 1;
        hop = this.hop;
      }
      const want = d > 0.3 ? Math.atan2(dx, dz) : w.yaw;
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 9);
      this.root.rotation.y = this.yaw;
    }
    const p = this.pose, t = this.t;
    if (!w && (p === 'joy' || p === 'pump')) hop = p === 'joy' ? (t * 2.2) % 1 : t < 0.5 ? t / 0.5 : 0;
    this.youser.animate(dt, t, hop, p === 'sulk' ? 'sad' : 'happy');
    // The club: swinging in the putt, waved about for joy, held low otherwise.
    let want = 0;
    if (p === 'putt') want = -this.swing * 0.9;
    else if (p === 'joy') want = 2.4 + Math.sin(t * 12) * 0.4;
    else if (p === 'pump') want = t < 1.2 ? 1.6 + Math.sin(t * 14) * 0.3 : 0.3;
    this.swingNow += (want - this.swingNow) * Math.min(1, dt * (p === 'putt' ? 30 : 10));
    this.pivot.rotation.z = this.swingNow;
  }
}
