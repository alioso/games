// The things on the holes that move or stand in the way: windmill sails (and the windmill), barn
// doors (and the barn), rolling hay bales, the spinning scarecrow; and the pipes. Moving parts are
// built in the same frame as their physics shapes, so placing them at the physics pose lines them up.
import * as THREE from 'three';
import type { ObstacleDef, PipeDef, Prop } from '../data/holes';
import { ball, cyl, toon } from './toon';
import { stoneTex, texMat, woodTex } from './decor';

const box = (w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? toon(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

/** A moving obstacle's model (positioned each frame from the physics). */
export function obstacleMesh(o: ObstacleDef): THREE.Group {
  const g = new THREE.Group();
  switch (o.kind) {
    case 'spinner': {
      const n = o.arms ?? 2;
      for (let k = 0; k < n; k++) {
        const arm = box(o.reach * 2, 0.12, 0.09, 0x8a5a30);
        arm.rotation.y = (k / n) * Math.PI;
        g.add(arm);
        // Straw tufts at the ends.
        for (const s of [-1, 1]) {
          const tuft = ball(0.09, toon(0xe8c860), 0, 0, 0);
          tuft.position.set(Math.cos((k / n) * Math.PI) * o.reach * s, 0, -Math.sin((k / n) * Math.PI) * o.reach * s);
          g.add(tuft);
        }
      }
      g.add(cyl(0.1, 0.1, 0.6, toon(0x6a4428), 0, -0.3, 0, 8));
      break;
    }
    case 'slider': {
      // A round hay bale lying across its way, with straw rings.
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.84, 18), toon(0xe0b850));
      bale.rotation.z = Math.PI / 2;
      bale.castShadow = true;
      g.add(bale);
      for (const x of [-0.25, 0, 0.25]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.283, 0.012, 4, 20), toon(0xc89a38));
        ring.rotation.y = Math.PI / 2;
        ring.position.x = x;
        g.add(ring);
      }
      for (const s of [-1, 1]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18), toon(0xf0d070));
        face.position.x = s * 0.421;
        face.rotation.y = s * Math.PI / 2;
        g.add(face);
      }
      break;
    }
    case 'windmill': {
      // Four lattice sails round a hub.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const sail = new THREE.Group();
        sail.add(box(0.03, o.reach, 0.03, 0x6a4428, 0, o.reach / 2, 0));
        sail.add(box(0.12, o.reach * 0.8, 0.012, 0xf4ecd8, 0.055, o.reach * 0.55, 0.01));
        for (let i = 1; i < 5; i++) sail.add(box(0.13, 0.015, 0.02, 0x6a4428, 0.055, o.reach * (0.15 + i * 0.17), 0.015));
        sail.rotation.z = a;
        g.add(sail);
      }
      g.add(cyl(0.07, 0.07, 0.12, toon(0x4a3020), 0, 0, 0, 10).rotateX(Math.PI / 2));
      break;
    }
    case 'gate': {
      // A red barn door with a white cross.
      const door = new THREE.Group();
      door.add(box(o.length, 0.4, 0.05, 0xb8382a, o.length / 2, 0.2, 0));
      for (const s of [-1, 1]) {
        const bar = box(Math.hypot(o.length, 0.4) - 0.04, 0.035, 0.06, 0xf4f0e0, o.length / 2, 0.2, 0);
        bar.rotation.z = s * Math.atan2(0.4, o.length);
        door.add(bar);
      }
      g.add(door);
      break;
    }
  }
  return g;
}

