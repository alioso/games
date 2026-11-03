// The comic-book look: flat banded shading plus a black ink outline around every shape.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const gradient = (() => {
  const steps = [70, 150, 215, 255];
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

export const INK = new THREE.MeshBasicMaterial({ color: 0x14100e, side: THREE.BackSide });

/** Glowing, unlit (for flames, candle tips, the key's shine). Above 1 blooms. */
export function glow(color: THREE.ColorRepresentation, intensity = 2) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
}

const box3 = new THREE.Box3();
const size = new THREE.Vector3();
const center = new THREE.Vector3();

/**
 * Add a black inside-out shell to every mesh under `root`. The outlines themselves are drawn by the
 * ink post effect; the shell's job is to show black where the dollhouse cut slices a shape open
 * (pass a bigger `width` for a visible outline too). Flat things and glowing things are skipped.
 */
export function ink(root: THREE.Object3D, width = 0.003) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.ink && !o.userData.noInk && !(o.material instanceof THREE.MeshBasicMaterial)) meshes.push(o);
  });
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box3.copy(g.boundingBox!);
    box3.getSize(size);
    box3.getCenter(center);
    if (Math.min(size.x, size.y, size.z) < 0.015) continue;
    const s = m.getWorldScale(new THREE.Vector3());
    const shell = new THREE.Mesh(g, INK);
    shell.userData.ink = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    // Scale about the geometry's own centre, so the shell is `width` thicker on every side.
    const k = (axis: number, sc: number) => 1 + (2 * width) / Math.max(0.02, axis * Math.abs(sc));
    shell.scale.set(k(size.x, s.x), k(size.y, s.y), k(size.z, s.z));
    shell.position.copy(center).multiply(new THREE.Vector3(1 - shell.scale.x, 1 - shell.scale.y, 1 - shell.scale.z));
    m.add(shell);
  }
  return root;
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

/**
 * Nudge every vertex a little by a smooth function of where it is, so straight edges go slightly
 * wonky, as if drawn by hand. Shared corners move together, so nothing tears.
 */
export function wonk(geo: THREE.BufferGeometry, amount: number) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(
      i,
      x + amount * Math.sin(y * 4.1 + z * 2.3 + 1.7),
      y + amount * 0.6 * Math.sin(x * 3.7 + z * 4.3),
      z + amount * Math.sin(y * 3.3 + x * 2.9 + 4.1),
    );
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Soft-cornered, slightly wonky box with its base on y=0 at (x, z). */
export function block(w: number, h: number, d: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  const m = Math.min(w, h, d);
  const r = Math.min(0.035, m * 0.2);
  const geo = r > 0.006 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  wonk(geo, Math.min(0.012, m * 0.08));
  return part(geo, color, x, y + h / 2, z);
}

export function cyl(rTop: number, rBot: number, h: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0, seg = 14) {
  return part(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y + h / 2, z);
}

export function ball(r: number, color: THREE.Material | THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  return part(new THREE.SphereGeometry(r, 16, 12), color, x, y, z);
}

/** A group whose child is offset, so the group rotates around a hinge. */
export function hinge(x: number, y: number, z: number, child: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  child.position.x -= x;
  child.position.y -= y;
  child.position.z -= z;
  g.add(child);
  return g;
}

/**
 * The dollhouse cut: everything above CUT_Y.constant and south of CUT_Z.constant is sliced away,
 * so walls and wardrobes between the camera and the hero never hide them. Inked shells are drawn
 * inside-out, so a sliced shape shows a black cut face, like a comic cross-section.
 */
export const CUT_Y = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.4);
export const CUT_Z = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
const SECTION = [CUT_Y, CUT_Z];

export function applySection(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.clippingPlanes === SECTION) continue;
      m.clippingPlanes = SECTION;
      m.clipIntersection = true;
      m.needsUpdate = true;
    }
  });
}

/** Give everything under root its own uncut materials (the hero is never sliced). */
export function unclipped(root: THREE.Object3D) {
  const copies = new Map<THREE.Material, THREE.Material>();
  const own = (m: THREE.Material) => {
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      c.clippingPlanes = null;
      copies.set(m, c);
    }
    return c;
  };
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  return root;
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      if (!o.userData.ink && !o.userData.shared) o.geometry.dispose();
    }
  });
}
