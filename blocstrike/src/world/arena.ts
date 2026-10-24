import * as THREE from 'three';
import { damp, rand } from '@engine/math';
import type { Particles } from '@engine/particles';
import type { ArenaDef, LiquidKind, Theme } from '../data/arenas';
import { SFX } from '../data/sounds';
import { Terrain, type BridgeState, type GateState, type Prop } from './terrain';
import { buildGround } from './ground';
import { Liquids } from './liquids';
import { Critters } from './critters';
import { makeProp, makeRemains, type PropModel } from './props';

const LIGHTS: Record<Theme, { sky: number; ground: number; hemi: number; sun: number; sunI: number }> = {
  meadow: { sky: 0xd8ecff, ground: 0x40582c, hemi: 1.5, sun: 0xfff0d8, sunI: 2.8 },
  volcano: { sky: 0xffb08a, ground: 0x3a1a10, hemi: 1.1, sun: 0xffc090, sunI: 2.2 },
  jungle: { sky: 0xd8f0c8, ground: 0x203a18, hemi: 1.3, sun: 0xfff2c8, sunI: 2.6 },
  beach: { sky: 0xe0f4ff, ground: 0xa89060, hemi: 1.1, sun: 0xfff6e0, sunI: 2.2 },
};

interface PropView {
  prop: Prop;
  model: PropModel;
  fade: number;
  remains: THREE.Object3D | null;
}

interface BridgeView {
  state: BridgeState;
  halves: THREE.Group[];
  mats: THREE.MeshStandardMaterial[];
}

interface GateView {
  state: GateState;
  mesh: THREE.Group;
}

function bridgeHalf(style: BridgeState['style'], length: number, width: number) {
  const g = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const m = (color: number) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
    mats.push(mat);
    return mat;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  if (style === 'stone') {
    add(new THREE.BoxGeometry(length, 0.3, width), m(0x8a7f74), 0, 0, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(length, 0.22, 0.18), m(0x6d635a), 0, 0.2, s * (width / 2 - 0.09));
  } else if (style === 'wood') {
    const plank = m(0xa47448);
    const n = Math.max(2, Math.round(length / 0.42));
    for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(0.36, 0.1, width), plank, -length / 2 + (i + 0.5) * (length / n), 0.05, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(length, 0.12, 0.12), m(0x7a5530), 0, -0.05, s * (width / 2 - 0.15));
  } else {
    const n = Math.max(2, Math.round(width / 0.36));
    const log = m(0x7b5532);
    for (let i = 0; i < n; i++) {
      const o = add(new THREE.CylinderGeometry(0.18, 0.18, length, 8), log, 0, 0.05, -width / 2 + (i + 0.5) * (width / n));
      o.rotation.z = Math.PI / 2;
    }
  }
  return { g, mats };
}

/** One arena: its rules (Terrain) plus everything you see. */
export class Arena {
  readonly group = new THREE.Group();
  readonly terrain: Terrain;
  readonly background: number;
  /** Menu demo: no sounds from gates and breaking things. */
  muted = false;
  private critters: Critters;
  private liquids: Liquids;
  private grassUniforms: { uTime: { value: number } } | null;
  private propViews: PropView[] = [];
  private bridges: BridgeView[] = [];
  private gates: GateView[] = [];
  private navT = 0;

