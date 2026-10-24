import * as THREE from 'three';
import { rng } from '@engine/math';
import type { ArenaDef, Theme } from '../data/arenas';
import { GRASS, makeEdgeWall, makeFlowers, makeGrass } from './nature';
import type { Terrain } from './terrain';

// The walkable ground (a slab cut to the arena's outline), what surrounds it, and small decorations.

const MARGIN = 6;

interface ThemeLook {
  background: number;
  outer: number | null; // ground around the arena (null: lava or sea fills it)
  cliff: number;
  grass: keyof typeof GRASS | null;
  grassCount: number;
  flowers: number[];
  flowerCount: number;
}

export const THEME_LOOK: Record<Theme, ThemeLook> = {
  meadow: { background: 0x3d7a2c, outer: 0x3d7a2c, cliff: 0x5d4a35, grass: 'meadow', grassCount: 2000, flowers: [0xffffff, 0xfff176, 0xf48fb1, 0xce93d8], flowerCount: 120 },
  volcano: { background: 0x1a0d08, outer: null, cliff: 0x2a2220, grass: 'ash', grassCount: 300, flowers: [0xff7a20, 0xffb040], flowerCount: 60 },
  jungle: { background: 0x123a16, outer: 0x1c3d1e, cliff: 0x4a3a25, grass: 'jungle', grassCount: 1200, flowers: [0xff5252, 0xffab40, 0xe040fb, 0xffeb3b], flowerCount: 90 },
  beach: { background: 0x2a8fbf, outer: 0xc9ad74, cliff: 0xc9a86a, grass: 'beach', grassCount: 250, flowers: [0xffffff, 0xffc1cc, 0xffe0b2], flowerCount: 90 },
};

/** Paints the ground texture (and, for the volcano, a glow map for the cracks). */
function paint(def: ArenaDef) {
  const W = (def.halfW + MARGIN) * 2, D = (def.halfD + MARGIN) * 2;
  const w = 1024, h = Math.round((1024 * D) / W);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const r = rng(def.decoSeed);
  const toPx = (x: number, z: number): [number, number] => [((x + W / 2) / W) * w, ((z + D / 2) / D) * h];
  const speckle = (n: number, colors: string[], min: number, max: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = r.pick(colors);
      const s = min + r.next() * (max - min);
      g.fillRect(r.next() * w, r.next() * h, s, s);
    }
  };
  let glow: HTMLCanvasElement | null = null;

  switch (def.theme) {
    case 'meadow': {
      g.fillStyle = '#5aa83f';
      g.fillRect(0, 0, w, h);
      // Mowing stripes across the field.
      const [x0] = toPx(-def.halfW, 0), [x1] = toPx(def.halfW, 0);
      for (let i = 0; i < 11; i += 2) {
        g.fillStyle = 'rgba(255,255,200,0.07)';
        g.fillRect(x0 + ((x1 - x0) * i) / 11, 0, (x1 - x0) / 11, h);
      }
      speckle(9000, ['rgba(20,60,10,0.10)', 'rgba(200,255,140,0.07)'], 2, 8);
      break;
    }
    case 'volcano': {
      g.fillStyle = '#3a302c';
      g.fillRect(0, 0, w, h);
      speckle(9000, ['rgba(0,0,0,0.18)', 'rgba(120,100,90,0.12)', 'rgba(90,40,20,0.15)'], 2, 10);
      glow = document.createElement('canvas');
      glow.width = w;
      glow.height = h;
      const gg = glow.getContext('2d')!;
      gg.fillStyle = '#000';
      gg.fillRect(0, 0, w, h);
      // Branching glowing cracks.
      for (let i = 0; i < 40; i++) {
        let x = r.next() * w, y = r.next() * h, a = r.next() * Math.PI * 2;
        gg.strokeStyle = '#ff6a1a';
        g.strokeStyle = '#1a1210';
        gg.lineWidth = g.lineWidth = 1.5 + r.next() * 2;
        gg.beginPath(); g.beginPath();
        gg.moveTo(x, y); g.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          a += r.range(-0.7, 0.7);
          x += Math.cos(a) * 12; y += Math.sin(a) * 12;
          gg.lineTo(x, y); g.lineTo(x, y);
        }
        gg.stroke(); g.stroke();
      }
      break;
    }
    case 'jungle': {
      g.fillStyle = '#3f5a28';
      g.fillRect(0, 0, w, h);
      speckle(6000, ['rgba(90,70,30,0.35)', 'rgba(30,60,20,0.3)', 'rgba(120,150,60,0.2)'], 3, 14);
      // Leaf litter.
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = r.pick(['rgba(110,80,30,0.45)', 'rgba(150,110,40,0.35)', 'rgba(60,90,30,0.4)']);
        g.beginPath();
        g.ellipse(r.next() * w, r.next() * h, 4 + r.next() * 5, 2 + r.next() * 2, r.next() * 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'beach': {
      g.fillStyle = '#d8bd85';
      g.fillRect(0, 0, w, h);
      // Wind ripples.
      g.strokeStyle = 'rgba(180,150,90,0.18)';
      g.lineWidth = 2;
      for (let y = 0; y < h; y += 9) {
        g.beginPath();
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y * 0.1) * 3);
        g.stroke();
      }
      speckle(5000, ['rgba(160,130,80,0.15)', 'rgba(255,255,240,0.2)'], 1, 4);
      // Darker wet sand where the tide reaches.
      if (def.shore) {
        const [, y0] = toPx(0, def.shore.z - def.shore.amp - def.shore.tide - 1.5);
        const grd = g.createLinearGradient(0, y0, 0, h);
        grd.addColorStop(0, 'rgba(150,120,70,0)');
        grd.addColorStop(0.15, 'rgba(150,120,70,0.35)');
        grd.addColorStop(1, 'rgba(150,120,70,0.45)');
        g.fillStyle = grd;
        g.fillRect(0, y0, w, h - y0);
      }
      break;
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const glowTex = glow ? new THREE.CanvasTexture(glow) : null;
  if (glowTex) glowTex.colorSpace = THREE.SRGBColorSpace;
  return { tex, glowTex, W, D };
}