/** Fixed scenery round an obstacle: the windmill tower, the barn, the scarecrow's body. */
export function propMesh(p: Prop, groundY: number): THREE.Group {
  const g = new THREE.Group();
  switch (p.kind) {
    case 'windmill': {
      // A dry-stone base with a doorway the ball rolls through, a white boarded tower with windows
      // and a balcony, a red shingled cap.
      const stone = texMat('stone', stoneTex);
      for (const sx of [-1, 1]) g.add(box(1.28, 0.62, 1.5, stone, sx * 0.96, 0.31, 0));
      g.add(box(3.2, 0.26, 1.5, stone, 0, 0.75, 0));
      const tower = cyl(0.5, 0.7, 1.9, toon(0xf6eedc), 0, 0.88, 0, 12);
      tower.castShadow = true;
      g.add(tower);
      const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 16), toon(0x8a5a30));
      balcony.position.y = 1.95;
      g.add(balcony);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.add(cyl(0.012, 0.012, 0.22, toon(0x6a4428), Math.cos(a) * 0.75, 1.97, Math.sin(a) * 0.75, 4));
      }
      const railing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.015, 4, 32), toon(0x6a4428));
      railing.rotation.x = Math.PI / 2;
      railing.position.y = 2.19;
      g.add(railing);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.8, 12), toon(0xc8402e));
      cap.position.y = 3.18;
      cap.castShadow = true;
      g.add(cap);
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 - k * 0.18, 0.02, 4, 24), toon(0x9a2a20));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 2.9 + k * 0.2;
        g.add(ring);
      }
      g.add(ball(0.06, toon(0xf4d040), 0, 3.62, 0));
      // Windows with shutters, and the door frame.
      for (const [y, z] of [[1.45, 0.62], [2.5, 0.56]] as const) {
        g.add(box(0.22, 0.28, 0.05, 0x4a6aa8, 0, y, z));
        for (const sx of [-1, 1]) g.add(box(0.1, 0.28, 0.03, 0x3a8a4a, sx * 0.17, y, z + 0.01));
      }
      g.add(box(0.74, 0.08, 0.08, 0x6a4428, 0, 0.64, 0.76));
      for (const sx of [-1, 1]) g.add(box(0.08, 0.62, 0.08, 0x6a4428, sx * 0.34, 0.31, 0.76));
      // Flower boxes either side of the door.
      for (const sx of [-1, 1]) {
        g.add(box(0.5, 0.1, 0.14, 0x8a5a30, sx * 1.05, 0.67, 0.8));
        for (let i = 0; i < 5; i++) g.add(ball(0.04, toon([0xf06090, 0xf8d040, 0xffffff][i % 3]), sx * 1.05 - 0.2 + i * 0.1, 0.75, 0.8));
      }
      break;
    }
    case 'barn': {
      const w = p.width;
      const red = texMat('wood', woodTex, 0xe05a48);
      g.add(box(w, 1.0, 1.0, red, 0, 1.4, 0));
      for (const s of [-1, 1]) g.add(box((w - 1.5) / 2, 0.9, 1.0, red, s * (w / 2 - (w - 1.5) / 4), 0.45, 0));
      // A pitched roof: a triangle stretched along the barn.
      const tri = new THREE.Shape([new THREE.Vector2(-0.68, 0), new THREE.Vector2(0.68, 0), new THREE.Vector2(0, 0.75)]);
      const rg = new THREE.ExtrudeGeometry(tri, { depth: w + 0.3, bevelEnabled: false });
      rg.translate(0, 0, -(w + 0.3) / 2);
      rg.rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(rg, toon(0x5a3a2a));
      roof.position.y = 1.9;
      roof.castShadow = true;
      g.add(roof);
      // Roof ridges, white trim, a hayloft door with hay poking out, X-braced side panels.
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
        const strip = box(w + 0.3, 0.025, 0.03, 0x48302a, 0, 1.92 + k * 0.17, s * (0.66 - k * 0.15));
        g.add(strip);
      }
      for (const s2 of [-1, 1]) g.add(box(0.06, 0.06, 1.3, 0xf4f0e0, s2 * (w / 2 + 0.16), 1.93, 0));
      g.add(box(1.5, 0.08, 1.02, 0xf4f0e0, 0, 0.92, 0));
      for (const s of [-1, 1]) g.add(box(w + 0.02, 0.06, 0.06, 0xf4f0e0, 0, 1.88, s * 0.5));
      for (const zf of [-0.51, 0.51]) {
        g.add(box(0.5, 0.45, 0.03, 0x4a2a1e, 0, 1.45, zf));
        g.add(box(0.5, 0.05, 0.04, 0xf4f0e0, 0, 1.68, zf));
        for (let i = 0; i < 4; i++) {
          const straw = box(0.03, 0.18, 0.03, 0xe8c860, -0.15 + i * 0.1, 1.28, zf * 1.06);
          straw.rotation.z = (i - 1.5) * 0.3;
          g.add(straw);
        }
        for (const s of [-1, 1]) {
          const px = s * (w / 2 - (w - 1.5) / 4), pw = (w - 1.5) / 2 - 0.12;
          for (const d of [-1, 1]) {
            const brace = box(Math.hypot(pw, 0.7), 0.05, 0.03, 0xf4f0e0, px, 0.45, zf * 1.02);
            brace.rotation.z = d * Math.atan2(0.7, pw);
            g.add(brace);
          }
        }
      }
      // A rooster weathervane.
      g.add(cyl(0.012, 0.012, 0.4, toon(0x2a2a2a), 0, 2.62, 0, 4));
      const rooster = box(0.2, 0.14, 0.02, 0x2a2a2a, 0.03, 3.05, 0);
      g.add(rooster);
      g.add(box(0.3, 0.015, 0.015, 0x2a2a2a, 0, 2.92, 0));
      break;
    }
    case 'scarecrow': {
      // Rides on the spinner's post: drawn there (see the spinner) so it spins with its arms.
      break;
    }
  }
  g.position.set(p.at[0], groundY, p.at[1]);
  if ('angle' in p) g.rotation.y = -p.angle;
  return g;
}

