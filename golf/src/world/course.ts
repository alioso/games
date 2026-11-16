// Drawing a hole in the countryside: the green carpet (the very mesh the ball rolls on), wooden or
// stone walls, hedges, stumps and mushroom bumpers, tunnels and loops, the cup and its flag, the tee
// with its signpost; the grassy bank the course sits on (flower beds along the walls), and the
// countryside round it: fields, trees, bushes, rocks, a farm, clouds drifting over, sky and sun.
import * as THREE from 'three';
import { CUP, WALL } from '../data/tuning';
import type { P2 } from '../data/holes';
import { PIPE_R } from '../game/physics';
import { type Shape, insidePoly, nearestEdge } from './geometry';
import { obstacleMesh, pipeMesh, propMesh, scarecrowBody } from './props';
import { ball, cyl, toon, toonOwn } from './toon';
import { leafTex as leafTexShared } from './decor';
import {
  burrowMouth, bush, canvasTex, cloud, coverMesh, earthTex, flowersAt, loopMesh, meadowTex, mushroomBumper, pine, rock,
  signpost, stoneTex, texMat, toadstool, tree, tuftsAt, woodTex,
} from './decor';

/**
 * The playing surface's paint, one picture for the whole hole: the green carpet mown in a check,
 * darker in along the walls, a lighter collar round the cup and a striped tee box; sand traps, plank
 * bridges, the muddy bottoms of ponds.
 */
function paintSurface(shape: Shape) {
  const PPM = 48, M = 0.6;
  const x0 = shape.min[0] - M, z0 = shape.min[1] - M, x1 = shape.max[0] + M, z1 = shape.max[1] + M;
  const W = x1 - x0, H = z1 - z0;
  const px = (x: number, z: number): [number, number] => [(x - x0) * PPM, (z1 - z) * PPM];
  const poly = (c: CanvasRenderingContext2D, pts: P2[]) => {
    c.beginPath();
    pts.forEach((p, i) => { const [x, y] = px(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.closePath();
  };
  const t = canvasTex(null, Math.ceil(W * PPM), Math.ceil(H * PPM), (c) => {
    const cw = c.canvas.width, ch = c.canvas.height;
    c.fillStyle = '#52b44c';
    c.fillRect(0, 0, cw, ch);
    // Mown in a diamond check: two sets of diagonal stripes.
    const step = 0.9 * PPM;
    c.save();
    for (const [ang, col] of [[Math.PI / 4, 'rgba(30,90,20,0.10)'], [-Math.PI / 4, 'rgba(230,255,200,0.07)']] as const) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.translate(cw / 2, ch / 2);
      c.rotate(ang);
      c.fillStyle = col;
      const big = Math.hypot(cw, ch);
      for (let x = -big; x < big; x += step * 2) c.fillRect(x, -big, step, big * 2);
    }
    c.restore();
    for (let i = 0; i < W * H * 60; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(0,40,0,0.08)' : 'rgba(255,255,220,0.07)';
      c.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
    }
    // Darker in along the walls (and round islands), like a shadowed edge.
    const edge = (pts: P2[]) => {
      for (const [w, a] of [[0.7, 0.07], [0.42, 0.08], [0.2, 0.1]] as const) {
        poly(c, pts);
        c.lineWidth = w * PPM;
        c.strokeStyle = `rgba(10,50,10,${a})`;
        c.lineJoin = 'round';
        c.stroke();
      }
    };
    edge(shape.hole.outline);
    for (const b of shape.hole.blocks ?? []) edge(b);
    // A lighter collar round the cup.
    const [cxp, cyp] = px(shape.hole.cup[0], shape.hole.cup[1]);
    const grd = c.createRadialGradient(cxp, cyp, 0, cxp, cyp, 0.6 * PPM);
    grd.addColorStop(0, 'rgba(200,255,160,0.35)');
    grd.addColorStop(0.75, 'rgba(200,255,160,0.25)');
    grd.addColorStop(1, 'rgba(200,255,160,0)');
    c.fillStyle = grd;
    c.fillRect(cxp - PPM, cyp - PPM, 2 * PPM, 2 * PPM);
    // Pond beds: dark and muddy (seen through the water).
    for (const w of shape.hole.water ?? []) { poly(c, w); c.fillStyle = '#3a5a3a'; c.fill(); }
    // Sand: warm, grainy, with a darker edge.
    for (const sand of shape.hole.sand ?? []) {
      poly(c, sand);
      c.fillStyle = '#ecd490';
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = '#c8ac64';
      c.stroke();
      c.save();
      c.clip();
      for (let i = 0; i < 2500; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,40,0.18)' : 'rgba(255,250,220,0.3)';
        c.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
      }
      // Rake lines.
      c.strokeStyle = 'rgba(160,120,60,0.25)';
      c.lineWidth = 2;
      for (let y = 0; y < ch; y += 7) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x < cw; x += 20) c.lineTo(x, y + Math.sin(x * 0.05) * 3); c.stroke(); }
      c.restore();
    }
    // Plank bridges: boards across, with dark gaps between.
    for (const pl of shape.hole.planks ?? []) {
      poly(c, pl);
      c.fillStyle = '#c08a4c';
      c.fill();
      c.save();
      c.clip();
      for (let y = 0, k = 0; y < ch; y += PPM * 0.2, k++) {
        c.fillStyle = ['#c08a4c', '#b47e42', '#c89656'][k % 3];
        c.fillRect(0, y, cw, PPM * 0.2);
        c.fillStyle = '#5a3a1e';
        c.fillRect(0, y, cw, 3);
      }
      c.restore();
      poly(c, pl);
      c.lineWidth = 6;
      c.strokeStyle = '#5a3a1e';
      c.stroke();
    }
    // The tee box: a lighter striped square.
    const [tx, ty] = px(shape.hole.tee[0], shape.hole.tee[1]);
    c.fillStyle = 'rgba(220,255,180,0.18)';
    c.fillRect(tx - 0.55 * PPM, ty - 0.55 * PPM, 1.1 * PPM, 1.1 * PPM);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 4; k++) c.fillRect(tx - 0.55 * PPM, ty - 0.55 * PPM + k * 0.275 * PPM, 1.1 * PPM, 0.137 * PPM);
  }, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / W, 1 / H);
  t.offset.set(-x0 / W, -z0 / H);
  return t;
}

