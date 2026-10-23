import * as THREE from 'three';
import { damp, dampAngle } from '@engine/math';
import { makeCanvasSprite, makeProgressRing } from '@engine/fx';
import type { TeamDef } from '../data/teams';
import type { ActorView, ViewState } from './blocView';

// The baby bunny each team protects: fluffy, white, big ears, a bow in the team colour.

const FUR = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.95,
  sheen: 1,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xffe4ee),
});
const PINK = new THREE.MeshStandardMaterial({ color: 0xffa8c5, roughness: 0.7 });
const EYE = new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.05, metalness: 0.2 });
const SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Sphere with a slightly lumpy surface so it reads as fluff rather than plastic. */
function fluffy(r: number, seed: number) {
  const geo = new THREE.IcosahedronGeometry(r, 4);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 31 + seed) * Math.sin(v.y * 29 + seed * 2) * Math.sin(v.z * 37 + seed * 3);
    v.multiplyScalar(1 + n * 0.035);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

export class BunnyView implements ActorView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private ears: THREE.Group[] = [];
  private nose: THREE.Mesh;
  private ring;
  private hearts: ReturnType<typeof makeCanvasSprite>;
  private furMats: THREE.MeshPhysicalMaterial[] = [];
  private yaw = 0;
  private hop = 0;
  private squash = 0;
  private flash = 0;
  private droop = 0;
  private time = Math.random() * 10;
  private gone = false;

  constructor(team: TeamDef) {
    this.root.add(this.body);
    // Each bunny gets its own fur material so a hit only flashes that bunny.
    const fur = FUR.clone();
    this.furMats.push(fur);

    const torso = part(fluffy(0.5, 1), fur, 0, 0.42, -0.05);
    torso.scale.set(0.85, 0.78, 1);
    this.body.add(torso);
    this.body.add(part(fluffy(0.37, 2), fur, 0, 0.86, 0.3));
    for (const s of [-1, 1]) {
      this.body.add(part(fluffy(0.15, 3 + s), fur, s * 0.17, 0.75, 0.5));
      const blush = part(new THREE.SphereGeometry(0.07, 12, 8), PINK, s * 0.22, 0.79, 0.57);
      blush.scale.set(1, 0.6, 0.3);
      this.body.add(blush);
      const eye = part(new THREE.SphereGeometry(0.08, 16, 12), EYE, s * 0.15, 0.92, 0.6);
      eye.add(part(new THREE.SphereGeometry(0.026, 8, 6), SHINE, 0.025, 0.03, 0.06));
      this.body.add(eye);
      // Big ears: white outside, pink inside, on a pivot so they can flop.
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.13, 1.12, 0.22);
      pivot.rotation.set(-0.25, 0, -s * 0.22);
      const outer = part(new THREE.CapsuleGeometry(0.1, 0.5, 6, 12), fur, 0, 0.36, 0);
      outer.scale.set(1, 1, 0.55);
      const inner = part(new THREE.CapsuleGeometry(0.06, 0.4, 6, 10), PINK, 0, 0.36, 0.035);
      inner.scale.set(1, 1, 0.4);
      pivot.add(outer, inner);
      this.body.add(pivot);
      this.ears.push(pivot);
      const foot = part(fluffy(0.14, 5 + s), fur, s * 0.26, 0.07, -0.02);
      foot.scale.set(0.8, 0.5, 1.6);
      this.body.add(foot);
      this.body.add(part(fluffy(0.08, 7 + s), fur, s * 0.14, 0.12, 0.38));
      // Bow in the team colour, at the neck.
      const loop = part(new THREE.ConeGeometry(0.09, 0.2, 10), new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.4 }), s * 0.1, 0.64, 0.5);
      loop.rotation.z = s * Math.PI / 2;
      this.body.add(loop);
    }
    this.body.add(part(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: team.dark }), 0, 0.64, 0.52));
    this.nose = part(new THREE.SphereGeometry(0.045, 10, 8), PINK, 0, 0.82, 0.66);
    this.body.add(this.nose);
    this.body.add(part(fluffy(0.17, 9), fur, 0, 0.42, -0.55));

    this.ring = makeProgressRing(0.82, 1.0, team.color);
    this.ring.mesh.position.y = 0.03;
    this.ring.opacity = 0.7;
    this.root.add(this.ring.mesh);

    this.hearts = makeCanvasSprite(192, 64, 0.45);
    this.hearts.sprite.position.y = 2.2;
    this.root.add(this.hearts.sprite);
  }

  setHearts(hp: number, max: number) {
    this.hearts.draw((g, w, h) => {
      const size = 44, gap = 10;
      const x0 = (w - (size * max + gap * (max - 1))) / 2;
      for (let i = 0; i < max; i++) {
        const x = x0 + i * (size + gap) + size / 2, y = h / 2;
        g.fillStyle = i < hp ? '#ff4d6d' : 'rgba(0,0,0,0.35)';
        g.strokeStyle = '#fff';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, y + 16);
        g.bezierCurveTo(x - 26, y - 2, x - 14, y - 22, x, y - 9);
        g.bezierCurveTo(x + 14, y - 22, x + 26, y - 2, x, y + 16);
        g.fill();
        g.stroke();
      }
    });
  }

  snapYaw(yaw: number) {
    this.yaw = yaw;
  }

  hit() {
    this.flash = 1;
    this.squash = -0.5;
    this.droop = 1;
  }

  poof() {
    this.gone = true;
    this.body.visible = false;
    this.ring.mesh.visible = false;
    this.hearts.sprite.visible = false;
  }

  throwAnim() {}
  setDead() {}
  setRevive() {}
  setCooldown() {}
  blink() {}

  update(dt: number, s: ViewState) {
    if (this.gone) return;
    this.time += dt;
    this.yaw = dampAngle(this.yaw, s.yaw, 10, dt);
    this.root.rotation.y = this.yaw;
    this.squash = damp(this.squash, 0, 8, dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.droop = Math.max(0, this.droop - dt * 1.2);
    for (const m of this.furMats) m.emissive.setRGB(this.flash, this.flash * 0.3, this.flash * 0.5);

    // Hop, hop.
    const moving = Math.min(1, s.speed / 1.5);
    if (moving > 0.05 || Math.sin(this.hop) > 0.05) this.hop += dt * 10;
    const up = Math.max(0, Math.sin(this.hop));
    const sq = this.squash;
    this.body.position.y = up * 0.28 * Math.max(moving, 0.3);
    this.body.rotation.x = -Math.cos(this.hop) * 0.12 * moving;
    this.body.scale.set(1 - sq * 0.2, 1 + sq * 0.3 + up * 0.05, 1 - sq * 0.2);

    // Ears flop with the hop, droop when hit, twitch now and then.
    const twitch = Math.sin(this.time * 1.3) > 0.97 ? Math.sin(this.time * 40) * 0.15 : 0;
    this.ears.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      e.rotation.x = -0.25 - up * 0.35 + this.droop * 1.2;
      e.rotation.z = -side * (0.22 + this.droop * 0.5) + (i === 0 ? twitch : 0);
    });
    this.nose.scale.setScalar(1 + Math.max(0, Math.sin(this.time * 9)) * 0.2);
  }
}
