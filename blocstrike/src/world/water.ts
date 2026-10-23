import * as THREE from 'three';
import { shoreAt, waterDepthFactor, type WaterDef } from '../data/arenas';
import { rand } from '@engine/math';
import type { Particles } from '@engine/particles';
import { SFX } from '../data/sounds';

const WATER_Y = 0.03;

/** Radial mesh following the wobbly shoreline; attribute `edge` goes 0 (centre) → 1 (shore) → `outer`. */
function pondGeometry(w: WaterDef, rings: number, segs: number, from: number, to: number) {
  const pos: number[] = [];
  const edge: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const e = from + ((to - from) * r) / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const k = shoreAt(w, a) * e;
      pos.push(Math.cos(a) * w.rx * k, 0, Math.sin(a) * w.rz * k);
      edge.push(e);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * segs + s, b = r * segs + ((s + 1) % segs);
      const c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeFish() {
  const g = new THREE.Group();
  const back = new THREE.MeshStandardMaterial({ color: 0x55636b, roughness: 0.4, metalness: 0.3, flatShading: true });
  const belly = new THREE.MeshStandardMaterial({ color: 0xe0392b, roughness: 0.5, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), back);
  body.scale.set(0.55, 0.85, 1);
  g.add(body);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), belly);
  jaw.scale.set(0.5, 0.6, 0.9);
  jaw.position.set(0, -0.1, 0.08);
  g.add(jaw);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), white);
    t.position.set(-0.07 + i * 0.045, -0.02, 0.27);
    t.rotation.x = Math.PI;
    g.add(t);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), white);
    eye.position.set(side * 0.14, 0.08, 0.15);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), black);
    pupil.position.set(side * 0.03, 0, 0.03);
    eye.add(pupil);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), back);
  tail.scale.set(0.25, 1, 1);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.38;
  g.add(tail);
  g.traverse((o) => (o.castShadow = true));
  g.scale.setScalar(1.6);
  return g;
}

interface Jump {
  fish: THREE.Group;
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  active: boolean;
  bitten: boolean;
  color: number;
}

/** A pond with its piranhas: fins circling in the water, and a feeding frenzy when someone falls in. */
export class Pond {
  readonly group = new THREE.Group();
  private uniforms = { uTime: { value: 0 } };
  private fins: { mesh: THREE.Mesh; radius: number; speed: number; phase: number }[] = [];
  private jumps: Jump[] = [];
  private pending: { at: number; x: number; z: number; color: number }[] = [];
  private time = 0;

