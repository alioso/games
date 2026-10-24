import * as THREE from 'three';
import type { LiquidKind } from '../data/arenas';
import { depthIn } from './shapes';
import type { Terrain } from './terrain';

// Every liquid is a flat plane whose shape comes from a soft mask texture (painted once from the
// arena shapes), so ponds, rivers and lava pools of any shape share one shader. The sea's shoreline
// is computed in the shader instead, so the tide can move it smoothly.

const LOOK: Record<LiquidKind, { deep: number[]; shallow: number[]; foam: number[] }> = {
  pond: { deep: [0.05, 0.28, 0.38], shallow: [0.22, 0.66, 0.72], foam: [0.95, 0.95, 0.95] },
  river: { deep: [0.07, 0.24, 0.17], shallow: [0.25, 0.48, 0.3], foam: [0.75, 0.82, 0.7] },
  sea: { deep: [0.02, 0.22, 0.48], shallow: [0.15, 0.72, 0.78], foam: [1, 1, 1] },
  lava: { deep: [0.1, 0.025, 0.015], shallow: [2.2, 0.6, 0.08], foam: [2.6, 1.2, 0.25] },
};

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uMask;
  uniform vec4 uRect;      // mask covers x: [x, x+z], z: [y, y+w]
  uniform float uUseMask;
  uniform float uFull;     // everything is liquid (the lava sea around the volcano)
  uniform float uUseShore;
  uniform vec4 uShore;     // z, amp, seed, tide offset
  uniform float uLava;
  uniform vec3 uDeep, uShallow, uFoam;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
  }

  float wave(vec2 p) {
    return sin(p.x * 1.7 + uTime * 1.3) * 0.5 + sin(p.y * 2.3 - uTime * 1.1) * 0.5
         + sin((p.x + p.y) * 3.1 + uTime * 2.0) * 0.35;
  }

  void main() {
    vec2 p = vWorld.xz;
    float inside = uFull;
    float edge = 0.0;
    if (uUseMask > 0.5) {
      float m = texture2D(uMask, (p - uRect.xy) / uRect.zw).r;
      if (m > 0.5) { inside = 1.0; edge = 1.0 - smoothstep(0.5, 0.97, m); }
    }
    if (uUseShore > 0.5) {
      float sz = uShore.x + uShore.y * (0.6 * sin(p.x * 0.35 + uShore.z) + 0.4 * sin(p.x * 0.9 + uShore.z * 2.1)) - uShore.w;
      float d = p.y - sz;
      if (d > 0.0) { inside = 1.0; edge = max(edge, 1.0 - smoothstep(0.0, 1.6, d)); }
    }
    if (inside < 0.5) discard;

    vec3 col;
    if (uLava > 0.5) {
      // Dark crust plates drifting slowly, glowing veins between them, a few molten pools.
      vec2 q = p * 0.42 + vec2(uTime * 0.04, -uTime * 0.025);
      float w = fbm(q + 1.5 * fbm(q * 1.3 + vec2(0.0, uTime * 0.05)));
      float ridge = 1.0 - abs(fract(w * 3.2) - 0.5) * 2.0;
      float veins = smoothstep(0.8, 0.98, ridge);
      float pools = smoothstep(0.62, 0.78, w);
      float glow = max(veins * 0.85, pools);
      col = uDeep * (0.7 + 0.6 * fbm(p * 1.7)) + uShallow * glow;
      col += uFoam * pow(edge, 3.0) * 0.5;
      col *= 0.85 + 0.15 * sin(uTime * 2.0 + p.x * 0.5);
    } else {
      col = mix(uDeep, uShallow, smoothstep(0.1, 1.0, edge));
      float w = wave(p) + wave(p * 1.9 + 4.0) * 0.5;
      col += smoothstep(1.0, 1.35, w) * 0.16;
      col += smoothstep(1.55, 1.7, w + sin(p.x * 9.0 + uTime * 3.0) * 0.2) * vec3(1.5, 1.7, 1.8);
      float foam = smoothstep(0.82, 0.95, edge + sin(p.x * 3.0 + p.y * 2.0 + uTime * 2.5) * 0.04);
      col = mix(col, uFoam, foam * 0.85);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export class Liquids {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  private seaMat: THREE.ShaderMaterial | null = null;

  constructor(private terrain: Terrain) {
    const def = terrain.def;
    const M = 6;
    const minX = -def.halfW - M, minZ = -def.halfD - M;
    const W = (def.halfW + M) * 2, D = (def.halfD + M) * 2;
    const rect = new THREE.Vector4(minX, minZ, W, D);

    const kinds = new Set(def.liquids.map((l) => l.kind));
    for (const kind of kinds) {
      const mask = this.paintMask(kind, minX, minZ, W, D);
      const isSea = kind === 'sea' && !!def.shore;
      const mat = this.material(kind, { mask, rect, shore: isSea });
      if (isSea) this.seaMat = mat;
      // Sea planes are huge so the ocean reaches the edge of the screen.
      const size = isSea ? 200 : Math.max(W, D) * 1.2;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(isSea ? size : W, isSea ? size : D), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(isSea ? 0 : minX + W / 2, 0.03, isSea ? 0 : minZ + D / 2);
      plane.renderOrder = 1;
      this.group.add(plane);
    }
    if (def.shore && !kinds.has('sea')) {
      const mat = this.material('sea', { shore: true });
      this.seaMat = mat;
      this.addFullPlane(mat, 0.03);
    }
    if (def.edge === 'lava') this.addFullPlane(this.material('lava', { full: true }), -0.45);
  }

  private addFullPlane(mat: THREE.ShaderMaterial, y: number) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    this.group.add(plane);
  }

  /** White where `kind` is, softened so the shader can find the edges. */
  private paintMask(kind: LiquidKind, minX: number, minZ: number, W: number, D: number) {
    const ppu = 12;
    const w = Math.round(W * ppu), h = Math.round(D * ppu);
    const raw = document.createElement('canvas');
    raw.width = w;
    raw.height = h;
    const g = raw.getContext('2d')!;
    const img = g.createImageData(w, h);
    const shapes = this.terrain.def.liquids.filter((l) => l.kind === kind).map((l) => l.shape);
    for (let j = 0; j < h; j++) {
      const z = minZ + (j + 0.5) / ppu;
      for (let i = 0; i < w; i++) {
        const x = minX + (i + 0.5) / ppu;
        if (shapes.some((s) => depthIn(s, x, z) > 0)) {
          const k = (j * w + i) * 4;
          img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        }
        img.data[(j * w + i) * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const soft = document.createElement('canvas');
    soft.width = w;
    soft.height = h;
    const sg = soft.getContext('2d')!;
    sg.filter = 'blur(4px)';
    sg.drawImage(raw, 0, 0);
    const tex = new THREE.CanvasTexture(soft);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private material(kind: LiquidKind, o: { mask?: THREE.Texture; rect?: THREE.Vector4; shore?: boolean; full?: boolean }) {
    const look = LOOK[kind];
    const s = this.terrain.def.shore;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uMask: { value: o.mask ?? null },
        uRect: { value: o.rect ?? new THREE.Vector4(0, 0, 1, 1) },
        uUseMask: { value: o.mask ? 1 : 0 },
        uFull: { value: o.full ? 1 : 0 },
        uUseShore: { value: o.shore ? 1 : 0 },
        uShore: { value: new THREE.Vector4(s?.z ?? 0, s?.amp ?? 0, s?.seed ?? 0, 0) },
        uLava: { value: kind === 'lava' ? 1 : 0 },
        uDeep: { value: new THREE.Vector3(...look.deep) },
        uShallow: { value: new THREE.Vector3(...look.shallow) },
        uFoam: { value: new THREE.Vector3(...look.foam) },
      },
    });
    this.mats.push(mat);
    return mat;
  }

  update(time: number) {
    for (const m of this.mats) m.uniforms.uTime.value = time;
    if (this.seaMat && this.terrain.def.shore) {
      // Same tide as the gameplay shoreline.
      const s = this.terrain.def.shore;
      (this.seaMat.uniforms.uShore.value as THREE.Vector4).w = s.tide * (0.5 - 0.5 * Math.cos((2 * Math.PI * this.terrain.time) / s.period));
    }
  }
}