export class Course {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private flag: THREE.Mesh;
  private flagBase: Float32Array;
  readonly flagPole = new THREE.Group();
  private time = 0;
  private water: THREE.Mesh[] = [];
  /** The moving obstacles' models, in the hole's order. */
  private movers: THREE.Group[] = [];
  /** Mushroom bumpers (to squash when hit), clouds (drifting), things that spin. */
  private mushrooms: { m: THREE.Group; x: number; z: number; t: number }[] = [];
  private clouds: THREE.Group[] = [];
  private spinners: THREE.Object3D[] = [];
  /** The fields' height (rising into hills further out). */
  private meadowAt: (x: number, z: number) => number;

  constructor(readonly shape: Shape, holeNumber: number) {
    const g = this.group;
    const h = shape.heightAt;
    const hole = shape.hole;
    const ys = Array.from(shape.surface.positions).filter((_, i) => i % 3 === 1);
    const lowest = Math.min(...ys);
    const cxm = (shape.min[0] + shape.max[0]) / 2, czm = (shape.min[1] + shape.max[1]) / 2;
    this.meadowAt = (x, z) => {
      const d = Math.hypot(x - cxm, z - czm);
      const far = Math.max(0, d - 20) / 40;
      return lowest - 0.25 + far * far * 7 + Math.sin(x * 0.07) * Math.cos(z * 0.05) * far * 3;
    };

    // The green: the physics mesh itself.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(shape.surface.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(shape.surface.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(shape.surface.indices, 1));
    geo.computeVertexNormals();
    const green = new THREE.Mesh(geo, toonOwn(0xffffff, 0, paintSurface(shape)));
    green.receiveShadow = true;
    g.add(green);

    // Walls: planks (or dry stone) along every edge, drawn thicker than the physics wall to cover
    // the carpet's ragged edge, with a top rail.
    const style = hole.walls ?? 'wood';
    const wallMat = style === 'stone' ? texMat('stone', stoneTex) : texMat('wood', woodTex);
    const walls = new THREE.Mesh(this.wallGeometry(0.26, -0.3, WALL.height), wallMat);
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    const rail = new THREE.Mesh(this.wallGeometry(0.3, WALL.height - 0.005, WALL.height + 0.035, -0.015), toon(style === 'stone' ? 0xd8d0bc : 0xe0b070));
    rail.castShadow = true;
    g.add(rail);
    // Posts only where the wall turns a real corner (not along every smooth curve).
    for (const poly of [hole.outline, ...(hole.blocks ?? [])]) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[(i + poly.length - 1) % poly.length], p = poly[i], b = poly[(i + 1) % poly.length];
        const a1 = Math.atan2(p[1] - a[1], p[0] - a[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
        const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
        if (turn < 0.5 || hole.blocks?.includes(poly)) continue;
        const y = h(p[0], p[1]);
        const post = cyl(0.12, 0.13, WALL.height + 0.36, style === 'stone' ? toon(0xbcb4a0) : toon(0x9a6a38), p[0], y - 0.3, p[1], 10);
        g.add(post);
        g.add(ball(0.12, style === 'stone' ? toon(0xd8d0bc) : toon(0xe0b070), p[0], y + WALL.height + 0.07, p[1]));
      }
    }
    // Bumpers: stumps, rocks, or bouncy mushrooms.
    for (const [px, pz, pr, kind] of shape.posts) {
      const y = h(px, pz);
      if (kind === 'mushroom') {
        const m = mushroomBumper(pr);
        m.position.set(px, y, pz);
        g.add(m);
        this.mushrooms.push({ m, x: px, z: pz, t: 9 });
      } else if (kind === 'rock') {
        const r = rock(pr / 0.27);
        r.position.set(px, y + 0.05, pz);
        g.add(r);
      } else {
        g.add(cyl(pr, pr * 1.12, 0.32, texMat('bark', () => woodTex()), px, y - 0.1, pz, 14));
        const top = cyl(pr * 0.98, pr * 0.98, 0.012, toon(0xe8c890), px, y + 0.22, pz, 14);
        g.add(top);
        const ringTex = toon(0xb08850);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pr * 0.55, 0.008, 4, 18), ringTex);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(px, y + 0.227, pz);
        g.add(ring);
      }
    }

    // Islands: hedges, a bumpy leafy top along them.
    for (const b of hole.blocks ?? []) {
      const bys = b.map(([x, z]) => h(x, z));
      const lo = Math.min(...bys) - 0.3, hi = Math.max(...bys) + 0.3;
      const sh = new THREE.Shape(b.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo2 = new THREE.ExtrudeGeometry(sh, { depth: hi - lo, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
      geo2.rotateX(-Math.PI / 2);
      geo2.translate(0, lo, 0);
      // World-space texture coordinates so the leaves are the same size everywhere.
      const pp = geo2.attributes.position as THREE.BufferAttribute, uv = geo2.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) uv.setXY(i, (pp.getX(i) + pp.getZ(i)) * 1.5, pp.getY(i) * 1.5);
      const m = new THREE.Mesh(geo2, texMat('leaf', leafTexLocal));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      for (let i = 0; i < b.length; i++) {
        const a = b[i], c = b[(i + 1) % b.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        for (let k = 0; k < len / 0.3; k++) {
          const u = (k + 0.5) / Math.ceil(len / 0.3);
          const x = a[0] + (c[0] - a[0]) * u, z = a[1] + (c[1] - a[1]) * u;
          const bb = ball(0.16 + Math.random() * 0.06, toon([0x3e7e30, 0x4a9038, 0x356e2a][k % 3]), x, hi + 0.02, z);
          bb.scale.y = 0.7;
          g.add(bb);
        }
      }
    }
    // Ponds: water at its level over the dipped ground, lily pads (one in flower) and reeds.
    for (const p of shape.ponds) {
      const sh = new THREE.Shape(p.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const wg = new THREE.ShapeGeometry(sh);
      wg.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(wg, new THREE.MeshToonMaterial({ color: 0x4ab0e8, transparent: true, opacity: 0.8 }));
      water.position.y = p.level;
      water.userData.noInk = true;
      this.water.push(water);
      g.add(water);
      const xs = p.poly.map((q) => q[0]), zs = p.poly.map((q) => q[1]);
      for (let i = 0; i < 6; i++) {
        const lx = Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs)), lz = Math.min(...zs) + Math.random() * (Math.max(...zs) - Math.min(...zs));
        if (!insidePoly(lx, lz, p.poly)) continue;
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.1 + Math.random() * 0.06, 12, 0.3, Math.PI * 1.8), toon(0x3a9a3a));
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = Math.random() * 6;
        pad.position.set(lx, p.level + 0.005, lz);
        g.add(pad);
        if (i === 0) g.add(ball(0.04, toon(0xffa0c8), lx, p.level + 0.03, lz));
      }
    }
    // Pipes and burrows.
    for (const pipe of hole.pipes ?? []) {
      if (pipe.style === 'burrow') for (const [x, z] of [pipe.from, pipe.to]) g.add(burrowMouth(x, h(x, z), z, PIPE_R));
      else g.add(pipeMesh(pipe, h, PIPE_R));
    }
    // Tunnels and loops.
    for (const c of hole.covers ?? []) g.add(coverMesh(c, h));
    for (const l of hole.loops ?? []) {
      const m = loopMesh(l, h);
      m.traverse((o) => { if (o.userData.spin) this.spinners.push(o); });
      g.add(m);
    }
    // Things that move (placed each frame from the physics), and the buildings round them.
    for (const o of hole.obstacles ?? []) {
      const m = obstacleMesh(o);
      if (o.kind === 'spinner' && (hole.props ?? []).some((p) => p.kind === 'scarecrow' && p.at[0] === o.at[0] && p.at[1] === o.at[1])) m.add(scarecrowBody());
      this.movers.push(m);
      g.add(m);
    }
    for (const p of hole.props ?? []) if (p.kind !== 'scarecrow') g.add(propMesh(p, h(p.at[0], p.at[1])));

    // The cup: a dark hole with a white rim, and the flag.
    const [cx, cz] = hole.cup;
    const cy = h(cx, cz);
    const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(CUP.radius, 28), new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    holeMesh.rotation.x = -Math.PI / 2;
    holeMesh.position.set(cx, cy + 0.004, cz);
    g.add(holeMesh);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP.radius, CUP.radius + 0.02, 28), new THREE.MeshBasicMaterial({ color: 0xf4f4ee }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(cx, cy + 0.005, cz);
    g.add(rim);
    this.flagPole.position.set(cx, cy, cz);
    for (let i = 0; i < 6; i++) this.flagPole.add(cyl(0.016, 0.016, 0.22, toon(i % 2 ? 0xd83a30 : 0xf8f8f0), 0, i * 0.22, 0, 6));
    this.flagPole.add(ball(0.03, toon(0xf4d040), 0, 1.34, 0));
    const flagTex = canvasTex(null, 128, 96, (c) => {
      c.fillStyle = '#f0c020';
      c.fillRect(0, 0, 128, 96);
      c.fillStyle = '#e0a810';
      c.fillRect(0, 84, 128, 12);
      c.fillStyle = '#1a1410';
      c.font = '900 60px "Bungee", "Arial Black", Impact, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(holeNumber), 52, 48);
    }, false);
    const fgeo = new THREE.PlaneGeometry(0.5, 0.34, 8, 2);
    fgeo.translate(0.25, 0, 0);
    this.flag = new THREE.Mesh(fgeo, new THREE.MeshToonMaterial({ map: flagTex, side: THREE.DoubleSide }));
    this.flag.position.y = 1.15;
    this.flag.castShadow = true;
    this.flagBase = Float32Array.from(fgeo.attributes.position.array);
    this.flagPole.add(this.flag);
    g.add(this.flagPole);

    // The tee: a rubber mat, two tee markers, and the hole's signpost beside it.
    const [tx, tz] = hole.tee;
    const ty = h(tx, tz);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), toon(0x2a5a34));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(tx, ty + 0.004, tz);
    mat.receiveShadow = true;
    g.add(mat);
    const tdx = cx - tx, tdz = cz - tz, tl = Math.hypot(tdx, tdz) || 1;
    const ux = tdx / tl, uz = tdz / tl;
    // (Aim off the first stretch of the hole, not straight at the cup.)
    for (const s of [-1, 1]) g.add(ball(0.05, toon(s < 0 ? 0xf4f4ee : 0x3a7ad8), tx - uz * 0.42 * s - ux * 0.25, ty + 0.03, tz + ux * 0.42 * s - uz * 0.25));
    for (const s of [1, -1]) {
      let spot: P2 | null = null;
      for (let k = 1.1; k < 4; k += 0.15) {
        const x = tx - uz * k * s - ux * 0.6, z = tz + ux * k * s - uz * 0.6;
        if (!insidePoly(x, z, hole.outline) && nearestEdge(shape, x, z).d > 0.45) { spot = [x, z]; break; }
      }
      if (!spot) continue;
      const sign = signpost(holeNumber, hole.name, hole.par);
      sign.position.set(spot[0], this.groundAt(spot[0], spot[1]), spot[1]);
      sign.rotation.y = Math.atan2(-ux, -uz);
      g.add(sign);
      break;
    }

    this.bank();
    this.countryside();

    // Light: soft sky, and a warm sun from behind the tee's left so the shadows fall ahead.
    g.add(new THREE.HemisphereLight(0xdcecff, 0x5a7a3a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    const mid = new THREE.Vector3(cxm, 0, czm);
    this.sun.position.set(mid.x - 14, 30, mid.z + 18);
    this.sun.target.position.copy(mid);
    this.sun.castShadow = true;
    const span = Math.max(shape.max[0] - shape.min[0], shape.max[1] - shape.min[1]) / 2 + 8;
    const sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 90;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.sun, this.sun.target);
  }

  /**
   * The ground off the course: a grassy shoulder level with the course just outside the walls (where
   * the golfer stands and the flowers grow), then a bank down to the fields.
   */
  groundAt(x: number, z: number) {
    const meadow = this.meadowAt(x, z);
    const { d, p } = nearestEdge(this.shape, x, z);
    if (insidePoly(x, z, this.shape.hole.outline)) return this.shape.heightAt(p[0], p[1]) - 0.4;
    const H = this.shape.heightAt(p[0], p[1]) - 0.02;
    return d < 0.9 ? Math.max(meadow, H) : Math.max(meadow, H - (d - 0.9) * 1.25);
  }

  /** The bank the course sits on, and flower beds, tufts, stones and toadstools along its shoulder. */
  private bank() {
    const s = this.shape;
    const ys = Array.from(s.surface.positions).filter((_, i) => i % 3 === 1);
    const rise = Math.max(...ys) - Math.min(...ys) + 0.3;
    const E = 0.9 + rise / 1.25 + 0.6, C = 0.22;
    const x0 = s.min[0] - E, z0 = s.min[1] - E;
    const nx = Math.ceil((s.max[0] - s.min[0] + 2 * E) / C) + 1, nz = Math.ceil((s.max[1] - s.min[1] + 2 * E) / C) + 1;
    const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
    const keep: boolean[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * C, z = z0 + j * C;
        const y = this.groundAt(x, z), m = this.meadowAt(x, z);
        pos.push(x, y + 0.01, z);
        uv.push(x / 4, z / 4);
        // Steep: earth and rock; flat: grass (white shows the grass picture as it is).
        const { d, p } = nearestEdge(s, x, z);
        const H = s.heightAt(p[0], p[1]);
        const steep = d > 0.95 && H - 0.02 - (d - 0.9) * 1.25 > m + 0.05 ? 1 : 0;
        col.push(1 + steep * 0.55, 1 - steep * 0.3, 1 + steep * 0.2);
        keep.push(y > m + 0.015 || d < 1.2);
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (!(keep[a] || keep[b] || keep[c] || keep[d])) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = toonOwn(0xffffff, 0, meadowTex());
    m.vertexColors = true;
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    void earthTex;

    // Along the shoulder, walking round the outline: beds of flowers, tufts, a stone, toadstools.
    const flowers: [number, number, number][] = [], tufts: [number, number, number][] = [];
    const o = s.hole.outline;
    let next = Math.random() * 1.2;
    let run = 0;
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let u = 0; u < len; u += 0.2) {
        run += 0.2;
        if (run < next) continue;
        run = 0;
        next = 0.9 + Math.random() * 1.6;
        const t = u / len;
        const ex = a[0] + (b[0] - a[0]) * t, ez = a[1] + (b[1] - a[1]) * t;
        // Outward: away from the inside of the course.
        let ox = -(b[1] - a[1]) / len, oz = (b[0] - a[0]) / len;
        if (insidePoly(ex + ox * 0.3, ez + oz * 0.3, o)) { ox = -ox; oz = -oz; }
        const off = 0.35 + Math.random() * 0.3;
        const x = ex + ox * off, z = ez + oz * off;
        if (insidePoly(x, z, o) || nearestEdge(s, x, z).d < 0.25) continue;
        const y = this.groundAt(x, z);
        const r = Math.random();
        if (r < 0.55) {
          // A flower bed.
          for (let k = 0; k < 9; k++) {
            const fx = x + (Math.random() - 0.5) * 0.5, fz = z + (Math.random() - 0.5) * 0.5;
            if (!insidePoly(fx, fz, o) && nearestEdge(s, fx, fz).d > 0.2) flowers.push([fx, this.groundAt(fx, fz), fz]);
          }
        } else if (r < 0.8) {
          for (let k = 0; k < 4; k++) tufts.push([x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4]);
        } else if (r < 0.9) {
          const rk = rock(0.4 + Math.random() * 0.3);
          rk.position.set(x, y, z);
          this.group.add(rk);
        } else {
          for (let k = 0; k < 3; k++) {
            const ts = toadstool(0.8 + Math.random() * 0.6);
            ts.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
            this.group.add(ts);
          }
        }
      }
    }
    if (flowers.length) this.group.add(flowersAt(flowers));
    if (tufts.length) this.group.add(tuftsAt(tufts));
  }

  /**
   * One mesh for all the walls: for each segment a block from the inner face out to `depth`,
   * between `bottom` and `top` above the ground (so it follows slopes). `inset` moves the inner face.
   * Texture coordinates run along the wall (1 m) and up it (0.5 m) so the planks line up.
   */
  private wallGeometry(depth: number, bottom: number, top: number, inset = 0) {
    const h = this.shape.heightAt;
    const pos: number[] = [], uv: number[] = [];
    let run = 0;
    for (const w of this.shape.walls) {
      // Order the ends so the faces wind outward (the inner face toward the playing area).
      const lx = -(w.b[1] - w.a[1]), lz = w.b[0] - w.a[0];
      const [[ax, az], [bx, bz]] = lx * w.n[0] + lz * w.n[1] >= 0 ? [w.a, w.b] : [w.b, w.a];
      const [nx, nz] = w.n;
      const ix = nx * inset, iz = nz * inset, ox = -nx * depth, oz = -nz * depth;
      const ya = h(ax, az), yb = h(bx, bz);
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = run, u1 = run + len;
      run = u1;
      const V = (y: number) => y / 0.5 + 0.5;
      // Corners: inner (a, b) and outer (a, b), bottom and top.
      const iaB = [ax + ix, ya + bottom, az + iz], ibB = [bx + ix, yb + bottom, bz + iz], ibT = [bx + ix, yb + top, bz + iz], iaT = [ax + ix, ya + top, az + iz];
      const oaB = [ax + ox, ya + bottom, az + oz], obB = [bx + ox, yb + bottom, bz + oz], obT = [bx + ox, yb + top, bz + oz], oaT = [ax + ox, ya + top, az + oz];
      const quad = (p: number[][], t: number[][]) => {
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); uv.push(...t[k]); }
      };
      quad([iaB, ibB, ibT, iaT], [[u0, V(bottom)], [u1, V(bottom)], [u1, V(top)], [u0, V(top)]]);
      quad([obB, oaB, oaT, obT], [[u1, V(bottom)], [u0, V(bottom)], [u0, V(top)], [u1, V(top)]]);
      quad([iaT, ibT, obT, oaT], [[u0, 0], [u1, 0], [u1, depth / 0.5], [u0, depth / 0.5]]);
      quad([oaB, iaB, iaT, oaT], [[0, V(bottom)], [depth, V(bottom)], [depth, V(top)], [0, V(top)]]);
      quad([ibB, obB, obT, ibT], [[0, V(bottom)], [depth, V(bottom)], [depth, V(top)], [0, V(top)]]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }

  /** The countryside round the hole. */
  private countryside() {
    const g = this.group;
    const s = this.shape;
    const cxm = (s.min[0] + s.max[0]) / 2, czm = (s.min[1] + s.max[1]) / 2;
    // Rolling fields: flat round the course, rising into hills further out.
    const groundGeo = new THREE.PlaneGeometry(300, 300, 100, 100);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(cxm, 0, czm);
    const gp = groundGeo.attributes.position as THREE.BufferAttribute, guv = groundGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) {
      gp.setY(i, this.meadowAt(gp.getX(i), gp.getZ(i)));
      guv.setXY(i, gp.getX(i) / 4, gp.getZ(i) / 4);
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, toonOwn(0xffffff, 0, meadowTex()));
    ground.receiveShadow = true;
    g.add(ground);

    // Sky: deep blue overhead to a pale haze at the horizon.
    const sky = canvasTex(null, 4, 256, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#3a8ee0');
      grd.addColorStop(0.45, '#8cc4f0');
      grd.addColorStop(0.62, '#d8eef8');
      grd.addColorStop(1, '#d8eef8');
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 256);
    }, false);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })));
    for (let i = 0; i < 9; i++) {
      const c = cloud();
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 80;
      c.position.set(cxm + Math.cos(a) * d, 30 + Math.random() * 25, czm + Math.sin(a) * d);
      c.scale.setScalar(1 + Math.random() * 1.2);
      c.lookAt(cxm, c.position.y, czm);
      this.clouds.push(c);
      g.add(c);
    }

    // Scatter things in the fields, never on or right by the course (and trees well back, so they
    // never come between the camera and the ball).
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const place = (n: number, minEdge: number, maxD: number, make: (x: number, y: number, z: number) => THREE.Object3D | void) => {
      for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
        const a = Math.random() * Math.PI * 2, d = rnd(2, maxD);
        const x = cxm + Math.cos(a) * d, z = czm + Math.sin(a) * d;
        if (x > s.min[0] - minEdge && x < s.max[0] + minEdge && z > s.min[1] - minEdge && z < s.max[1] + minEdge) {
          if (insidePoly(x, z, s.hole.outline) || nearestEdge(s, x, z).d < minEdge) continue;
        }
        const o = make(x, this.groundAt(x, z), z);
        if (o) { o.position.set(x, this.groundAt(x, z), z); g.add(o); }
        i++;
      }
    };
    place(34, 6.5, 55, () => (Math.random() < 0.7 ? tree() : pine()));
    place(26, 1.6, 26, () => bush(0.9 + Math.random() * 0.6));
    place(16, 1.6, 30, () => rock(0.8 + Math.random() * 1.4));
    // Flowers and tufts all over the fields.
    const fl: [number, number, number][] = [], tf: [number, number, number][] = [];
    for (let i = 0; i < 2600; i++) {
      const x = cxm + rnd(-32, 32), z = czm + rnd(-32, 32);
      if (insidePoly(x, z, s.hole.outline) || nearestEdge(s, x, z).d < 1.0) continue;
      // In drifts: more where a slow wave says so.
      if (Math.sin(x * 0.4) * Math.cos(z * 0.33) < 0.1 && Math.random() < 0.7) continue;
      (Math.random() < 0.55 ? fl : tf).push([x, this.groundAt(x, z), z]);
    }
    g.add(flowersAt(fl), tuftsAt(tf));
    // Hay bales in the fields.
    place(5, 9, 30, () => {
      const bale = new THREE.Group();
      const c = cyl(0.45, 0.45, 0.8, toon(0xe0b850), 0, -0.4, 0, 16);
      c.rotation.z = Math.PI / 2;
      c.position.y = 0.45;
      bale.add(c);
      bale.rotation.y = Math.random() * 3;
      bale.traverse((o) => { o.castShadow = true; });
      return bale;
    });
    // A fence along one side, and a farm on the hill: a red barn and a white farmhouse.
    const fz = s.min[1] - 8;
    for (let x = cxm - 24; x <= cxm + 24; x += 2) {
      const y = this.groundAt(x, fz);
      g.add(cyl(0.06, 0.07, 1.0, toon(0x8a6a48), x, y, fz, 6));
      if (x < cxm + 24) {
        for (const yy of [0.45, 0.8]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.04), toon(0xa0805a));
          r.position.set(x + 1, (y + this.groundAt(x + 2, fz)) / 2 + yy, fz);
          r.castShadow = true;
          g.add(r);
        }
      }
    }
    const farm = (x: number, z: number, rot: number, color: number, roofColor: number, w: number, hgt: number, d: number) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), toon(color));
      body.position.y = hgt / 2;
      b.add(body);
      const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, hgt * 0.6)]);
      const rg = new THREE.ExtrudeGeometry(tri, { depth: d + 0.4, bevelEnabled: false });
      rg.translate(0, 0, -(d + 0.4) / 2);
      const roof = new THREE.Mesh(rg, toon(roofColor));
      roof.position.y = hgt;
      b.add(roof);
      for (const sx of [-w / 4, w / 4]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.05), toon(0x6a9ad8));
        win.position.set(sx, hgt * 0.6, d / 2 + 0.02);
        b.add(win);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, hgt * 0.55, 0.05), toon(0xf4f0e0));
      door.position.set(0, hgt * 0.275, d / 2 + 0.02);
      b.add(door);
      b.position.set(x, this.groundAt(x, z), z);
      b.rotation.y = rot;
      b.traverse((o) => { o.castShadow = true; });
      g.add(b);
    };
    farm(cxm + 18, s.min[1] - 16, -0.4, 0xb83a2a, 0x5a3a2a, 6, 3.4, 4.5);
    farm(cxm - 20, s.min[1] - 20, 0.5, 0xf4ecd8, 0xc0503a, 5, 3, 4);
  }

  /** A mushroom's been hit: squash it. */
  boingAt(x: number, z: number) {
    let best = null as (typeof this.mushrooms)[number] | null, bd = 0.6;
    for (const m of this.mushrooms) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } }
    if (best) best.t = 0;
  }

  /** Put the moving obstacles where the physics has them. */
  setObstacles(poses: { x: number; y: number; z: number; q: THREE.Quaternion }[]) {
    poses.forEach((p, i) => {
      const m = this.movers[i];
      if (!m) return;
      m.position.set(p.x, p.y, p.z);
      m.quaternion.copy(p.q);
    });
  }

  /** The flag flutters, the water shimmers, clouds drift, mushrooms wobble back. */
  update(dt: number) {
    for (const w of this.water) (w.material as THREE.MeshToonMaterial).opacity = 0.78 + Math.sin(this.time * 2) * 0.03;
    this.time += dt;
    const p = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = this.flagBase[i * 3];
      p.setZ(i, Math.sin(this.time * 5 - x * 9) * 0.05 * (x / 0.5));
    }
    p.needsUpdate = true;
    for (const c of this.clouds) c.position.x += dt * 0.6;
    for (const sp of this.spinners) sp.rotation.y += dt * 2;
    for (const m of this.mushrooms) {
      m.t += dt;
      const k = Math.exp(-m.t * 6) * Math.sin(m.t * 30) * 0.25;
      m.m.scale.set(1 + k, 1 - k, 1 + k);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
  }
}

/** (Hedge leaves, used by the islands.) */
function leafTexLocal() {
  return leafTexShared();
}
