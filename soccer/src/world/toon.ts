// The comic look (same as Floor Step): flat banded shading; the ink outlines come from the post effect.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const gradient = (() => {
  const steps = [90, 160, 220, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared flat-shaded material for a colour (cached: don't mutate it, use toonOwn for that). */
export function toon(color: THREE.ColorRepresentation, emissive = 0): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}:${emissive}`;
  let m = cache.get(key);
  if (!m) {
    m = toonOwn(color, emissive);
    cache.set(key, m);
  }
  return m;
}

export function toonOwn(color: THREE.ColorRepresentation, emissive = 0, map?: THREE.Texture) {
  const c = new THREE.Color(color);
  return new THREE.MeshToonMaterial({
    color: c,
    gradientMap: gradient,
    map: map ?? null,
    emissive: emissive ? c.clone().multiplyScalar(emissive) : new THREE.Color(0),
  });
}

/** Mesh helper: geometry + colour (or material), positioned, casting shadows. */
export function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.ColorRepresentation,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat instanceof THREE.Material ? mat : toon(mat));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Soft-cornered box centred at (x, y, z). */
export function rbox(w: number, h: number, d: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0, r = 0.03) {
  return part(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001)), color, x, y, z);
}

/** Cylinder with its base at y. */
export function cyl(rTop: number, rBot: number, h: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0, seg = 14) {
  return part(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y + h / 2, z);
}

export function ball(r: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  return part(new THREE.SphereGeometry(r, 18, 14), color, x, y, z);
}

/** A capsule from a to b (for limbs, tails, ears). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.Material | THREE.ColorRepresentation) {
  const len = a.distanceTo(b);
  const m = part(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10), color);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A canvas drawn once and used as a texture. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
