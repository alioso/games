// What the traps look like, so you know them when you see them, and what they do over time.
// The hedge maze: a tangle of thorny brambles across a gap (with blackberries), a papery wasps' nest
// hanging from a dead branch with its wasps circling, and a glossy brown mud puddle that bubbles.
// The town: an open manhole with its lid off, pots of flowers on a wall top that get knocked off (a
// shadow on the ground first, then the pot), and tipped-over barrels of sticky honey.
// The castle: a steel plate whose spikes shoot up and sink back, a stone dragon's head on a wall
// that glows, smokes, then breathes fire across the room, and a cracked old trapdoor that creaks.
import * as THREE from 'three';
import type { Trap } from '../data/mazes';
import { ball, cyl, glow, toon } from './toon';
import { tileMid, tileSize } from './maze';
import { barrel, flowerpot } from './themes';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface TrapView {
  trap: Trap;
  group: THREE.Group;
  /** Where it is (middle of its tile), and its area [x0, z0, x1, z1]. */
  x: number;
  z: number;
  area: [number, number, number, number];
  /** Wasps circling (their own group), mud bubbles. */
  wasps?: THREE.Object3D[];
  bubbles?: THREE.Mesh[];
  /** Going off right now (spikes up, fire breathing). */
  danger: boolean;
  /** A flowerpot just smashed here (this frame). */
  landed: { x: number; z: number } | null;
  /** The fire's path across the room [x0, z0, x1, z1] (world). */
  lane?: [number, number, number, number];
  /** Sounds to play this frame (the level plays them, quieter the further away you are). */
  sounds: string[];
  /** The trapdoor's fallen open (seconds left). */
  dropT: number;
  /** Moving parts. */
  parts: Record<string, THREE.Object3D>;
  /** Where it is in its cycle (seconds), and what it's doing. */
  t: number;
  phase: string;
  /** Where the next pot will land (local), and the shards flying. */
  aim?: THREE.Vector2;
  shards?: { m: THREE.Mesh; v: THREE.Vector3 }[];
}

/** What a trap needs to know about where it is: which tiles are wall, and how tall the walls are. */
export interface TrapPlace {
  isWall: (tx: number, ty: number) => boolean;
  wallH: number;
}

/** Spikes and fire take turns going off (each trap a bit out of step with the others). */
export const SPIKES = { period: 3.2, warn: 1.7, up: 2.0, down: 3.05 };
export const FIRE = { period: 3.6, warn: 1.4, fire: 2.1, out: 3.35 };

