// The stadium: a striped grass pitch with its markings, goals with nets, corner flags, ad boards,
// stands full of cut-out fans, floodlights, sky and sun. The near side (where the camera sits)
// only has low boards so it never blocks the view.
import * as THREE from 'three';
import { PITCH } from '../data/tuning';
import { canvasTexture, cyl, part, rbox, toon } from './toon';

const L = PITCH.length / 2, W = PITCH.width / 2;
const LINE = 0.12;

export interface StadiumLook {
  grass: number;
  grass2: number;
  surround: number;
  sky: [string, string];
  /** Shirt colours in the crowd (the two teams' fans, mostly). */
  fans: number[];
}

export const DEFAULT_LOOK: StadiumLook = {
  grass: 0x4c9c3c,
  grass2: 0x43902f,
  surround: 0x3a7a30,
  sky: ['#6fb4ec', '#d6ecf8'],
  fans: [0xd8302c, 0x2a5ad8, 0xf4d030, 0xffffff],
};

export class Stadium {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  /** One strip of cut-out fans per row of each stand (and where it sits when they're not jumping). */
  private crowdRows: { mesh: THREE.Mesh; y: number; phase: number }[] = [];
  private nets: THREE.LineSegments[] = [];
  private netShake = [0, 0];
  private time = 0;
  private flags: THREE.Mesh[] = [];

  constructor(look: StadiumLook = DEFAULT_LOOK) {
    const g = this.group;

    // Sky dome with a gradient.
    const skyTex = canvasTexture(4, 256, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, look.sky[0]);
      grd.addColorStop(0.55, look.sky[1]);
      grd.addColorStop(1, look.sky[1]);
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 256);
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    g.add(sky);