  constructor(readonly def: WaterDef, private particles: Particles) {
    this.group.position.set(def.x, 0, def.z);

    // Sandy bank around the water.
    const sand = new THREE.Mesh(
      pondGeometry(def, 3, 96, 0.96, 1.2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float edge; varying float vEdge;
          void main() { vEdge = edge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying float vEdge;
          void main() {
            float a = 1.0 - smoothstep(1.08, 1.2, vEdge);
            gl_FragColor = vec4(vec3(0.86, 0.76, 0.52) * 0.9, a);
            #include <colorspace_fragment>
          }`,
      }),
    );
    sand.position.y = 0.012;
    sand.receiveShadow = true;
    this.group.add(sand);

    const water = new THREE.Mesh(
      pondGeometry(def, 16, 128, 0, 1),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          attribute float edge; varying float vEdge; varying vec3 vWorld;
          void main() {
            vEdge = edge;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying float vEdge; varying vec3 vWorld;
          float wave(vec2 p) {
            return sin(p.x * 1.7 + uTime * 1.3) * 0.5 + sin(p.y * 2.3 - uTime * 1.1) * 0.5
                 + sin((p.x + p.y) * 3.1 + uTime * 2.0) * 0.35;
          }
          void main() {
            vec2 p = vWorld.xz;
            vec3 deep = vec3(0.05, 0.28, 0.38);
            vec3 shallow = vec3(0.22, 0.66, 0.72);
            vec3 col = mix(deep, shallow, smoothstep(0.2, 1.0, vEdge));
            float w = wave(p) + wave(p * 1.9 + 4.0) * 0.5;
            float caustic = smoothstep(1.0, 1.35, w);
            col += caustic * 0.18;
            // Sparkles bright enough to catch the bloom.
            float spark = smoothstep(1.55, 1.7, w + sin(p.x * 9.0 + uTime * 3.0) * 0.2);
            col += spark * vec3(1.6, 1.8, 1.9);
            // Foam line along the shore.
            float foam = smoothstep(0.86, 0.96, vEdge + sin(atan(p.y, p.x) * 18.0 + uTime * 2.0) * 0.015);
            col = mix(col, vec3(0.95), foam * 0.85);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    water.position.y = WATER_Y;
    this.group.add(water);

    // Fins cutting through the surface.
    const finGeo = new THREE.ConeGeometry(0.14, 0.32, 3);
    finGeo.scale(0.35, 1, 1);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x3d474d, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(finGeo, finMat);
      this.group.add(mesh);
      this.fins.push({ mesh, radius: 0.3 + i * 0.13, speed: (0.4 + Math.random() * 0.3) * (i % 2 ? 1 : -1), phase: Math.random() * 6 });
    }
    for (let i = 0; i < 8; i++) {
      const fish = makeFish();
      fish.visible = false;
      this.group.add(fish);
      this.jumps.push({ fish, t: 0, dur: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), active: false, bitten: false, color: 0 });
    }
  }

  contains(x: number, z: number) {
    // A little inside the shoreline, so touching the foam isn't instant death.
    return waterDepthFactor(this.def, x, z) < 0.93;
  }

  /** Piranhas leap at (x, z) a few times. `color` tints the bites flying off. */
  feed(x: number, z: number, color: number, sound = true) {
    if (sound) {
      SFX.splash();
      SFX.chomp();
    }
    for (let i = 0; i < 7; i++) this.pending.push({ at: this.time + i * 0.16, x, z, color });
    this.particles.burst({ x, y: 0.2, z, count: 30, color: 0xe8fbff, speed: 3, up: 6, size: 0.14, life: 0.9 });
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const d = this.def;
    for (const f of this.fins) {
      const a = this.time * f.speed + f.phase;
      const x = Math.cos(a) * d.rx * f.radius, z = Math.sin(a) * d.rz * f.radius;
      f.mesh.position.set(x, WATER_Y + 0.1 + Math.sin(this.time * 2 + f.phase) * 0.04, z);
      f.mesh.rotation.y = -a + (f.speed > 0 ? 0 : Math.PI);
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > this.time) continue;
      this.pending.splice(i, 1);
      const j = this.jumps.find((j) => !j.active);
      if (!j) continue;
      const lx = p.x - d.x, lz = p.z - d.z;
      const a = Math.random() * Math.PI * 2;
      j.from.set(lx + Math.cos(a) * 1.6, -0.3, lz + Math.sin(a) * 1.6);
      j.to.set(lx + rand(-0.25, 0.25), 0.35, lz + rand(-0.25, 0.25));
      j.t = 0;
      j.dur = 0.42;
      j.active = true;
      j.bitten = false;
      j.color = p.color;
      j.fish.visible = true;
    }

    for (const j of this.jumps) {
      if (!j.active) continue;
      j.t += dt;
      const k = j.t / j.dur;
      if (k >= 1.6) {
        j.active = false;
        j.fish.visible = false;
        this.particles.burst({ x: d.x + j.to.x, y: 0.1, z: d.z + j.to.z, count: 8, color: 0xe8fbff, speed: 2, up: 3, size: 0.1 });
        continue;
      }
      // Leap in, bite, then dive past and back into the water.
      const pos = j.fish.position.lerpVectors(j.from, j.to, k);
      pos.y = THREE.MathUtils.lerp(j.from.y, j.to.y, Math.min(k, 1)) + Math.sin(Math.min(k, 1.6) / 1.6 * Math.PI) * 0.7 - (k > 1 ? (k - 1) * 1.2 : 0);
      const dir = new THREE.Vector3().subVectors(j.to, j.from);
      j.fish.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      j.fish.rotateX(-Math.cos((k / 1.6) * Math.PI) * 0.9);
      if (!j.bitten && k >= 1) {
        j.bitten = true;
        this.particles.burst({ x: d.x + j.to.x, y: 0.5, z: d.z + j.to.z, count: 6, color: j.color, speed: 2.5, up: 4, size: 0.16 });
      }
    }
  }

  clear() {
    this.pending.length = 0;
    for (const j of this.jumps) { j.active = false; j.fish.visible = false; }
  }
}
