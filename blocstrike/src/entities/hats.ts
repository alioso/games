import * as THREE from 'three';
import type { HatId } from '../data/hats';
import type { SkinId } from '../data/blocs';

// Hats and hair sit on top of a 1×1×1 bloc: y = 0 is the top of the head, +z is the front.

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** A solid of revolution from (radius, height) points. */
const lathe = (pts: [number, number][], segs = 28) =>
  new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), segs);

function stripes(a: string, b: string, n = 8) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect((i * 64) / n, 0, 64 / n, 64);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDERS: Record<HatId, () => THREE.Group> = {
  cap() {
    const g = new THREE.Group();
    const red = mat(0xe53935);
    const dome = mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red);
    dome.scale.set(1, 0.6, 1);
    g.add(dome);
    const visor = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24, 1, false, -Math.PI / 2, Math.PI), red, 0, 0.02, 0.25);
    visor.scale.set(1, 1, 1.1);
    g.add(visor);
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xffffff), 0, 0.3, 0));
    return g;
  },
  wizard() {
    const g = new THREE.Group();
    const purple = mat(0x5e35b1);
    g.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 32), purple, 0, 0.02, 0));
    const cone = mesh(new THREE.ConeGeometry(0.45, 1.2, 24), purple, 0, 0.62, 0);
    cone.rotation.z = 0.12;
    g.add(cone);
    const gold = mat(0xffd54f, { emissive: 0xffb300, emissiveIntensity: 0.6 });
    for (const [x, y, z] of [[0.18, 0.4, 0.3], [-0.1, 0.75, 0.22], [0.05, 0.25, -0.38]]) {
      g.add(mesh(new THREE.OctahedronGeometry(0.07), gold, x, y, z));
    }
    return g;
  },
  tophat() {
    const g = new THREE.Group();
    const black = mat(0x1a1a1a, { roughness: 0.4 });
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 32), black, 0, 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.7, 28), black, 0, 0.38, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.1, 28), mat(0xc62828), 0, 0.1, 0));
    return g;
  },
  sombrero() {
    const g = new THREE.Group();
    const straw = mat(0xe8c15a, { roughness: 0.9 });
    g.add(mesh(lathe([[0, 0.04], [0.95, 0.0], [1.05, 0.1], [1.1, 0.16], [1.08, 0.12], [0.9, 0.03], [0, 0.07]], 40), straw));
    g.add(mesh(lathe([[0.36, 0.04], [0.33, 0.4], [0.22, 0.55], [0, 0.58]]), straw));
    const band = mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 32), mat(0xd32f2f), 0, 0.12, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    return g;
  },
  cowboy() {
    const g = new THREE.Group();
    const brown = mat(0x8d5524, { roughness: 0.8 });
    const brim = mesh(lathe([[0, 0.04], [0.8, 0.02], [0.85, 0.14], [0.8, 0.06], [0, 0.07]], 36), brown);
    brim.scale.set(1, 1, 0.82);
    g.add(brim);
    const crown = mesh(lathe([[0.4, 0.04], [0.38, 0.4], [0.2, 0.46], [0.05, 0.38], [0, 0.4]]), brown);
    crown.scale.set(1, 1, 0.85);
    g.add(crown);
    const band = mesh(new THREE.TorusGeometry(0.39, 0.035, 8, 32), mat(0x3e2723), 0, 0.1, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.85, 1);
    g.add(band);
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const gold = mat(0xffc93c, { metalness: 1, roughness: 0.2 });
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 32, 1, true), gold, 0, 0.1, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.08, 0.22, 6), gold, Math.sin(a) * 0.4, 0.3, Math.cos(a) * 0.4));
    }
    const gems = [0xe53935, 0x1e88e5, 0x43a047];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(gems[i % 3], { roughness: 0.1, metalness: 0.3 }), Math.sin(a) * 0.43, 0.1, Math.cos(a) * 0.43));
    }
    return g;
  },
  party() {
    const g = new THREE.Group();
    const cone = mesh(new THREE.ConeGeometry(0.32, 0.8, 24, 1, true), new THREE.MeshStandardMaterial({ map: stripes('#29b6f6', '#ffee58'), side: THREE.DoubleSide, roughness: 0.6 }), 0, 0.4, 0);
    cone.rotation.x = -0.1;
    g.add(cone);
    g.add(mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(0xec407a), 0, 0.82, 0.04));
    return g;
  },
  viking() {
    const g = new THREE.Group();
    const metal = mat(0x9ea7ad, { metalness: 0.9, roughness: 0.3 });
    const dome = mesh(new THREE.SphereGeometry(0.52, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    dome.scale.set(1, 0.75, 1);
    g.add(dome);
    const ring = mesh(new THREE.TorusGeometry(0.51, 0.05, 8, 32), mat(0x795548), 0, 0.03, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const horn = mat(0xfff3e0, { roughness: 0.5 });
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.1, 0.55, 12), horn, s * 0.58, 0.32, 0);
      h.rotation.z = -s * 0.9;
      g.add(h);
    }
    return g;
  },
  chef() {
    const g = new THREE.Group();
    const white = mat(0xffffff, { roughness: 0.8 });
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 28), white, 0, 0.17, 0));
    for (const [x, z, r] of [[0, 0, 0.32], [0.25, 0.1, 0.24], [-0.25, 0.1, 0.24], [0.1, -0.25, 0.24], [-0.15, -0.2, 0.24], [0.05, 0.28, 0.22]]) {
      g.add(mesh(new THREE.SphereGeometry(r, 16, 12), white, x, 0.52, z));
    }
    return g;
  },
  beanie() {
    const g = new THREE.Group();
    const knit = mat(0x26a69a, { roughness: 1 });
    const dome = mesh(new THREE.SphereGeometry(0.53, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, -0.06, 0);
    dome.scale.set(1, 0.85, 1);
    g.add(dome);
    const fold = mesh(new THREE.TorusGeometry(0.52, 0.08, 10, 32), mat(0x00897b, { roughness: 1 }), 0, -0.02, 0);
    fold.rotation.x = Math.PI / 2;
    g.add(fold);
    g.add(mesh(new THREE.IcosahedronGeometry(0.13, 1), mat(0xffffff, { roughness: 1 }), 0, 0.45, 0));
    return g;
  },
};

