import * as THREE from 'three';

const WOOD = new THREE.MeshStandardMaterial({ color: 0xb98550, roughness: 0.7 });
const METAL = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.25, metalness: 0.9 });

/** A spear pointing along +z, centred on its grip. Team colour on the ribbon. */
export function makeSpearModel(teamColor: number) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 6), WOOD);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 4), METAL);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 1.02;
  g.add(tip);
  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.13, 0.16),
    new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5 }),
  );
  ribbon.position.z = 0.76;
  g.add(ribbon);
  g.traverse((o) => (o.castShadow = true));
  return g;
}