export function buildGround(terrain: Terrain) {
  const def = terrain.def;
  const look = THEME_LOOK[def.theme];
  const group = new THREE.Group();
  const { tex, glowTex, W, D } = paint(def);

  // Land slab: the outline extruded downwards, so islands get rocky cliffs.
  const shape = new THREE.Shape(terrain.landPoly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const depth = 1.2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depth, 0);
  // Map the texture by world position, the same way it was painted.
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, 1 - (pos.getZ(i) + D / 2) / D);
  const top = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.95,
    ...(glowTex ? { emissiveMap: glowTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.2 } : {}),
  });
  tex.flipY = true;
  const cliff = new THREE.MeshStandardMaterial({ color: look.cliff, roughness: 1, flatShading: true });
  const land = new THREE.Mesh(geo, [top, cliff]);
  land.receiveShadow = true;
  group.add(land);

  if (look.outer !== null) {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: look.outer, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    group.add(outer);
  }

  if (def.edge !== 'lava') {
    const skip = def.shore ? (x: number, z: number) => z > terrain.shoreZ(x, true) - 1 : undefined;
    group.add(makeEdgeWall(terrain.landPoly, def.decoSeed + 1, def.edge, skip));
  }

  // Grass tufts and flowers (or embers, or shells), kept off liquids, bridges and props.
  const r = rng(def.decoSeed + 7);
  const free = (x: number, z: number, pad: number) =>
    terrain.inLand(x, z) && terrain.liquidAt(x, z, -0.3, true) === null && !terrain.onBridge(x, z, 0.3) &&
    terrain.props.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + pad);
  const sample = (n: number, pad: number) => {
    const out: { x: number; z: number }[] = [];
    for (let tries = 0; out.length < n && tries < n * 20; tries++) {
      const x = r.range(-def.halfW, def.halfW), z = r.range(-def.halfD, def.halfD);
      if (free(x, z, pad)) out.push({ x, z });
    }
    return out;
  };
  let grassUniforms: { uTime: { value: number } } | null = null;
  if (look.grass) {
    const g = makeGrass(sample(look.grassCount, 0.1).map((p) => ({ ...p, s: r.range(0.6, 1.3) })), GRASS[look.grass]);
    grassUniforms = g.uniforms;
    group.add(g.mesh);
  }
  const flowers = makeFlowers(sample(look.flowerCount, 0.3).map((p) => ({ ...p, color: r.pick(look.flowers) })));
  if (def.theme === 'volcano') {
    // Embers glow instead of flowers.
    (flowers as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(2) });
  }
  group.add(flowers);

  return { group, grassUniforms, background: look.background };
}
