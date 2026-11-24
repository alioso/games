// What the hedge maze's traps look like, so you know them when you see them: a tangle of thorny
// brambles across a gap (with blackberries), a papery wasps' nest hanging from a dead branch with its
// wasps circling, and a glossy brown mud puddle that bubbles now and then.
import * as THREE from 'three';
import type { Trap } from '../data/mazes';
import { ball, cyl, toon } from './toon';
import { tileMid, tileSize } from './maze';

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
}

export function trapView(trap: Trap): TrapView {
  const [tx, ty] = trap.tile;
  const x = tileMid(tx), z = tileMid(ty), w = tileSize(tx), d = tileSize(ty);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const view: TrapView = { trap, group: g, x, z, area: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] };
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
  }
  return view;
}

/** Wasps circle, mud bubbles rise and pop. */
export function animateTrap(v: TrapView, t: number, dt: number) {
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
