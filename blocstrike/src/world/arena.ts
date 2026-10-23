import * as THREE from 'three';
import { allObstacles, inWater, type ArenaDef, type ObstacleDef } from '../data/arenas';
import { damp, rng } from '@engine/math';
import { NavGrid } from '@engine/navgrid';
import type { Particles } from '@engine/particles';
import { makeFlowers, makeGrass, makeHedge, makeRock, makeTree } from './nature';
import { Pond } from './water';
import { TUNING } from '../data/tuning';

function fieldTexture(a: ArenaDef) {
  const W = 1024, H = Math.round((1024 * a.halfD) / a.halfW);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#5aa83f';
  g.fillRect(0, 0, W, H);
  // Mowing stripes.
  const stripes = 11;
  for (let i = 0; i < stripes; i++) {
    if (i % 2) continue;
    g.fillStyle = 'rgba(255,255,200,0.07)';
    g.fillRect((i * W) / stripes, 0, W / stripes, H);
  }
  const r = rng(a.decoSeed);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r.next() < 0.5 ? 'rgba(20,60,10,0.10)' : 'rgba(200,255,140,0.07)';
    const s = 2 + r.next() * 6;
    g.fillRect(r.next() * W, r.next() * H, s, s);
  }
  // Soft darker border.
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,40,0,0.18)');
  grd.addColorStop(0.06, 'rgba(0,40,0,0)');
  grd.addColorStop(0.94, 'rgba(0,40,0,0)');
  grd.addColorStop(1, 'rgba(0,40,0,0.18)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface Obstacle extends ObstacleDef {
  /** Tree foliage fades when someone walks behind it so you never lose sight of your bloc. */
  foliage?: THREE.MeshStandardMaterial;
  fade: number;
}

/** The static world of one arena: ground, nature, ponds, lights. */
export class Arena {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[];
  readonly ponds: Pond[];
  readonly nav: NavGrid;
  private grassUniforms: { uTime: { value: number } };

  constructor(readonly def: ArenaDef, particles: Particles) {
    const { halfW, halfD } = def;

    // Lights.
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x40582c, 1.5);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
    sun.position.set(-14, 30, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -halfW - 4; sc.right = halfW + 4; sc.top = halfD + 8; sc.bottom = -halfD - 8;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.group.add(sun);

    // Ground: the mowed field, and darker grass all around to fill any screen shape.
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x3d7a2c, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    this.group.add(outer);
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2 + 1, halfD * 2 + 1),
      new THREE.MeshStandardMaterial({ map: fieldTexture(def), roughness: 0.95 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    this.group.add(field);

    this.group.add(makeHedge(halfW, halfD, def.decoSeed + 1));

    // Ponds.
    this.ponds = def.water.map((w) => {
      const p = new Pond(w, particles);
      this.group.add(p.group);
      return p;
    });

    // Trees and rocks.
    this.obstacles = allObstacles(def).map((o, i) => {
      const ob: Obstacle = { ...o, fade: 1 };
      if (o.kind === 'tree') {
        const t = makeTree(o.r, def.decoSeed * 100 + i);
        t.group.position.set(o.x, 0, o.z);
        this.group.add(t.group);
        ob.foliage = t.foliage;
      } else {
        const rock = makeRock(o.r, def.decoSeed * 100 + i);
        rock.position.x = o.x;
        rock.position.z = o.z;
        this.group.add(rock);
      }
      return ob;
    });

    // Grass tufts and flowers, kept off water and obstacles.
    const r = rng(def.decoSeed + 7);
    const free = (x: number, z: number, pad: number) =>
      !inWater(def, x, z, -0.12) && this.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + pad);
    const grass: { x: number; z: number; s: number }[] = [];
    while (grass.length < 2000) {
      const x = r.range(-halfW - 0.3, halfW + 0.3), z = r.range(-halfD - 0.3, halfD + 0.3);
      if (free(x, z, 0.1)) grass.push({ x, z, s: r.range(0.6, 1.3) });
    }
    const g = makeGrass(grass);
    this.grassUniforms = g.uniforms;
    this.group.add(g.mesh);
    const flowers: { x: number; z: number; color: number }[] = [];
    while (flowers.length < 120) {
      const x = r.range(-halfW, halfW), z = r.range(-halfD, halfD);
      if (free(x, z, 0.3)) flowers.push({ x, z, color: r.pick([0xffffff, 0xfff176, 0xf48fb1, 0xce93d8]) });
    }
    this.group.add(makeFlowers(flowers));

    // Path-finding grid for computer players: water (with a safety margin) and obstacles are walls.
    const rad = TUNING.bloc.radius + 0.15;
    this.nav = new NavGrid(-halfW, -halfD, halfW * 2, halfD * 2, 0.5);
    this.nav.mark((x, z) =>
      inWater(def, x, z, -0.22) ||
      Math.abs(x) > halfW - rad || Math.abs(z) > halfD - rad ||
      this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad),
    );
  }

  pondAt(x: number, z: number) {
    return this.ponds.find((p) => p.contains(x, z)) ?? null;
  }

  update(dt: number, time: number, actors: { x: number; z: number }[]) {
    this.grassUniforms.uTime.value = time;
    for (const p of this.ponds) p.update(dt);
    for (const o of this.obstacles) {
      if (!o.foliage) continue;
      // Someone just "above" the tree on screen is hidden by the canopy: fade it.
      const behind = actors.some((a) => Math.abs(a.x - o.x) < 2.2 && a.z < o.z + 0.3 && a.z > o.z - 3.6);
      o.fade = damp(o.fade, behind ? 0.3 : 1, 8, dt);
      o.foliage.opacity = o.fade;
      o.foliage.depthWrite = o.fade > 0.95;
    }
  }
}