    // Ground around the pitch, then the pitch with mowing stripes.
    const surround = part(new THREE.PlaneGeometry(200, 160), look.surround, 0, -0.01, 0);
    surround.rotation.x = -Math.PI / 2;
    surround.castShadow = false;
    g.add(surround);
    const stripes = 14;
    const grassTex = canvasTexture(1024, 512, (c) => {
      for (let i = 0; i < stripes; i++) {
        c.fillStyle = `#${(i % 2 ? look.grass : look.grass2).toString(16).padStart(6, '0')}`;
        c.fillRect((i * 1024) / stripes, 0, 1024 / stripes + 1, 512);
      }
      // Speckles, so it reads as grass up close.
      for (let i = 0; i < 9000; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
        c.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
      }
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.length + 6, PITCH.width + 6), new THREE.MeshToonMaterial({ map: grassTex }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    g.add(pitch);
    this.markings();

    for (const end of [-1, 1]) this.goal(end);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cornerFlag(sx * L, sz * W);
    this.boards();
    this.stands(look.fans);
    this.floodlights();

    // Light: soft sky fill, and a sun from behind the camera's left so shadows fall away from us.
    g.add(new THREE.HemisphereLight(0xdcecff, 0x4a6a3a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    this.sun.position.set(-18, 40, 26);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -L - 6; sc.right = L + 6; sc.top = W + 10; sc.bottom = -W - 10;
    sc.near = 1; sc.far = 120;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.sun, this.sun.target);
  }

  private markings() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf2f2ea });
    const lines = new THREE.Group();
    const strip = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0) + LINE;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, LINE), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
      m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
      lines.add(m);
    };
    const arc = (x: number, z: number, r: number, from: number, len: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - LINE / 2, r + LINE / 2, 64, 1, from, len), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      lines.add(m);
    };
    const spot = (x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      lines.add(m);
    };
    // Outline, halfway line, centre circle.
    strip(-L, -W, L, -W); strip(-L, W, L, W); strip(-L, -W, -L, W); strip(L, -W, L, W);
    strip(0, -W, 0, W);
    arc(0, 0, PITCH.circle, 0, Math.PI * 2);
    spot(0, 0);
    for (const s of [-1, 1]) {
      const gx = s * L;
      const bx = gx - s * PITCH.boxDepth, bw = PITCH.boxWidth / 2;
      strip(gx, -bw, bx, -bw); strip(gx, bw, bx, bw); strip(bx, -bw, bx, bw);
      const sx = gx - s * PITCH.smallDepth, sw = PITCH.smallWidth / 2;
      strip(gx, -sw, sx, -sw); strip(gx, sw, sx, sw); strip(sx, -sw, sx, sw);
      const px = gx - s * PITCH.spot;
      spot(px, 0);
      // The "D": the part of the circle round the spot that's outside the box.
      const half = Math.acos((PITCH.boxDepth - PITCH.spot) / PITCH.circle);
      if (s > 0) arc(px, 0, PITCH.circle, Math.PI - half, half * 2);
      else arc(px, 0, PITCH.circle, -half, half * 2);
      // Corner arcs.
      for (const sz of [-1, 1]) {
        const from = s > 0 ? (sz > 0 ? Math.PI / 2 : Math.PI) : sz > 0 ? 0 : -Math.PI / 2;
        arc(gx, sz * W, 0.8, from, Math.PI / 2);
      }
    }
    this.group.add(lines);
  }

  private goal(end: number) {
    const gx = end * L, gw = PITCH.goalWidth / 2, gh = PITCH.goalHeight, d = PITCH.goalDepth, r = PITCH.post;
    const white = toon(0xf8f8f4, 0.15);
    const frame = new THREE.Group();
    for (const s of [-1, 1]) frame.add(cyl(r, r, gh + r, white, gx, 0, s * gw));
    const bar = cyl(r, r, gw * 2 + r * 2, white, 0, 0, 0);
    bar.geometry.translate(0, -(gw * 2 + r * 2) / 2, 0);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, gh, 0);
    frame.add(bar);
    // The cage behind: back posts, top rails and ground bars (thin, grey), making a box.
    const grey = toon(0x8a8a90);
    const back = gx + end * d, rr = 0.03;
    const bar3 = (a: THREE.Vector3, b: THREE.Vector3) => {
      const m = part(new THREE.CylinderGeometry(rr, rr, a.distanceTo(b), 6), grey);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      frame.add(m);
    };
    for (const s of [-1, 1]) {
      bar3(new THREE.Vector3(back, 0, s * gw), new THREE.Vector3(back, gh, s * gw));
      bar3(new THREE.Vector3(gx, gh, s * gw), new THREE.Vector3(back, gh, s * gw));
      bar3(new THREE.Vector3(gx, rr, s * gw), new THREE.Vector3(back, rr, s * gw));
    }
    bar3(new THREE.Vector3(back, gh, -gw), new THREE.Vector3(back, gh, gw));
    bar3(new THREE.Vector3(back, rr, -gw), new THREE.Vector3(back, rr, gw));
    this.group.add(frame);

    // The net: a grid on the back, the roof and both sides.
    const pts: number[] = [];
    const step = 0.16;
    for (let z = -gw; z <= gw + 1e-3; z += step) {
      pts.push(back, 0, z, back, gh, z);
      pts.push(gx, gh, z, back, gh, z);
    }
    for (let y = 0; y <= gh + 1e-3; y += step) pts.push(back, y, -gw, back, y, gw);
    for (let u = 0; u <= d + 1e-3; u += step) pts.push(gx + end * u, gh, -gw, gx + end * u, gh, gw);
    for (const s of [-1, 1]) {
      for (let u = 0; u <= d + 1e-3; u += step) pts.push(gx + end * u, 0, s * gw, gx + end * u, gh, s * gw);
      for (let y = 0; y <= gh + 1e-3; y += step) pts.push(gx, y, s * gw, back, y, s * gw);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const net = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    net.userData.base = Float32Array.from(pts);
    net.userData.end = end;
    this.nets.push(net);
    this.group.add(net);
  }

  /** The net bulges when the ball hits it. */
  shakeNet(end: number, power: number) {
    this.netShake[end > 0 ? 1 : 0] = Math.min(1, power / 20);
  }

  private cornerFlag(x: number, z: number) {
    this.group.add(cyl(0.025, 0.025, 1.3, 0xf4f4ee, x, 0, z));
    const flag = part(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, -0.15, 0), new THREE.Vector3(0, -0.3, 0)]), new THREE.MeshBasicMaterial({ color: 0xf0d020, side: THREE.DoubleSide }));
    flag.geometry.computeVertexNormals();
    flag.position.set(x, 1.3, z);
    this.flags.push(flag);
    this.group.add(flag);
  }

  private boards() {
    const ads = ['CARROT COLA', 'MUD SPA', 'CHEESE PLEASE', 'BONE APPETIT', 'HONEY MONEY', 'QUACK SNACKS', 'BIN THERE', 'PURR-FECT PIES'];
    const colors = ['#e8402c', '#2a6ad8', '#f0c020', '#2a9a4a', '#8a3ac0', '#f07c1c'];
    const tex = canvasTexture(2048, 64, (c) => {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = colors[i % colors.length];
        c.fillRect(i * 256, 0, 256, 64);
        c.fillStyle = '#ffffff';
        c.font = '900 34px "Arial Black", Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(ads[i], i * 256 + 128, 34, 240);
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    const board = (x: number, z: number, len: number, ry: number) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 16, 1);
      // Ads on the two big faces only; plain edges.
      const face = new THREE.MeshToonMaterial({ map: t }), edge = toon(0x2a2a30);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.12), [edge, edge, edge, edge, face, face]);
      m.position.set(x, 0.3, z);
      m.rotation.y = ry;
      this.group.add(m);
    };
    board(0, -W - 2.2, PITCH.length + 6, 0);
    board(0, W + 2.2, PITCH.length + 6, Math.PI);
    for (const s of [-1, 1]) {
      board(s * (L + 2.6), -W / 2 - 3, W - 3, s * -Math.PI / 2);
      board(s * (L + 2.6), W / 2 + 3, W - 3, s * -Math.PI / 2);
    }
  }

  /**
   * Stands on the far side and behind both goals. The fans are painted cut-outs (a strip of them
   * standing on each row): cheap to draw, and from the broadcast camera they read as a crowd.
   */
  private stands(fans: number[]) {
    const concrete = toon(0x9a968e), seat = toon(0x5a6a8a);
    const rows = 7, rowD = 1.15, rowH = 0.75;
    const textures = [0, 1, 2].map(() => crowdTexture(fans));
    const stripH = 1.2, stripW = 15.5;
    const stand = (cx: number, cz: number, len: number, ry: number) => {
      const s = new THREE.Group();
      for (let i = 0; i < rows; i++) {
        s.add(rbox(len, rowH * (i + 1), rowD, i % 2 ? concrete : seat, 0, (rowH * (i + 1)) / 2, -i * rowD, 0.02));
      }
      s.add(rbox(len, 0.3, rows * rowD + 2, toon(0x3a3a44), 0, rowH * rows + 4.2, -(rows - 1) * rowD / 2 - 0.5, 0.05));
      for (const x of [-len / 2 + 0.3, len / 2 - 0.3]) s.add(cyl(0.12, 0.12, rowH * rows + 4.2, 0x6a6a72, x, 0, -(rows - 1) * rowD - 0.4));
      for (let i = 0; i < rows; i++) {
        const t = textures[(i + Math.floor(Math.random() * 3)) % 3].clone();
        t.needsUpdate = true;
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.set(len / stripW, 1);
        t.offset.x = Math.random();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, stripH), new THREE.MeshToonMaterial({ map: t, alphaTest: 0.5 }));
        const y = rowH * (i + 1) + stripH / 2 - 0.12;
        mesh.position.set(0, y, -i * rowD - 0.15);
        s.add(mesh);
        this.crowdRows.push({ mesh, y, phase: Math.random() * Math.PI * 2 });
      }
      s.position.set(cx, 0, cz);
      s.rotation.y = ry;
      this.group.add(s);
    };
    stand(0, -W - 5, PITCH.length + 6, 0);
    stand(-L - 6, 0, PITCH.width + 2, Math.PI / 2);
    stand(L + 6, 0, PITCH.width + 2, -Math.PI / 2);
  }

  private floodlights() {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (L + 9), z = sz * (W + 8);
        if (sz > 0) continue;
        this.group.add(cyl(0.25, 0.35, 22, 0x7a7a82, x, 0, z));
        const panel = rbox(3.2, 1.8, 0.4, toon(0xf8f4e0, 0.6), x, 22.5, z + 0.3);
        panel.rotation.x = 0.5;
        this.group.add(panel);
      }
    }
  }

  /** Fans jump up when it gets exciting (goals!), nets settle, flags flap. */
  update(dt: number, excitement: number) {
    this.time += dt;
    const t = this.time;
    const jump = Math.max(0, (excitement - 0.55) / 0.45) * 0.14;
    for (const r of this.crowdRows) r.mesh.position.y = r.y + Math.max(0, Math.sin(t * 9 + r.phase)) * jump;
    for (const f of this.flags) f.rotation.y = Math.sin(t * 3 + f.position.x) * 0.4;
    this.nets.forEach((net, i) => {
      const k = this.netShake[i];
      this.netShake[i] = Math.max(0, k - dt * 1.2);
      const base = net.userData.base as Float32Array;
      const pos = net.geometry.attributes.position as THREE.BufferAttribute;
      const end = net.userData.end as number;
      const wob = k * Math.sin(t * 22) * 0.12;
      for (let j = 0; j < pos.count; j++) {
        const bx = base[j * 3], by = base[j * 3 + 1], bz = base[j * 3 + 2];
        const depth = Math.abs(bx - end * L);
        const w = Math.max(0, 1 - Math.abs(bz) / (PITCH.goalWidth / 2)) * Math.max(0, by / PITCH.goalHeight + 0.3);
        pos.setXYZ(j, bx + end * (wob + k * 0.25) * w * Math.min(1, depth + 0.2), by, bz);
      }
      pos.needsUpdate = true;
    });
  }
}

