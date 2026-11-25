// The dark: only what you can see from where you are is lit (round you, as far as the hedges let you
// see); places you've seen stay faintly visible (you remember them); the rest is nearly black. Every
// material in the scene is darkened by where it is on a picture of the maze (one texel per 40 cm),
// so hedges, ground, the ruby, the monster (later) all fade into the dark the same way. The same
// "seen" record fills in the map.
import * as THREE from 'three';
import type { MazeWorld } from './maze';

const RES = 0.4;
/** How far you can see (metres), and how bright remembered and unseen places are. */
export const SIGHT = 7.5;
const SEEN = 0.28, UNSEEN = 0;

const uniforms = {
  uVis: { value: null as THREE.Texture | null },
  uVisOrigin: { value: new THREE.Vector2() },
  uVisSize: { value: new THREE.Vector2(1, 1) },
  uNoDark: { value: 0 },
};

/** Lights on everywhere (the fight arena isn't in the maze's dark). */
export function setDarkOff(on: boolean) {
  uniforms.uNoDark.value = on ? 1 : 0;
}

/** Teach a material to fade into the dark by where it is. */
export function darken(m: THREE.Material) {
  if (m.userData.dark || !(m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshStandardMaterial)) return;
  if ((m as THREE.MeshBasicMaterial).fog === false) return;
  m.userData.dark = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDarkPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 dwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    dwp = instanceMatrix * dwp;
  #endif
  vDarkPos = (modelMatrix * dwp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDarkPos;\nuniform sampler2D uVis;\nuniform vec2 uVisOrigin;\nuniform vec2 uVisSize;\nuniform float uNoDark;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float vis = max(uNoDark, texture2D(uVis, (vDarkPos.xz - uVisOrigin) / uVisSize).r);
  // (Nearly black whatever it is: bright castle stone mustn't show the maze's shape in the dark.)
  vec3 night = min(gl_FragColor.rgb, vec3(1.0)) * vec3(0.0025, 0.0028, 0.006) + vec3(0.004, 0.004, 0.01);
  gl_FragColor.rgb = mix(night, gl_FragColor.rgb, vis);`);
  };
  m.customProgramCacheKey = () => 'dark';
  m.needsUpdate = true;
}

export function darkenAll(root: THREE.Object3D) {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) darken(m);
  });
}

export class Darkness {
  private nx: number;
  private nz: number;
  private ox: number;
  private oz: number;
  private data: Uint8Array;
  private now: Float32Array;
  private seen: Uint8Array;
  private tex: THREE.DataTexture;
  private lastX = Infinity;
  private lastZ = Infinity;
  private target: Float32Array;

  constructor(private world: MazeWorld) {
    const M = 6;
    this.ox = -M;
    this.oz = -M;
    this.nx = Math.ceil((world.width + 2 * M) / RES);
    this.nz = Math.ceil((world.depth + 2 * M + 6) / RES);
    const n = this.nx * this.nz;
    this.data = new Uint8Array(n * 4).fill(255);
    this.now = new Float32Array(n).fill(UNSEEN);
    this.target = new Float32Array(n).fill(UNSEEN);
    this.seen = new Uint8Array(n);
    this.tex = new THREE.DataTexture(this.data, this.nx, this.nz, THREE.RGBAFormat);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    uniforms.uVis.value = this.tex;
    uniforms.uVisOrigin.value.set(this.ox, this.oz);
    uniforms.uVisSize.value.set(this.nx * RES, this.nz * RES);
    this.write();
  }

  /** Has this spot ever been seen? (For the map.) */
  wasSeen(x: number, z: number) {
    const i = Math.floor((x - this.ox) / RES), j = Math.floor((z - this.oz) / RES);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    return this.seen[j * this.nx + i] === 1;
  }

  /** Forget what you'd seen round here (the maze has changed there). */
  forget(x: number, z: number, r: number) {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const cx = this.ox + (i + 0.5) * RES, cz = this.oz + (j + 0.5) * RES;
      if (Math.hypot(cx - x, cz - z) < r) { const k = j * this.nx + i; this.seen[k] = 0; this.target[k] = UNSEEN; }
    }
    this.lastX = Infinity;
  }

  /** Is there a clear line from a to b (no hedge in between)? The end itself may be a hedge's face. */
  clearLine(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      // Stop just short of the end: the hedge you're looking at is lit, the one behind it isn't.
      if (d * (1 - k / n) < 0.3) break;
      if (this.world.solidAt(x, z)) return false;
    }
    return true;
  }

  /** Light up what can be seen from here (eyes at x, z); then ease everything toward how lit it should be. */
  update(dt: number, x: number, z: number, light = 1) {
    if (Math.hypot(x - this.lastX, z - this.lastZ) > 0.12) {
      this.lastX = x;
      this.lastZ = z;
      const { nx, nz, ox, oz } = this;
      for (let k = 0; k < this.target.length; k++) this.target[k] = this.seen[k] ? SEEN : UNSEEN;
      const r = SIGHT * light;
      const i0 = Math.max(0, Math.floor((x - r - ox) / RES)), i1 = Math.min(nx - 1, Math.ceil((x + r - ox) / RES));
      const j0 = Math.max(0, Math.floor((z - r - oz) / RES)), j1 = Math.min(nz - 1, Math.ceil((z + r - oz) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = ox + (i + 0.5) * RES, cz = oz + (j + 0.5) * RES, d = Math.hypot(cx - x, cz - z);
        if (d > r || !this.clearLine(x, z, cx, cz)) continue;
        const k = j * nx + i;
        this.seen[k] = 1;
        // Bright near you, fading toward the edge of sight.
        const fall = 1 - Math.max(0, (d - r * 0.55) / (r * 0.45));
        this.target[k] = Math.max(SEEN, fall * fall * (3 - 2 * fall));
      }
    }
    // Ease: quick to light, slower to fade.
    let changed = false;
    for (let k = 0; k < this.now.length; k++) {
      const t = this.target[k], v = this.now[k];
      if (Math.abs(t - v) < 0.003) continue;
      this.now[k] = v + (t - v) * Math.min(1, dt * (t > v ? 10 : 3));
      changed = true;
    }
    if (changed) this.write();
  }

  private write() {
    for (let k = 0; k < this.now.length; k++) this.data[k * 4] = Math.round(this.now[k] * 255);
    this.tex.needsUpdate = true;
  }
}
