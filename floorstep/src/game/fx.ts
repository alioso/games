// Comic fight effects: the swoosh a weapon leaves through the air, and the jagged star where a
// blow lands. Both are drawn flat and bright, like the speed lines and "impact stars" of comics.
import * as THREE from 'three';

const SAMPLES = 14;

/** A ribbon between the hand and the weapon tip, following the last few frames of the swing. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private alpha: Float32Array;
  private hands: THREE.Vector3[] = [];
  private tips: THREE.Vector3[] = [];
  private ages: number[] = [];
  recording = false;

  constructor(color = 0xffffff) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(SAMPLES * 2 * 3);
    this.alpha = new Float32Array(SAMPLES * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.4) } },
      vertexShader: /* glsl */ `
        attribute float alpha; varying float vA;
        void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA < 0.02) discard; gl_FragColor = vec4(uColor, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Call every frame with the current hand and tip positions (world space). */
  update(dt: number, hand: THREE.Vector3, tip: THREE.Vector3) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    if (this.recording) {
      // Reach a little past the hand, so the swoosh is wide like a comic speed band.
      const inner = hand.clone().lerp(tip, 0.35);
      this.hands.unshift(inner);
      this.tips.unshift(tip.clone().addScaledVector(tip.clone().sub(hand).normalize(), 0.1));
      this.ages.unshift(0);
    }
    while (this.ages.length > SAMPLES || (this.ages.length && this.ages[this.ages.length - 1] > 0.18)) {
      this.ages.pop();
      this.hands.pop();
      this.tips.pop();
    }
    const n = this.ages.length;
    for (let i = 0; i < SAMPLES; i++) {
      const j = Math.min(i, n - 1);
      if (j < 0) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const h = this.hands[j], t = this.tips[j];
      this.pos.set([h.x, h.y, h.z], i * 6);
      this.pos.set([t.x, t.y, t.z], i * 6 + 3);
      const fade = i < n ? Math.max(0, 1 - this.ages[j] / 0.18) * (1 - i / SAMPLES) : 0;
      this.alpha[i * 2] = fade * 0.25;
      this.alpha[i * 2 + 1] = fade * 0.95;
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

let starTex: THREE.CanvasTexture | null = null;

function starTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const spikes = 9;
  const draw = (r0: number, r1: number, fill: string) => {
    g.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 ? r0 * (0.8 + 0.4 * ((i * 7) % 3) / 2) : r1;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#1a1210';
    g.stroke();
  };
  draw(30, 60, '#ffd23f');
  draw(16, 34, '#ffffff');
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

interface Star {
  sprite: THREE.Sprite;
  t: number;
  size: number;
}

/** "Impact stars" that flash where blows land. */
export class Impacts {
  readonly group = new THREE.Group();
  private stars: Star[] = [];

  spawn(x: number, y: number, z: number, size = 0.7) {
    const mat = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthTest: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 5;
    mat.rotation = Math.random() * Math.PI;
    this.group.add(sprite);
    this.stars.push({ sprite, t: 0, size });
  }

  update(dt: number) {
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.t += dt;
      const k = s.t / 0.16;
      s.sprite.scale.setScalar(s.size * (k < 0.3 ? 0.6 + k * 2 : 1.2 - (k - 0.3) * 0.5));
      (s.sprite.material as THREE.SpriteMaterial).opacity = k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4);
      if (k >= 1) {
        s.sprite.removeFromParent();
        s.sprite.material.dispose();
        this.stars.splice(i, 1);
      }
    }
  }
}
