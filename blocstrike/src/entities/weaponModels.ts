import * as THREE from 'three';
import type { WeaponId } from '../data/weapons';
import { makeSpearModel } from './spearModel';

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** Points along +z. */
export function makeRocketModel() {
  const g = new THREE.Group();
  const body = part(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), mat(0xeeeeee), 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = part(new THREE.ConeGeometry(0.1, 0.22, 10), mat(0xe53935), 0, 0, 0.36);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  for (let i = 0; i < 3; i++) {
    const fin = part(new THREE.BoxGeometry(0.02, 0.16, 0.14), mat(0xe53935), 0, 0, -0.2);
    fin.rotation.z = (i * Math.PI * 2) / 3;
    fin.translateY(0.1);
    g.add(fin);
  }
  return g;
}

export function makeGrenadeModel() {
  const g = new THREE.Group();
  g.add(part(new THREE.IcosahedronGeometry(0.24, 1), mat(0x4e6b2c, { flatShading: true, roughness: 0.7 })));
  g.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), mat(0x888888, { metalness: 0.8 }), 0, 0.25, 0));
  const ring = part(new THREE.TorusGeometry(0.06, 0.015, 6, 12), mat(0xcccccc, { metalness: 0.9 }), 0.06, 0.32, 0);
  g.add(ring);
  return g;
}

/** What a bloc holds in its hand, pointing along +z. */
export function makeHeldWeapon(id: WeaponId, teamColor: number) {
  switch (id) {
    case 'spear': return makeSpearModel(teamColor);
    case 'bazooka': {
      const g = new THREE.Group();
      const tube = part(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 14), mat(0x556b2f, { roughness: 0.6 }));
      tube.rotation.x = Math.PI / 2;
      g.add(tube);
      const mouth = part(new THREE.CylinderGeometry(0.2, 0.17, 0.18, 14), mat(0x333333, { metalness: 0.6 }), 0, 0, 0.66);
      mouth.rotation.x = Math.PI / 2;
      g.add(mouth);
      g.add(part(new THREE.BoxGeometry(0.08, 0.28, 0.12), mat(0x333333), 0, -0.2, 0.1));
      g.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.2), mat(teamColor), 0, 0.18, -0.2));
      return g;
    }
    case 'grenade': {
      const g = makeGrenadeModel();
      g.position.z = 0.1;
      return g;
    }
    case 'sword': {
      const g = new THREE.Group();
      const steel = mat(0xe8edf2, { metalness: 0.95, roughness: 0.15 });
      const blade = part(new THREE.BoxGeometry(0.08, 0.025, 1.0), steel, 0, 0, 0.62);
      g.add(blade);
      const tip = part(new THREE.ConeGeometry(0.057, 0.2, 4), steel, 0, 0, 1.2);
      tip.rotation.x = Math.PI / 2;
      tip.scale.set(1, 1, 0.3);
      g.add(tip);
      g.add(part(new THREE.BoxGeometry(0.34, 0.07, 0.07), mat(0xd4a017, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0.1));
      const grip = part(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8), mat(teamColor), 0, 0, -0.04);
      grip.rotation.x = Math.PI / 2;
      g.add(grip);
      g.add(part(new THREE.SphereGeometry(0.06, 8, 6), mat(0xd4a017, { metalness: 0.8 }), 0, 0, -0.18));
      return g;
    }
    case 'machinegun': {
      const g = new THREE.Group();
      const gun = mat(0x2f3338, { metalness: 0.7, roughness: 0.35 });
      g.add(part(new THREE.BoxGeometry(0.2, 0.22, 0.6), gun, 0, 0, 0));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const b = part(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), gun, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.6);
        b.rotation.x = Math.PI / 2;
        g.add(b);
      }
      g.add(part(new THREE.BoxGeometry(0.16, 0.18, 0.2), mat(0x556b2f), 0.16, -0.1, 0.02));
      g.add(part(new THREE.BoxGeometry(0.08, 0.2, 0.1), mat(teamColor), 0, -0.18, -0.12));
      return g;
    }
    case 'flamethrower': {
      const g = new THREE.Group();
      const barrel = part(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 10), mat(0x444444, { metalness: 0.7, roughness: 0.3 }), 0, 0, 0.2);
      barrel.rotation.x = Math.PI / 2;
      g.add(barrel);
      const nozzle = part(new THREE.CylinderGeometry(0.12, 0.08, 0.16, 10), mat(0x222222, { metalness: 0.8 }), 0, 0, 0.74);
      nozzle.rotation.x = Math.PI / 2;
      g.add(nozzle);
      const tank = part(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 14), mat(0xd84315), 0, -0.05, -0.35);
      tank.rotation.x = Math.PI / 2;
      g.add(tank);
      g.add(part(new THREE.BoxGeometry(0.08, 0.26, 0.1), mat(teamColor), 0, -0.2, 0.05));
      return g;
    }
  }
}
