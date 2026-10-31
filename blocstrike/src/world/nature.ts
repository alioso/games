import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '@engine/math';

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

const TRUNK = flat(0x7a4a2a);
const LEAF_COLORS = [0x3f9a3a, 0x4caf3f, 0x2f8a3a, 0x5cbf45];

export interface Tree {
  group: THREE.Group;
  foliage: THREE.MeshStandardMaterial;
}

export function makeTree(r: number, seed: number): Tree {
  const rand = rng(seed);
  const group = new THREE.Group();
  const s = r / 0.75;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.32 * s, 1.5 * s, 7), TRUNK);
  trunk.position.y = 0.75 * s;
  trunk.castShadow = trunk.receiveShadow = true;
  group.add(trunk);
  // Every tree gets its own foliage material so it can fade when a bloc walks behind it.
  const foliage = flat(rand.pick(LEAF_COLORS), { transparent: true });
  const blobs = [
    [0, 2.0, 0, 1.15],
    [0.45, 2.45, 0.2, 0.85],
    [-0.4, 2.5, -0.15, 0.8],
    [0.05, 2.95, 0.05, 0.65],
  ];
  for (const [x, y, z, rad] of blobs) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * s, 1), foliage);
    m.position.set(x * s, y * s, z * s);
    m.rotation.set(rand.next() * 3, rand.next() * 3, 0);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  group.rotation.y = rand.next() * Math.PI * 2;
  return { group, foliage };
}

export function makeRock(r: number, seed: number, stoneColor = 0x8d939a, mossColor = 0x6f9a4a) {
  const rand = rng(seed);
  const geo = new THREE.DodecahedronGeometry(r * 1.05, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  // Merge duplicate vertices first so the displacement doesn't tear the surface open.
  const keyed = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!keyed.has(k)) keyed.set(k, 0.82 + rand.next() * 0.3);
    v.multiplyScalar(keyed.get(k)!);
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // Mossy tops: tint upward-facing faces green.
  const colors = new Float32Array(pos.count * 3);
  const n = geo.attributes.normal;
  const stone = new THREE.Color(stoneColor), moss = new THREE.Color(mossColor), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(stone).lerp(moss, THREE.MathUtils.smoothstep(n.getY(i), 0.55, 0.95) * 0.8);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, flat(0xffffff, { vertexColors: true }));
  mesh.position.y = r * 0.35;
  mesh.rotation.y = rand.next() * Math.PI * 2;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Instanced grass tufts that sway in the wind. */
export interface GrassLook {
  base: [number, number, number];
  tip: [number, number, number];
  height: number;
  width: number;
}

export const GRASS: Record<'meadow' | 'jungle' | 'beach' | 'ash', GrassLook> = {
  meadow: { base: [0.18, 0.42, 0.14], tip: [0.55, 0.85, 0.3], height: 0.42, width: 0.06 },
  jungle: { base: [0.08, 0.3, 0.1], tip: [0.3, 0.7, 0.25], height: 0.75, width: 0.14 },
  beach: { base: [0.55, 0.55, 0.3], tip: [0.75, 0.8, 0.45], height: 0.5, width: 0.04 },
  ash: { base: [0.15, 0.12, 0.1], tip: [0.35, 0.3, 0.22], height: 0.3, width: 0.05 },
};

export function makeGrass(points: { x: number; z: number; s: number }[], look: GrassLook = GRASS.meadow) {
  const blade = (angle: number, lean: number) => {
    const g = new THREE.BufferGeometry();
    const w = look.width, h = look.height;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, lean, h, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([...look.base, ...look.base, ...look.tip], 3));
    g.computeVertexNormals();
    g.rotateY(angle);
    return g;
  };
  const tuft = mergeGeometries([blade(0, 0.05), blade(2.1, -0.08), blade(4.2, 0.1), blade(1.0, 0.0)]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 1.8 + wp.x * 0.35 + wp.z * 0.25) * 0.12 + sin(uTime * 3.1 + wp.x) * 0.03;
         transformed.x += sway * position.y * 2.0;`,
      );
  };
  const mesh = new THREE.InstancedMesh(tuft, mat, points.length);
  const d = new THREE.Object3D();
  points.forEach((p, i) => {
    d.position.set(p.x, 0, p.z);
    d.rotation.y = (p.x * 13.7 + p.z * 7.1) % (Math.PI * 2);
    d.scale.setScalar(p.s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}

/** Little flowers: a stem-less coloured blob, instanced. */
export function makeFlowers(points: { x: number; z: number; color: number }[]) {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
    points.length,
  );
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  points.forEach((p, i) => {
    d.position.set(p.x, 0.12, p.z);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, c.set(p.color));
  });
  return mesh;
}

/** A wall of bushy balls (or sand dunes) just outside the arena outline. */
/** Edge styles: walls of bushes/jungle/dunes/rocks outside the arena, or puffy cloud rims under island edges. */
export type EdgeStyle = 'hedge' | 'jungle' | 'dunes' | 'rocks' | 'cloud';

export function makeEdgeWall(poly: [number, number][], seed: number, style: EdgeStyle, skip?: (x: number, z: number) => boolean) {
  const rand = rng(seed);
  const pts: { x: number; z: number; r: number }[] = [];
  const out = style === 'jungle' ? 1.3 : style === 'cloud' ? -0.2 : style === 'rocks' ? 1.1 : 1.0;
  const spacing = style === 'jungle' ? 1.0 : style === 'cloud' ? 0.7 : 0.8;
  // Walk the outline at a fixed spacing, pushing each ball outward along the edge normal.
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const len = Math.hypot(bx - ax, bz - az);
    // Outward normal for a counter-clockwise outline (as seen from above, z pointing down the screen).
    const nx = (bz - az) / len, nz = -(bx - ax) / len;
    for (let d = carry; d < len; d += spacing) {
      const t = d / len;
      const x = ax + (bx - ax) * t + nx * out + rand.range(-0.15, 0.15);
      const z = az + (bz - az) * t + nz * out + rand.range(-0.15, 0.15);
      if (skip?.(x, z)) continue;
      pts.push({ x, z, r: style === 'jungle' ? rand.range(0.9, 1.4) : style === 'cloud' ? rand.range(0.6, 1.0) : style === 'rocks' ? rand.range(0.7, 1.1) : rand.range(0.55, 0.8) });
    }
    carry = (carry - len) % spacing;
    if (carry < 0) carry += spacing;
  }
  const palette = style === 'jungle' ? [0x1b5e20, 0x2e7d32, 0x145a1c, 0x236b28]
    : style === 'dunes' ? [0xcdb07a, 0xc4a670, 0xd6ba84]
    : style === 'rocks' ? [0xb08b5e, 0x9c7a50, 0xc29d6c, 0x8a6b45]
    : style === 'cloud' ? [0xe6ecf6, 0xd8e2f2, 0xeef2fa] : [0x2e7d32, 0x388e3c, 0x2b6e2f, 0x43a047];
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flat(0xffffff), pts.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  pts.forEach((p, i) => {
    // Cloud rims hang just below the island's edge, like the fluffy underside of a cloud.
    d.position.set(p.x, style === 'cloud' ? -0.35 : p.r * (style === 'dunes' ? 0.15 : 0.55), p.z);
    d.rotation.set(rand.next() * 3, rand.next() * 3, 0);
    d.scale.set(p.r, p.r * (style === 'dunes' ? 0.5 : 0.85), p.r);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, c.set(rand.pick(palette)));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