export function trapView(trap: Trap, place: TrapPlace): TrapView {
  const [tx, ty] = trap.tile;
  const x = tileMid(tx), z = tileMid(ty), w = tileSize(tx), d = tileSize(ty);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const view: TrapView = { trap, group: g, x, z, area: [x - w / 2, z - d / 2, x + w / 2, z + d / 2], danger: false, landed: null, sounds: [], dropT: 0, parts: {}, t: (tx * 0.37 + ty * 0.61) % 3, phase: 'wait' };
  // The wall beside a cell (for pots on top of it, the dragon's head on it): its direction.
  const wallSide = (): [number, number] | null => {
    const sides: [number, number][] = [[0, -1], [1, 0], [-1, 0], [0, 1]];
    const solid = sides.filter(([dx, dy]) => place.isWall(tx + dx, ty + dy));
    return solid.length ? solid[(tx + ty) % solid.length] : null;
  };
  switch (trap.kind) {
    case 'thorns': {
      // Brambles: arching stems with spikes, filling the gap from hedge to hedge.
      const stem = toon(0x5a2a22), spike = toon(0xd8c8a0);
      // A dark tangle on the ground under them, with a spiky edge, so the patch reads from above.
      const mat = new THREE.Shape();
      const hw = w / 2, hd = d / 2;
      const edge: [number, number][] = [];
      const N = 40;
      for (let k = 0; k < N; k++) {
        const u = k / N, per = 2 * (w + d), p = u * per;
        let ex: number, ez: number;
        if (p < w) { ex = -hw + p; ez = -hd; } else if (p < w + d) { ex = hw; ez = -hd + (p - w); } else if (p < 2 * w + d) { ex = hw - (p - w - d); ez = hd; } else { ex = -hw; ez = hd - (p - 2 * w - d); }
        const jag = k % 2 ? 0.92 : 1.08;
        edge.push([ex * jag, ez * jag]);
      }
      edge.forEach(([ex, ez], k) => (k ? mat.lineTo(ex, ez) : mat.moveTo(ex, ez)));
      const patch = new THREE.Mesh(new THREE.ShapeGeometry(mat).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x4a2418, side: THREE.DoubleSide }));
      patch.position.y = 0.02;
      g.add(patch);
      const n = Math.round(Math.max(w, d) / 0.09);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        const px = w > d ? u * w : rnd(-0.25, 0.25) * w, pz = w > d ? rnd(-0.25, 0.25) * d : u * d;
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(px + rnd(-0.2, 0.2), 0, pz + rnd(-0.2, 0.2)),
          new THREE.Vector3(px, rnd(0.8, 1.2), pz),
          new THREE.Vector3(px + rnd(-0.35, 0.35), 0, pz + rnd(-0.35, 0.35)),
        );
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5), stem);
        tube.castShadow = true;
        g.add(tube);
        for (let k = 1; k < 8; k++) {
          const p = curve.getPoint(k / 8);
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 4), spike);
          c.position.copy(p);
          c.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
          g.add(c);
        }
        if (Math.random() < 0.5) {
          const p = curve.getPoint(rnd(0.3, 0.7));
          for (let b = 0; b < 3; b++) g.add(ball(0.04, toon(b ? 0xc02030 : 0x2a1030), p.x + rnd(-0.03, 0.03), p.y - 0.04 + rnd(-0.03, 0.03), p.z + rnd(-0.03, 0.03)));
        }
        if (Math.random() < 0.3) {
          const p = curve.getPoint(rnd(0.2, 0.8));
          const leaf = ball(0.08, toon(0x3a6a2a), p.x, p.y, p.z);
          leaf.scale.set(1, 0.3, 0.6);
          g.add(leaf);
        }
      }
      break;
    }
    case 'wasps': {
      // A dead branch leaning in from the side, the nest hanging off it.
      const wood = toon(0x6a5040);
      const post = cyl(0.06, 0.09, 1.9, wood, -0.7, 0, -0.5, 7);
      post.rotation.z = -0.12;
      g.add(post);
      const arm = cyl(0.04, 0.05, 0.85, wood, 0, 0, 0, 6);
      arm.rotation.z = Math.PI / 2 - 0.15;
      arm.position.set(-0.4, 1.8, -0.5);
      g.add(arm);
      const nest = new THREE.Group();
      const body = ball(0.24, toon(0xb8ac98), 0, 0, 0);
      body.scale.set(1, 1.25, 1);
      nest.add(body);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235 - Math.abs(k - 1.5) * 0.04, 0.012, 4, 16), toon(0x8a7c68));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.18 + k * 0.12;
        nest.add(ring);
      }
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), new THREE.MeshBasicMaterial({ color: 0x15100c }));
      hole.rotation.x = Math.PI / 2;
      hole.position.y = -0.3;
      nest.add(hole);
      nest.position.set(-0.05, 1.42, -0.5);
      nest.scale.setScalar(1.5);
      g.add(nest);
      view.wasps = [];
      for (let k = 0; k < 12; k++) {
        const wasp = new THREE.Group();
        wasp.scale.setScalar(1.7);
        const b = ball(0.035, toon(0xf0c020), 0, 0, 0);
        b.scale.set(1, 0.8, 1.5);
        wasp.add(b);
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 10), toon(0x15110f));
        wasp.add(stripe);
        for (const s of [-1, 1]) {
          const wing = ball(0.03, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), s * 0.035, 0.03, 0);
          wing.scale.set(1, 0.2, 0.6);
          wasp.add(wing);
        }
        wasp.userData = { a: rnd(0, 6), r: rnd(0.4, 1.1), y: rnd(0.6, 1.6), s: rnd(1.5, 3) * (Math.random() < 0.5 ? -1 : 1) };
        g.add(wasp);
        view.wasps.push(wasp);
      }
      break;
    }
    case 'mud': {
      // A wobbly-edged puddle, darker in the middle, shiny, with a few bubbles and a boot stuck in it.
      const shape = new THREE.Shape();
      const R = Math.min(w, d) * 0.46;
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2, rr = R * (0.85 + 0.15 * Math.sin(a * 3 + 1) + rnd(-0.04, 0.04));
        if (k) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const puddle = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0x5a3a1e }));
      puddle.position.y = 0.015;
      puddle.receiveShadow = true;
      g.add(puddle);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(R * 0.55, 18).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x3e2814 }));
      inner.position.y = 0.02;
      g.add(inner);
      for (let k = 0; k < 3; k++) {
        const shine = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.06, 0.12), 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9a7a5a }));
        shine.scale.set(2, 1, 1);
        shine.position.set(rnd(-R, R) * 0.5, 0.022, rnd(-R, R) * 0.5);
        g.add(shine);
      }
      const boot = cyl(0.06, 0.07, 0.22, toon(0x3a2a20), R * 0.4, 0, -R * 0.2, 8);
      boot.rotation.z = 0.4;
      g.add(boot);
      view.bubbles = [];
      for (let k = 0; k < 3; k++) {
        const b = ball(0.05, toon(0x6a4a2a), rnd(-R, R) * 0.5, 0, rnd(-R, R) * 0.5);
        b.userData.t = rnd(0, 3);
        g.add(b);
        view.bubbles.push(b);
      }
      break;
    }
    case 'manhole': {
      // A big round hole (dark, with a ladder going down), its iron rim, the lid lying beside it,
      // and a striped cone.
      const R = 0.95;
      const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.08, R + 0.06, 28).rotateX(-Math.PI / 2), toon(0x4a4a50));
      rim.position.y = 0.02;
      g.add(rim);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(R - 0.08, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x08080a }));
      hole.position.y = 0.018;
      g.add(hole);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.08, R - 0.08, 0.6, 28, 1, true), new THREE.MeshToonMaterial({ color: 0x2a2a30, side: THREE.BackSide }));
      inner.position.y = -0.29;
      g.add(inner);
      for (const s of [-0.18, 0.18]) g.add(cyl(0.015, 0.015, 0.5, toon(0x8a8a90), s, -0.45, -R + 0.14, 5));
      for (let k = 0; k < 3; k++) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.02), toon(0x8a8a90));
        rung.position.set(0, -0.08 - k * 0.14, -R + 0.14);
        g.add(rung);
      }
      const along = w > d;
      const lid = new THREE.Group();
      lid.add(cyl(0.5, 0.5, 0.05, toon(0x5a5a62), 0, 0, 0, 20));
      for (let k = -2; k <= 2; k++) lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.85 - Math.abs(k) * 0.12, 0.012, 0.04), toon(0x3a3a40)).translateY(0.055).translateZ(k * 0.15));
      lid.position.set(along ? 0 : 1.15, 0, along ? 1.15 : 0);
      lid.rotation.y = 0.5;
      g.add(lid);
      for (const s of [-1, 1]) {
        const cone = new THREE.Group();
        cone.add(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 10), toon(0xf06020)).translateY(0.24));
        cone.add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.1, 0.08, 10), toon(0xffffff)).translateY(0.22));
        cone.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.32), toon(0xf06020)).translateY(0.015));
        cone.position.set(along ? s * 1.0 : -0.3 * s, 0, along ? -0.3 * s : s * 1.0);
        g.add(cone);
      }
      break;
    }
    case 'flowerpot': {
      // A row of pots on the top of the wall beside the cell (they're the ones that fall), and the
      // shadow that shows where the next one's coming down.
      const side = wallSide() ?? [0, -1];
      const ledge = new THREE.Group();
      for (let k = -1; k <= 1; k++) {
        const fp = flowerpot(1.5);
        fp.position.set(k * 0.6, 0, 0);
        ledge.add(fp);
      }
      ledge.position.set(side[0] * (w / 2 + 0.4), place.wallH + 0.12, side[1] * (d / 2 + 0.4));
      ledge.rotation.y = side[0] ? Math.PI / 2 : 0;
      g.add(ledge);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x100808, transparent: true, opacity: 0, depthWrite: false }));
      shadow.position.y = 0.03;
      g.add(shadow);
      const pot = flowerpot(1.5);
      pot.visible = false;
      g.add(pot);
      view.parts = { shadow, pot };
      view.aim = new THREE.Vector2();
      view.shards = [];
      for (let k = 0; k < 8; k++) {
        const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07), toon(k % 3 === 0 ? 0x3a7a2a : k % 3 === 1 ? 0x4a3020 : 0xc0603a));
        m.visible = false;
        g.add(m);
        view.shards.push({ m, v: new THREE.Vector3() });
      }
      view.t = (tx + ty) % 2;
      break;
    }
    case 'honey': {
      // A barrel lying on its side, honey spilt out of it in a golden puddle, more barrels behind.
      const shape = new THREE.Shape();
      const R = Math.min(w, d) * 0.47;
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2, rr = R * (0.82 + 0.18 * Math.sin(a * 4 + 2) + rnd(-0.03, 0.03));
        if (k) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xe0a020, emissive: 0x3a2000 }));
      puddle.position.y = 0.016;
      g.add(puddle);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(R * 0.6, 20).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xc88010 }));
      inner.position.y = 0.02;
      g.add(inner);
      for (let k = 0; k < 4; k++) {
        const shine = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.06, 0.12), 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
        shine.scale.set(2.2, 1, 1);
        shine.position.set(rnd(-R, R) * 0.5, 0.024, rnd(-R, R) * 0.5);
        g.add(shine);
      }
      const side = wallSide() ?? [0, -1];
      const tipped = barrel();
      tipped.rotation.z = Math.PI / 2;
      tipped.rotation.y = side[0] ? Math.PI / 2 : 0;
      tipped.position.set(side[0] * (w / 2 - 0.35), 0.3, side[1] * (d / 2 - 0.35));
      g.add(tipped);
      for (const k of [-1, 1]) {
        const b = barrel();
        b.position.set(side[0] * (w / 2 - 0.3) + (side[0] ? 0 : k * 0.75), 0.35, side[1] * (d / 2 - 0.3) + (side[1] ? 0 : k * 0.75));
        g.add(b);
      }
      // A couple of drips running down the tipped barrel.
      view.bubbles = [];
      break;
    }
    case 'spikes': {
      // A steel plate across the gap, full of holes; the spikes come up through them.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.04, d * 0.98), toon(0x4a4a54));
      plate.position.y = 0.02;
      plate.receiveShadow = true;
      g.add(plate);
      const spikes = new THREE.Group();
      const nx = Math.max(2, Math.round(w / 0.24)), nz = Math.max(2, Math.round(d / 0.24));
      const holeGeo = new THREE.CircleGeometry(0.05, 8).rotateX(-Math.PI / 2), holeMat = new THREE.MeshBasicMaterial({ color: 0x15151a });
      const coneGeo = new THREE.ConeGeometry(0.075, 0.55, 6), steel = toon(0xeef0f8);
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const px = ((i + 0.5) / nx - 0.5) * w, pz = ((k + 0.5) / nz - 0.5) * d;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(px, 0.042, pz);
        g.add(hole);
        const c = new THREE.Mesh(coneGeo, steel);
        c.position.set(px, 0.27, pz);
        c.castShadow = true;
        spikes.add(c);
        // (A dark collar round each, so they stand out from above.)
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 6), toon(0x2a2a30));
        col.position.set(px, 0.03, pz);
        spikes.add(col);
      }
      // Yellow and black warning stripes along the plate's edges.
      const long = Math.max(w, d), n = Math.round(long / 0.16);
      for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n - 0.5) * long;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w > d ? long / n : 0.12, 0.05, w > d ? 0.12 : long / n), toon(k % 2 ? 0x1a1a1a : 0xf0c020));
        stripe.position.set(w > d ? u : s * (w / 2 - 0.06), 0.026, w > d ? s * (d / 2 - 0.06) : u);
        g.add(stripe);
      }
      spikes.position.y = -0.48;
      g.add(spikes);
      view.parts = { spikes };
      break;
    }
    case 'fire': {
      // A stone dragon's head on the wall, glowing eyes, its fire across the room.
      const side = wallSide() ?? [0, -1];
      const head = new THREE.Group();
      const stone = toon(0x7a7880);
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.34), stone).translateZ(0.17));
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.34), stone).translateZ(0.48).translateY(-0.06));
      for (const sx of [-0.13, 0.13]) {
        head.add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), stone).translateX(sx).translateY(0.28).translateZ(0.08).rotateX(-0.5));
      }
      const eyes: THREE.Mesh[] = [];
      for (const sx of [-0.13, 0.13]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow(0xff4010, 1.2));
        e.position.set(sx, 0.08, 0.35);
        head.add(e);
        eyes.push(e);
      }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), glow(0x200a04, 1));
      mouth.position.set(0, -0.13, 0.66);
      head.add(mouth);
      // Facing into the room, on the wall's face.
      head.position.set(side[0] * (w / 2), 0.75, side[1] * (d / 2));
      head.rotation.y = Math.atan2(-side[0], -side[1]);
      g.add(head);
      // The flame: cones along the room, out of the mouth.
      const flame = new THREE.Group();
      const len = (side[0] ? w : d) - 0.55;
      // (Soft, see-through layers: red outside, orange, a yellow-white core.)
      const layer = (r: number, l: number, color: number, k: number, op: number) => {
        const m = glow(color, k);
        m.transparent = true;
        m.opacity = op;
        m.blending = THREE.AdditiveBlending;
        m.depthWrite = false;
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, l, 12, 1, true).rotateX(-Math.PI / 2), m);
        c.position.z = l / 2;
        flame.add(c);
        return c;
      };
      layer(0.55, len * 1.05, 0xc02010, 1.6, 0.55);
      layer(0.4, len, 0xff7010, 2.0, 0.7);
      layer(0.18, len * 0.75, 0xffe880, 2.4, 0.9);
      // Puffs of flame along it.
      for (let k = 0; k < 6; k++) {
        const m = glow(0xffa020, 2.2);
        m.transparent = true; m.opacity = 0.7; m.blending = THREE.AdditiveBlending; m.depthWrite = false;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + k * 0.05, 8, 6), m);
        puff.position.z = 0.3 + (k / 5) * len * 0.9;
        puff.userData.k = k;
        flame.add(puff);
      }
      flame.position.set(0, -0.12, 0.62);
      flame.scale.setScalar(0.01);
      flame.visible = false;
      head.add(flame);
      // Scorch marks on the floor along its path.
      const scorch = new THREE.Mesh(new THREE.PlaneGeometry(side[0] ? len : 1.1, side[0] ? 1.1 : len).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.55, depthWrite: false }));
      scorch.position.set(-side[0] * 0.27, 0.022, -side[1] * 0.27);
      g.add(scorch);
      // Where it burns: a strip 1.3 m wide from the wall right across.
      const hw = 0.65;
      view.lane = side[0]
        ? [x - w / 2, z - hw, x + w / 2, z + hw]
        : [x - hw, z - d / 2, x + hw, z + d / 2];
      view.parts = { flame, mouth, eyes0: eyes[0], eyes1: eyes[1] };
      break;
    }
    case 'trapdoor': {
      // Two old wooden doors in the floor, iron bands, a big crack, a ring to lift it; under them, a pit.
      const S = 2.0;
      const pit = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050405 }));
      pit.position.y = 0.012;
      g.add(pit);
      const frame = new THREE.Mesh(new THREE.RingGeometry(S * 0.7, S * 0.78, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), toon(0x3a3034));
      frame.position.y = 0.02;
      g.add(frame);
      const halves: THREE.Group[] = [];
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        const door = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(S / 2 - 0.02, 0.05, S / 4 - 0.02), toon([0x8a6a48, 0x7a5a3a, 0x94724e, 0x6e5034][k]));
          plank.position.set(-s * (S / 4), 0.025, -S / 2 + S / 8 + k * (S / 4));
          plank.castShadow = true;
          door.add(plank);
        }
        for (const bz of [-S * 0.3, S * 0.3]) door.add(new THREE.Mesh(new THREE.BoxGeometry(S / 2 - 0.04, 0.056, 0.07), toon(0x2a2a2e)).translateX(-s * (S / 4)).translateY(0.03).translateZ(bz));
        // The crack.
        for (let k = 0; k < 5; k++) door.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.058, 0.16), new THREE.MeshBasicMaterial({ color: 0x1a120c })).translateX(-s * (0.25 + k * 0.1)).translateY(0.03).translateZ(-0.1 + (k % 2) * 0.12).rotateY(0.6 * (k % 2 ? 1 : -1)));
        hinge.add(door);
        hinge.position.set(s * (S / 2), 0.0, 0);
        g.add(hinge);
        halves.push(hinge);
        hinge.userData.s = s;
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 5, 12), toon(0x2a2a2e));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0.12, 0.06, 0);
      halves[1].add(ring);
      view.parts = { a: halves[0], b: halves[1] };
      view.area = [x - S / 2, z - S / 2, x + S / 2, z + S / 2];
      break;
    }
  }
  return view;
}

