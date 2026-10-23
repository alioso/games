import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp, dampAngle } from '@engine/math';
import { makeCanvasSprite, makeProgressRing } from '@engine/fx';
import type { TeamDef } from '../data/teams';
import { skinById, type SkinId } from '../data/blocs';
import type { HatId } from '../data/hats';
import type { WeaponId } from '../data/weapons';
import { faceTexture } from './faces';
import { makeHat, makeSkinTop } from './hats';
import { makeHeldWeapon } from './weaponModels';

const HIP = 0.42;
const BLOC_BOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.14);
const BAND_BOX = new RoundedBoxGeometry(1.03, 0.17, 1.03, 2, 0.06);
const LEG = new THREE.BoxGeometry(0.24, HIP, 0.26).translate(0, -HIP / 2, 0);
const FOOT = new THREE.BoxGeometry(0.28, 0.1, 0.36).translate(0, -HIP + 0.05, 0.05);

export interface ViewState {
  speed: number; // current ground speed, drives the walk cycle
  yaw: number;
  dashing: boolean;
  holdingWeapon: boolean;
}

/** What Match needs from anything it draws: blocs and bunnies. */
export interface ActorView {
  readonly root: THREE.Group;
  update(dt: number, s: ViewState): void;
  snapYaw(yaw: number): void;
  hit(): void;
  throwAnim(): void;
  /** `cracked`: the next heart is half gone (bunny punched once). */
  setHearts(hp: number, max: number, cracked?: boolean): void;
  setPunches(n: number, max: number): void;
  punchAnim(): void;
  setDead(dead: boolean): void;
  setRevive(progress: number): void;
  setCooldown(fraction: number): void;
  blink(seconds: number): void;
  poof(): void;
}

export interface BlocLook {
  skin: SkinId;
  hat: HatId | null;
}

/** Where each weapon sits in the bloc's hand. */
const GRIP: Record<WeaponId, { pos: [number, number, number]; tilt: number }> = {
  spear: { pos: [0.62, 0.05, 0.1], tilt: -0.25 },
  bazooka: { pos: [0.58, 0.3, 0], tilt: 0 },
  grenade: { pos: [0.62, -0.12, 0.3], tilt: 0 },
  flamethrower: { pos: [0.6, -0.1, 0.15], tilt: 0 },
};

