import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp, dampAngle } from '@engine/math';
import { makeCanvasSprite, makeProgressRing } from '@engine/fx';
import type { TeamDef } from '../data/teams';
import { FACES } from './faces';
import { makeSpearModel } from './spearModel';

const HIP = 0.42;
const BLOC_BOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.14);
const ROBOT_BOX = new RoundedBoxGeometry(1.25, 1.15, 1.05, 3, 0.12);
const LEG = new THREE.BoxGeometry(0.24, HIP, 0.26).translate(0, -HIP / 2, 0);
const FOOT = new THREE.BoxGeometry(0.28, 0.1, 0.36).translate(0, -HIP + 0.05, 0.05);

export interface ViewState {
  speed: number; // current ground speed, drives the walk cycle
  yaw: number;
  dashing: boolean;
  holdingSpear: boolean;
}

/** Everything you see of one bloc or robot. The simulation lives in Bloc; this only draws it. */
export class BlocView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private bodyMat: THREE.MeshStandardMaterial;
  private face: THREE.Mesh;
  private faceMat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  private spear: THREE.Group | null = null;
  private antennaBall: THREE.Mesh | null = null;
  private ring;
  private reviveRing;
  private label: ReturnType<typeof makeCanvasSprite> | null = null;
  private hearts: ReturnType<typeof makeCanvasSprite> | null = null;
  private walk = 0;
  private yaw = 0;
  private squash = 0;
  private flash = 0;
  private deadT = -1;
  private time = Math.random() * 10;
  private blinkUntil = 0;

  constructor(readonly kind: 'bloc' | 'robot', readonly team: TeamDef, humanLabel: string | null) {
    const isRobot = kind === 'robot';
    this.root.add(this.body);

    this.bodyMat = new THREE.MeshStandardMaterial(
      isRobot
        ? { color: 0xa9b3bd, metalness: 0.75, roughness: 0.32 }
        : { color: team.color, roughness: 0.5 },
    );
    const box = new THREE.Mesh(isRobot ? ROBOT_BOX : BLOC_BOX, this.bodyMat);
    box.castShadow = true;
    box.receiveShadow = true;
    this.body.add(box);

    const faceSize = isRobot ? 0.95 : 0.84;
    if (isRobot) {
      // Glowing screen face; colour above 1 so the bloom picks it up.
      this.faceMat = new THREE.MeshBasicMaterial({
        map: FACES.robot(),
        color: new THREE.Color(team.color).multiplyScalar(2.4),
      });
    } else {
      this.faceMat = new THREE.MeshStandardMaterial({ map: FACES.beginner(), transparent: true, alphaTest: 0.4, roughness: 0.6 });
    }
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(faceSize, faceSize * (isRobot ? 0.82 : 1)), this.faceMat);
    this.face.position.z = (isRobot ? 0.525 : 0.5) + 0.006;
    this.body.add(this.face);

    if (isRobot) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(1.29, 0.16, 1.09),
        new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.4 }),
      );
      band.position.y = -0.38;
      this.body.add(band);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45), this.bodyMat);
      stalk.position.y = 0.78;
      this.body.add(stalk);
      this.antennaBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(team.color).multiplyScalar(3) }),
      );
      this.antennaBall.position.y = 1.02;
      this.body.add(this.antennaBall);
    }

    const legMat = new THREE.MeshStandardMaterial({ color: isRobot ? 0x5d666e : team.dark, roughness: 0.6, metalness: isRobot ? 0.5 : 0 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (isRobot ? 0.32 : 0.24), HIP, 0);
      const leg = new THREE.Mesh(LEG, legMat);
      const foot = new THREE.Mesh(FOOT, legMat);
      leg.castShadow = foot.castShadow = true;
      pivot.add(leg, foot);
      if (isRobot) pivot.scale.set(1.3, 1, 1.2);
      this.root.add(pivot);
      this.legs.push(pivot);
    }

    if (!isRobot) {
      this.spear = makeSpearModel(team.color);
      this.spear.position.set(0.62, 0.05, 0.1);
      this.spear.rotation.x = -0.25;
      this.body.add(this.spear);
    }

    // Team ring on the ground. For human players it also shows the dash cooldown.
    const human = humanLabel !== null;
    this.ring = makeProgressRing(isRobot ? 0.85 : 0.62, isRobot ? 1.0 : human ? 0.82 : 0.74, team.color);
    this.ring.mesh.position.y = 0.03;
    this.ring.opacity = human ? 1 : 0.55;
    this.root.add(this.ring.mesh);

    this.reviveRing = makeProgressRing(0.75, 1.05, 0x7dff8a);
    this.reviveRing.mesh.position.y = 0.05;
    this.reviveRing.mesh.visible = false;
    this.root.add(this.reviveRing.mesh);

    if (human) {
      this.label = makeCanvasSprite(128, 64, 0.55);
      this.label.draw((g, w, h) => {
        g.fillStyle = '#' + new THREE.Color(team.color).getHexString();
        g.beginPath();
        g.roundRect(14, 6, w - 28, h - 20, 14);
        g.fill();
        g.beginPath();
        g.moveTo(w / 2 - 10, h - 15); g.lineTo(w / 2 + 10, h - 15); g.lineTo(w / 2, h - 3);
        g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 34px Bungee, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(humanLabel, w / 2, (h - 14) / 2 + 2);
      });
      this.label.sprite.position.y = 2.15;
      this.root.add(this.label.sprite);
    }
    if (isRobot) {
      this.hearts = makeCanvasSprite(192, 64, 0.45);
      this.hearts.sprite.position.y = 2.25;
      this.root.add(this.hearts.sprite);
    }
  }

  setHearts(hp: number, max: number) {
    this.hearts?.draw((g, w, h) => {
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

  /** Snap facing (used when spawning). */
  snapYaw(yaw: number) {
    this.yaw = yaw;
  }

  hit() {
    this.flash = 1;
    this.squash = -0.5;
  }

  throwAnim() {
    this.squash = 0.35;
  }

  setDead(dead: boolean) {
    this.deadT = dead ? 0 : -1;
    for (const l of this.legs) l.visible = !dead;
    if (this.kind === 'bloc') {
      (this.faceMat as THREE.MeshStandardMaterial).map = dead ? FACES.dead() : FACES.beginner();
      this.faceMat.needsUpdate = true;
    }
    if (!dead) this.squash = 0.6;
    this.reviveRing.mesh.visible = false;
  }

  setRevive(progress: number) {
    this.reviveRing.mesh.visible = progress > 0;
    this.reviveRing.progress = progress;
  }

  setCooldown(fraction: number) {
    this.ring.progress = fraction;
  }

  blink(seconds: number) {
    this.blinkUntil = this.time + seconds;
  }

  setWreck() {
    this.bodyMat.color.set(0x3a3f44);
    (this.faceMat as THREE.MeshBasicMaterial).color.set(0x222222);
    if (this.antennaBall) this.antennaBall.visible = false;
    if (this.hearts) this.hearts.sprite.visible = false;
    this.ring.mesh.visible = false;
    for (const l of this.legs) l.rotation.z = 0.5 * Math.sign(l.position.x);
    this.body.rotation.z = 0.25;
    this.deadT = 0;
  }

  update(dt: number, s: ViewState) {
    this.time += dt;
    this.yaw = dampAngle(this.yaw, s.yaw, 16, dt);
    this.root.rotation.y = this.yaw;
    this.squash = damp(this.squash, 0, 10, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.bodyMat.emissive.setScalar(this.flash * 0.9);

    if (this.antennaBall) this.antennaBall.visible = this.deadT < 0 && Math.sin(this.time * 5) > -0.3;
    if (this.spear) this.spear.visible = s.holdingSpear && this.deadT < 0;
    this.root.visible = this.time > this.blinkUntil || Math.sin(this.time * 30) > 0;

    if (this.deadT >= 0) {
      this.deadT += dt;
      if (this.kind === 'bloc') {
        // Squashed flat on the ground: the coloured remains a teammate can revive.
        const k = Math.min(1, this.deadT * 6);
        this.body.position.y = THREE.MathUtils.lerp(HIP + 0.5, 0.17, k);
        this.body.scale.set(1 + 0.25 * k, 1 + 0.25 * k, 1 - 0.7 * k);
        this.body.rotation.x = -Math.PI / 2 * k * 0.98;
      } else {
        this.body.position.y = HIP + 0.4;
      }
      this.ring.mesh.visible = false;
      return;
    }
    this.ring.mesh.visible = true;
    this.body.rotation.x = s.dashing ? 0.35 : 0;

    const moving = Math.min(1, s.speed / 4);
    this.walk += dt * (4 + s.speed * 1.9);
    const swing = Math.sin(this.walk) * 0.75 * moving;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    const bob = Math.abs(Math.sin(this.walk)) * 0.08 * moving + Math.sin(this.time * 2.2) * 0.015;
    const sq = this.squash;
    this.body.position.y = HIP + (this.kind === 'robot' ? 0.575 : 0.5) + bob + sq * 0.1;
    this.body.scale.set(1 - sq * 0.25, 1 + sq * 0.35, 1 - sq * 0.25);
  }

  dispose() {
    this.root.removeFromParent();
  }
}