  constructor(readonly def: ArenaDef, private particles: Particles, private glow: Particles) {
    this.terrain = new Terrain(def);
    const L = LIGHTS[def.theme];
    this.group.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemi));
    const sun = new THREE.DirectionalLight(L.sun, L.sunI);
    sun.position.set(-14, 30, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -def.halfW - 4; sc.right = def.halfW + 4; sc.top = def.halfD + 8; sc.bottom = -def.halfD - 8;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun);

    const ground = buildGround(this.terrain);
    this.group.add(ground.group);
    this.grassUniforms = ground.grassUniforms;
    this.background = ground.background;

    this.liquids = new Liquids(this.terrain);
    this.group.add(this.liquids.group);
    this.critters = new Critters(this.terrain, particles, glow);
    this.group.add(this.critters.group);

    for (const prop of this.terrain.props) {
      const model = makeProp(prop.kind, prop.r, def.decoSeed * 100 + prop.id, def.theme);
      model.group.position.set(prop.x, 0, prop.z);
      this.group.add(model.group);
      this.propViews.push({ prop, model, fade: 1, remains: null });
    }

    for (const state of this.terrain.bridges) {
      const b = state.box;
      const halves: THREE.Group[] = [];
      const mats: THREE.MeshStandardMaterial[] = [];
      // Moving bridges are two halves that slide back into each bank.
      const parts = state.moving ? 2 : 1;
      for (let i = 0; i < parts; i++) {
        const len = (b.hl * 2) / parts;
        const h = bridgeHalf(state.style, len, b.ht * 2);
        const holder = new THREE.Group();
        holder.add(h.g);
        h.g.position.x = parts === 2 ? (i === 0 ? -len / 2 : len / 2) : 0;
        holder.position.set(b.x, 0.12, b.z);
        holder.rotation.y = -b.angle;
        this.group.add(holder);
        halves.push(h.g);
        mats.push(...h.mats);
      }
      this.bridges.push({ state, halves, mats });
    }

    for (const state of this.terrain.gates) {
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ color: 0x8c8a78, roughness: 0.9, flatShading: true });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(state.box.hl * 2, 1.7, state.box.ht * 2), stone);
      wall.position.y = 0.85;
      wall.castShadow = wall.receiveShadow = true;
      g.add(wall);
      // Carved rings so it reads as an old temple gate.
      for (const x of [-state.box.hl * 0.55, state.box.hl * 0.55]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5d8a3a, roughness: 1 }));
        ring.position.set(x, 1.0, state.box.ht + 0.01);
        g.add(ring);
      }
      g.position.set(state.box.x, -1.8, state.box.z);
      g.rotation.y = -state.box.angle;
      this.group.add(g);
      this.gates.push({ state, mesh: g });
    }
  }

  deadlyAt(x: number, z: number) {
    return this.terrain.deadlyAt(x, z);
  }

  get nav() {
    return this.terrain.nav;
  }

  /** Somebody fell into a liquid. */
  swallow(kind: LiquidKind, x: number, z: number, color: number, sound: boolean) {
    this.critters.feed(kind, x, z, color, sound);
  }

  /** Props an explosion destroyed or flames burned down: swap them for remains, with a crash. */
  destroyed(props: Prop[]) {
    for (const p of props) {
      const v = this.propViews.find((pv) => pv.prop === p);
      if (!v) continue;
      v.model.group.visible = false;
      v.remains = makeRemains(p.kind, p.r, v.model.debris);
      v.remains.position.set(p.x, 0, p.z);
      this.group.add(v.remains);
      this.particles.burst({ x: p.x, y: 1, z: p.z, count: 26, color: v.model.debris, speed: 4, up: 6, size: 0.2, life: 1.2 });
      if (!this.muted) (p.kind === 'rock' || p.kind === 'pillar' || p.kind === 'sandcastle' ? SFX.rockBreak : SFX.treeBreak)();
    }
  }

  reset() {
    this.terrain.reset();
    for (const v of this.propViews) {
      v.model.group.visible = true;
      v.remains?.removeFromParent();
      v.remains = null;
    }
    this.critters.clear();
  }

  /** Game time passes: gates, bridges and tide move; paths are refreshed. Called by the match each tick. */
  step(dt: number) {
    const events = this.terrain.update(dt);
    if (!this.muted) for (const e of events) (e === 'gate' ? SFX.gate : SFX.bridge)();
    for (const p of this.terrain.props) if (p.alive && p.burn > 0) p.burn = Math.max(0, p.burn - dt * 0.3);
    // Fresh paths for computer players when something changed (not more than ~3 times a second).
    this.navT -= dt;
    if (this.terrain.navDirty && this.navT <= 0) {
      this.terrain.rebuildNav();
      this.navT = 0.3;
    }
  }

  /** Drawing only. */
  update(dt: number, time: number, actors: { x: number; z: number }[]) {
    if (this.grassUniforms) this.grassUniforms.uTime.value = time;
    this.liquids.update(time);
    this.critters.update(dt);

    for (const v of this.propViews) {
      const p = v.prop;
      if (p.alive && p.burn > 0 && Math.random() < 0.5) {
        // On fire.
        this.glow.burst({ x: p.x + rand(-0.4, 0.4), y: v.model.top * rand(0.4, 1), z: p.z + rand(-0.4, 0.4), count: 1, color: 0xff8a2a, intensity: 2.5, speed: 0.5, up: 2, size: 0.2, life: 0.5, gravity: -2 });
      }
      if (!v.model.canopy.length) continue;
      // Someone just "above" the tree on screen is hidden by the canopy: fade it.
      const behind = p.alive && actors.some((a) => Math.abs(a.x - p.x) < 2.2 && a.z < p.z + 0.3 && a.z > p.z - 3.6);
      v.fade = damp(v.fade, behind ? 0.3 : 1, 8, dt);
      for (const m of v.model.canopy) {
        m.opacity = v.fade;
        m.depthWrite = v.fade > 0.95;
      }
    }

    for (const b of this.bridges) {
      if (!b.state.moving) continue;
      const slide = b.state.box.hl * (1 - b.state.ext);
      const sunk = (1 - b.state.ext) * 0.5;
      b.halves.forEach((h, i) => {
        const base = i === 0 ? -b.state.box.hl / 2 : b.state.box.hl / 2;
        h.position.set(base + (i === 0 ? -slide : slide), -sunk, 0);
      });
      // Flashing red before it pulls apart.
      const warn = b.state.warn && Math.sin(time * 14) > 0 ? 0.6 : 0;
      for (const m of b.mats) m.emissive.setRGB(warn, warn * 0.15, 0);
    }

    for (const g of this.gates) {
      const s = g.state;
      const shake = s.warn ? Math.sin(time * 40) * 0.03 : 0;
      g.mesh.position.set(s.box.x + shake, -1.8 + s.h * 1.8 + (s.warn ? 0.05 : 0), s.box.z);
      if (s.warn && Math.random() < 0.3) {
        this.particles.burst({ x: s.box.x + rand(-1, 1), y: 0.1, z: s.box.z + rand(-0.3, 0.3), count: 1, color: 0xa89878, speed: 1, up: 1.5, size: 0.15, life: 0.6 });
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