/**
 * A strip of fans drawn on a canvas: animals of all kinds (round ears, pointy ears, long bunny ears,
 * duck beaks), mostly in the teams' colours, some with their arms up or waving scarves.
 */
function crowdTexture(shirts: number[]) {
  const furs = ['#8a5a34', '#f2ece4', '#a8988c', '#f09040', '#f4b4b8', '#5a4636', '#e8d070', '#6a6a72', '#c88850'];
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const n = 25, cw = 2048 / n;
  return canvasTexture(2048, 160, (c) => {
    c.lineWidth = 3;
    c.strokeStyle = '#15110f';
    c.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.08) continue;
      const x = i * cw + cw / 2 + (Math.random() - 0.5) * 10;
      const base = 160, s = 0.85 + Math.random() * 0.25;
      const shirt = Math.random() < 0.82 ? hex(shirts[Math.floor(Math.random() * shirts.length)]) : ['#4a4a5a', '#e0e0e0', '#3a7a4a'][i % 3];
      const fur = furs[Math.floor(Math.random() * furs.length)];
      const kind = Math.floor(Math.random() * 5);
      const hy = base - 74 * s;
      const up = Math.random() < 0.3;
      // Arms up (behind the head), then the body.
      if (up) {
        c.fillStyle = shirt;
        for (const d of [-1, 1]) {
          c.beginPath();
          c.roundRect(x + d * 22 * s - 6, hy - 34 * s, 12, 50 * s, 6);
          c.fill(); c.stroke();
        }
      }
      c.fillStyle = shirt;
      c.beginPath();
      c.roundRect(x - 27 * s, base - 46 * s, 54 * s, 60 * s, 16 * s);
      c.fill(); c.stroke();
      // Ears.
      c.fillStyle = fur;
      const ear = (dx: number) => {
        c.beginPath();
        if (kind === 0) c.arc(x + dx * 17 * s, hy - 19 * s, 10 * s, 0, Math.PI * 2);
        else if (kind === 1) { c.moveTo(x + dx * 8 * s, hy - 20 * s); c.lineTo(x + dx * 22 * s, hy - 38 * s); c.lineTo(x + dx * 24 * s, hy - 12 * s); c.closePath(); }
        else if (kind === 2) c.ellipse(x + dx * 9 * s, hy - 40 * s, 7 * s, 22 * s, dx * 0.15, 0, Math.PI * 2);
        else return;
        c.fill(); c.stroke();
      };
      ear(-1); ear(1);
      // Head, eyes, and a beak or snout for some.
      c.beginPath();
      c.arc(x, hy, 24 * s, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.fillStyle = '#15110f';
      for (const d of [-1, 1]) { c.beginPath(); c.arc(x + d * 8 * s, hy - 3 * s, 3.5 * s, 0, Math.PI * 2); c.fill(); }
      if (kind === 3) { c.fillStyle = '#f4a020'; c.beginPath(); c.ellipse(x, hy + 9 * s, 11 * s, 6 * s, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      else if (kind === 4) { c.fillStyle = '#f4b4b8'; c.beginPath(); c.ellipse(x, hy + 8 * s, 9 * s, 7 * s, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      // A scarf held up now and then.
      if (!up && Math.random() < 0.12) {
        c.fillStyle = shirt;
        c.beginPath();
        c.roundRect(x - 34 * s, hy - 52 * s, 68 * s, 12 * s, 3);
        c.fill(); c.stroke();
      }
    }
  });
}