/** The scarecrow's body, to sit on top of a spinner's post. */
export function scarecrowBody(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.05, 0.7, toon(0x6a4428), 0, 0, 0, 6));
  const coat = cyl(0.16, 0.22, 0.4, toon(0x4a6a9a), 0, 0.15, 0, 8);
  g.add(coat);
  g.add(ball(0.15, toon(0xe8c878), 0, 0.72, 0));
  const hat = cyl(0.1, 0.12, 0.14, toon(0x5a4030), 0, 0.82, 0, 10);
  g.add(hat);
  g.add(cyl(0.22, 0.22, 0.02, toon(0x5a4030), 0, 0.8, 0, 14));
  for (const s of [-1, 1]) g.add(ball(0.02, toon(0x15110f), s * 0.05, 0.75, 0.13));
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** A pipe: two mouths in the ground joined by a green pipe arching over. */
export function pipeMesh(pipe: PipeDef, h: (x: number, z: number) => number, mouthR: number): THREE.Group {
  const g = new THREE.Group();
  const green = toon(0x3a8a4a);
  for (const [x, z] of [pipe.from, pipe.to]) {
    const y = h(x, z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(mouthR, 20), new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, y + 0.004, z);
    g.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(mouthR + 0.03, 0.035, 6, 22), green);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y + 0.01, z);
    g.add(rim);
  }
  // The pipe itself, up out of the ground and over.
  const [ax, az] = pipe.from, [bx, bz] = pipe.to;
  const ya = h(ax, az), yb = h(bx, bz);
  const mid = new THREE.Vector3((ax + bx) / 2, Math.max(ya, yb) + 1.1, (az + bz) / 2);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ax, ya - 0.3, az), new THREE.Vector3(ax, ya + 0.5, az), mid, new THREE.Vector3(bx, yb + 0.5, bz), new THREE.Vector3(bx, yb - 0.3, bz),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.13, 10, false), green);
  tube.castShadow = true;
  // Keep the pipe's ends clear of the mouths (it rises from just behind them).
  tube.position.y = 0;
  g.add(tube);
  return g;
}