/** Wasps circle, mud bubbles rise and pop, pots fall, spikes stab, fire breathes, trapdoors drop. */
export function animateTrap(v: TrapView, t: number, dt: number, hero: THREE.Vector3) {
  v.landed = null;
  v.sounds.length = 0;
  switch (v.trap.kind) {
    case 'flowerpot': flowerpots(v, dt, hero); break;
    case 'spikes': {
      v.t = (v.t + dt) % SPIKES.period;
      const k = v.t;
      // Down; a little rattle as the tips peek out; then up!; then back down.
      let h = 0;
      if (k > SPIKES.warn && k < SPIKES.up) h = 0.18 + Math.sin(k * 80) * 0.04;
      else if (k >= SPIKES.up && k < SPIKES.down) h = Math.min(1, (k - SPIKES.up) / 0.06);
      else if (k >= SPIKES.down) h = Math.max(0, 1 - (k - SPIKES.down) / 0.15);
      v.parts.spikes.position.y = -0.48 + h * 0.5;
      if (k - dt <= SPIKES.warn && k > SPIKES.warn) v.sounds.push('rattle');
      if (k - dt <= SPIKES.up && k > SPIKES.up) v.sounds.push('shing');
      v.danger = h > 0.5;
      break;
    }
    case 'fire': {
      v.t = (v.t + dt) % FIRE.period;
      const k = v.t, p = v.parts;
      const warn = k > FIRE.warn && k < FIRE.fire, on = k >= FIRE.fire && k < FIRE.out;
      // The eyes and mouth glow hotter as it draws breath.
      const heat = warn ? (k - FIRE.warn) / (FIRE.fire - FIRE.warn) : on ? 1 : 0;
      for (const e of [p.eyes0, p.eyes1]) ((e as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(1.2 + heat * 2, 0.3 + heat * 0.8, 0.05);
      ((p.mouth as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(0.15 + heat * 2.4, 0.05 + heat * 1.0, 0.02);
      const f = p.flame;
      f.visible = on;
      if (on) {
        const grow = Math.min(1, (k - FIRE.fire) / 0.15), fade = Math.min(1, (FIRE.out - k) / 0.15);
        const flick = 1 + Math.sin(t * 40) * 0.08 + Math.sin(t * 23) * 0.06;
        f.scale.set(grow * fade * flick, grow * fade * flick, grow);
        for (const c of f.children) if (c.userData.k !== undefined) {
          const s = 1 + Math.sin(t * 30 + c.userData.k * 1.7) * 0.25;
          c.scale.setScalar(s);
          c.position.x = Math.sin(t * 19 + c.userData.k) * 0.06;
          c.position.y = Math.cos(t * 23 + c.userData.k * 2) * 0.05;
        }
      }
      if (k - dt <= FIRE.warn && k > FIRE.warn) v.sounds.push('hiss');
      if (k - dt <= FIRE.fire && k > FIRE.fire) v.sounds.push('whoosh');
      v.danger = on && k > FIRE.fire + 0.06;
      break;
    }
    case 'trapdoor': {
      // Fallen open: the doors swing down, then creak back up.
      v.dropT = Math.max(0, v.dropT - dt);
      const open = v.dropT > 0 ? Math.min(1, (2.2 - v.dropT) / 0.15) * Math.min(1, v.dropT / 0.5) : 0;
      for (const h of [v.parts.a, v.parts.b]) h.rotation.z = h.userData.s * open * 1.45;
      break;
    }
  }
  for (const w of v.wasps ?? []) {
    const u = w.userData;
    u.a += u.s * dt;
    w.position.set(-0.05 + Math.cos(u.a) * u.r, u.y + Math.sin(t * 7 + u.a) * 0.08, -0.5 + Math.sin(u.a) * u.r);
    w.rotation.y = -u.a + (u.s > 0 ? 0 : Math.PI);
  }
  for (const b of v.bubbles ?? []) {
    b.userData.t += dt;
    const k = b.userData.t % 2.4;
    const s = k < 1.2 ? k / 1.2 : 0;
    b.scale.setScalar(Math.max(0.01, s));
    b.position.y = 0.02;
  }
}

/**
 * Pots knocked off the wall: wait; a shadow grows where one's coming down (right where you are, if
 * you're in its room); it falls; it smashes (pieces fly, and if you're still there, bonk).
 */
function flowerpots(v: TrapView, dt: number, hero: THREE.Vector3) {
  const { shadow, pot } = v.parts as { shadow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; pot: THREE.Object3D };
  v.t += dt;
  const [x0, z0, x1, z1] = v.area;
  const near = hero.x > x0 - 0.5 && hero.x < x1 + 0.5 && hero.z > z0 - 0.5 && hero.z < z1 + 0.5;
  switch (v.phase) {
    case 'wait':
      if (v.t > (near ? 0.5 : 1.6)) {
        v.phase = 'shadow';
        v.t = 0;
        const hw = (x1 - x0) / 2 - 0.35, hd = (z1 - z0) / 2 - 0.35;
        if (near) v.aim!.set(Math.max(-hw, Math.min(hw, hero.x - v.x)), Math.max(-hd, Math.min(hd, hero.z - v.z)));
        else v.aim!.set(rnd(-hw, hw), rnd(-hd, hd));
        shadow.position.set(v.aim!.x, 0.03, v.aim!.y);
      }
      break;
    case 'shadow': {
      const u = Math.min(1, v.t / 1.0);
      shadow.scale.setScalar(0.3 + u * 0.8);
      shadow.material.opacity = 0.15 + u * 0.5;
      if (v.t > 1.0) { v.phase = 'fall'; v.t = 0; pot.visible = true; v.sounds.push('whistle'); }
      break;
    }
    case 'fall': {
      const u = Math.min(1, v.t / 0.32);
      pot.position.set(v.aim!.x, 5 * (1 - u * u), v.aim!.y);
      pot.rotation.z = u * 2;
      if (u >= 1) {
        v.phase = 'smash';
        v.t = 0;
        pot.visible = false;
        shadow.material.opacity = 0;
        v.landed = { x: v.x + v.aim!.x, z: v.z + v.aim!.y };
        v.sounds.push('smash');
        for (const s of v.shards!) {
          s.m.visible = true;
          s.m.position.set(v.aim!.x, 0.1, v.aim!.y);
          s.v.set(rnd(-2, 2), rnd(1.5, 3), rnd(-2, 2));
        }
      }
      break;
    }
    case 'smash':
      for (const s of v.shards!) {
        s.v.y -= 12 * dt;
        s.m.position.addScaledVector(s.v, dt);
        if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.v.set(0, 0, 0); }
        s.m.rotation.x += dt * 6;
      }
      if (v.t > 0.9) { v.phase = 'wait'; v.t = 0; for (const s of v.shards!) s.m.visible = false; }
      break;
  }
}