export function makeHat(id: HatId) {
  return BUILDERS[id]();
}

/** Hair or crown that comes with some skins (hidden when wearing a hat). */
export function makeSkinTop(id: SkinId): THREE.Group | null {
  const g = new THREE.Group();
  const spikes = (color: number | number[], n: number, h: number, spread = 0.7) => {
    for (let i = 0; i < n; i++) {
      const c = Array.isArray(color) ? color[i % color.length] : color;
      const x = (i / (n - 1) - 0.5) * spread;
      const s = mesh(new THREE.ConeGeometry(0.1, h * (0.75 + ((i * 37) % 5) / 10), 5), mat(c), x, h / 2 - 0.02, 0);
      s.rotation.z = -x * 0.8;
      g.add(s);
    }
  };
  switch (id) {
    case 'noob': spikes(0x3e2723, 6, 0.32); return g;
    case 'pro': {
      const tuft = mesh(new THREE.ConeGeometry(0.16, 0.36, 6), mat(0xff7043), 0.08, 0.14, 0.15);
      tuft.rotation.set(0.6, 0, -0.5);
      g.add(tuft);
      return g;
    }
    case 'rainbow': spikes([0xff1744, 0xff9100, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9], 6, 0.45, 0.75); return g;
    case 'chocolate': {
      // White icing on top with coloured sprinkles.
      const icing = mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfff3e0, { roughness: 0.3 }), 0, -0.04, 0);
      icing.scale.set(1.15, 0.28, 1.15);
      g.add(icing);
      const colors = [0xff5252, 0x40c4ff, 0xffeb3b, 0x69f0ae, 0xe040fb];
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39, d = 0.12 + (i % 4) * 0.08;
        const s = mesh(new THREE.CapsuleGeometry(0.018, 0.06, 2, 4), mat(colors[i % colors.length]), Math.cos(a) * d, 0.08, Math.sin(a) * d);
        s.rotation.set(Math.PI / 2, 0, a);
        g.add(s);
      }
      return g;
    }
    case 'gold': {
      const gold = mat(0xffd54f, { metalness: 1, roughness: 0.2 });
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry(0.09, 0.22, 4), gold, (i - 1) * 0.18, 0.1, 0));
      return g;
    }
    default: return null;
  }
}