/** Everything you see of one bloc. The simulation lives in Bloc; this only draws it. */
export class BlocView implements ActorView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private bodyMat: THREE.MeshStandardMaterial;
  private faceMat: THREE.MeshStandardMaterial;
  private top: THREE.Object3D | null;
  private held: THREE.Group;
  private ring;
  private reviveRing;
  private label: ReturnType<typeof makeCanvasSprite> | null = null;
  private pips: ReturnType<typeof makeCanvasSprite>;
  private fist: THREE.Mesh;
  private fistT = 0;
  private walk = 0;
  private yaw = 0;
  private squash = 0;
  private flash = 0;
  private deadT = -1;
  private time = Math.random() * 10;
  private blinkUntil = 0;
  private rainbow: boolean;

  constructor(readonly team: TeamDef, humanLabel: string | null, readonly look: BlocLook, weapon: WeaponId) {
    const skin = skinById(look.skin);
    this.rainbow = skin.id === 'rainbow';
    this.root.add(this.body);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: skin.color ?? team.color, metalness: skin.metal, roughness: skin.rough });
    const box = new THREE.Mesh(BLOC_BOX, this.bodyMat);
    box.castShadow = box.receiveShadow = true;
    this.body.add(box);

    // Skinned blocs wear a stripe in the team colour so you can still tell the teams apart.
    if (skin.color !== null) {
      const band = new THREE.Mesh(BAND_BOX, new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.45 }));
      band.position.y = -0.3;
      this.body.add(band);
    }

    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(skin.id), transparent: true, alphaTest: 0.4, roughness: 0.6 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), this.faceMat);
    face.position.z = 0.506;
    this.body.add(face);

    this.top = look.hat ? makeHat(look.hat) : makeSkinTop(skin.id);
    if (this.top) {
      this.top.position.y = 0.48;
      this.top.scale.setScalar(look.hat ? 0.95 : 1);
      this.body.add(this.top);
    }

    const legMat = new THREE.MeshStandardMaterial({ color: team.dark, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, HIP, 0);
      const leg = new THREE.Mesh(LEG, legMat);
      const foot = new THREE.Mesh(FOOT, legMat);
      leg.castShadow = foot.castShadow = true;
      pivot.add(leg, foot);
      this.root.add(pivot);
      this.legs.push(pivot);
    }

    this.held = makeHeldWeapon(weapon, team.color);
    const grip = GRIP[weapon];
    this.held.position.set(...grip.pos);
    this.held.rotation.x = grip.tilt;
    this.body.add(this.held);

    // A fist that pops out when punching.
    this.fist = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.08), legMat);
    this.fist.castShadow = true;
    this.fist.visible = false;
    this.body.add(this.fist);

    // Punches taken, shown as little pips over the head.
    this.pips = makeCanvasSprite(192, 40, 0.42);
    this.pips.sprite.position.y = look.hat ? 2.35 : 1.85;
    this.pips.sprite.visible = false;
    this.root.add(this.pips.sprite);

    // Team ring on the ground. For human players it also shows the dash cooldown.
    const human = humanLabel !== null;
    this.ring = makeProgressRing(0.62, human ? 0.82 : 0.74, team.color);
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
      this.label.sprite.position.y = look.hat ? 2.7 : 2.15;
      this.root.add(this.label.sprite);
    }
  }

  snapYaw(yaw: number) {
    this.yaw = yaw;
  }

  /** Standing still, no ring or weapon: for shop pictures. */
  pose() {
    this.ring.mesh.visible = false;
    this.held.visible = false;
    this.body.position.y = HIP + 0.5;
    return this.root;
  }

  hit() {
    this.flash = 1;
    this.squash = -0.5;
  }

  throwAnim() {
    this.squash = 0.35;
  }

  setHearts() {}

  setPunches(n: number, max: number) {
    this.pips.sprite.visible = n > 0;
    if (n <= 0) return;
    this.pips.draw((g, w, h) => {
      const r = 13, gap = 8;
      const x0 = (w - (max * r * 2 + (max - 1) * gap)) / 2 + r;
      for (let i = 0; i < max; i++) {
        g.beginPath();
        g.arc(x0 + i * (r * 2 + gap), h / 2, r, 0, Math.PI * 2);
        g.fillStyle = i < n ? '#ffcc33' : 'rgba(0,0,0,0.35)';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#fff';
        g.stroke();
      }
    });
  }

  punchAnim() {
    this.fistT = 0.16;
    this.squash = 0.2;
  }

  poof() {}

  setDead(dead: boolean) {
    this.deadT = dead ? 0 : -1;
    for (const l of this.legs) l.visible = !dead;
    if (this.top) this.top.visible = !dead;
    this.faceMat.map = faceTexture(dead ? 'dead' : this.look.skin);
    this.faceMat.needsUpdate = true;
    if (!dead) {
      this.squash = 0.6;
      this.body.rotation.x = 0;
    }
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

  update(dt: number, s: ViewState) {
    this.time += dt;
    this.yaw = dampAngle(this.yaw, s.yaw, 16, dt);
    this.root.rotation.y = this.yaw;
    this.squash = damp(this.squash, 0, 10, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.bodyMat.emissive.setScalar(this.flash * 0.9);
    if (this.rainbow) this.bodyMat.color.setHSL((this.time * 0.25) % 1, 0.85, 0.55);
    this.held.visible = s.holdingWeapon && this.deadT < 0;
    this.fistT = Math.max(0, this.fistT - dt);
    this.fist.visible = this.fistT > 0 && this.deadT < 0;
    if (this.fist.visible) this.fist.position.set(0.3, -0.05, 0.55 + Math.sin((this.fistT / 0.16) * Math.PI) * 0.45);
    this.root.visible = this.time > this.blinkUntil || Math.sin(this.time * 30) > 0;

    if (this.deadT >= 0) {
      // Squashed flat on the ground: the coloured remains a teammate can revive.
      this.deadT += dt;
      const k = Math.min(1, this.deadT * 6);
      this.body.position.y = THREE.MathUtils.lerp(HIP + 0.5, 0.17, k);
      this.body.scale.set(1 + 0.25 * k, 1 + 0.25 * k, 1 - 0.7 * k);
      this.body.rotation.x = -Math.PI / 2 * k * 0.98;
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
    this.body.position.y = HIP + 0.5 + bob + sq * 0.1;
    this.body.scale.set(1 - sq * 0.25, 1 + sq * 0.35, 1 - sq * 0.25);
  }
}
