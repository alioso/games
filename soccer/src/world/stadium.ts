// The stadium: the home team's ground (its stands, colours, name and pitch pattern), at a time of
// day and in some weather: a grass pitch with its markings, goals with nets, corner flags, ad
// boards, stands full of cut-out fans (home fans, and the away end), floodlights, sky and light,
// and rain, snow or leaves blowing about. The near side (where the camera sits)
// only has low boards so it never blocks the view.
import * as THREE from 'three';
import { CONDITIONS, PITCH } from '../data/tuning';
import { GROUNDS, type Ground, type TimeOfDay, type Weather } from '../data/grounds';
import type { Animal } from '../data/teams';
import { canvasTexture, cyl, part, rbox, toon } from './toon';

const L = PITCH.length / 2, W = PITCH.width / 2;
const LINE = 0.12;

export interface Fans {
  animal: Animal;
  fur: number;
  /** Shirt colours they wear. */
  colors: number[];
}

export interface StadiumLook {
  ground: Ground;
  time: TimeOfDay;
  weather: Weather;
  /** The home fans (most of the ground) and the away end (none in training). */
  home: Fans;
  away: Fans | null;
}

export const DEFAULT_LOOK: StadiumLook = {
  ground: GROUNDS.dog,
  time: 'day',
  weather: 'sunny',
  home: { animal: 'dog', fur: 0xc8884a, colors: [0xd8302c, 0x2a5ad8, 0xf4d030, 0xffffff] },
  away: null,
};

/** Sky colours (top, horizon) by time of day and weather. */
function skyFor(time: TimeOfDay, w: Weather): [string, string] {
  const grey = w === 'cloudy' || w === 'rain';
  if (time === 'night') return w === 'snow' ? ['#101828', '#3a4458'] : grey ? ['#0a0c18', '#262a3a'] : ['#05081a', '#1c2850'];
  if (time === 'evening') return w === 'snow' ? ['#5a5a7a', '#e0b0a0'] : grey ? ['#4a4a64', '#b88070'] : ['#34448a', '#f6a05c'];
  return w === 'snow' ? ['#9aa6b4', '#e6eaf0'] : w === 'rain' ? ['#5a6676', '#9aa4b0'] : w === 'cloudy' ? ['#8a9aac', '#d0d6de'] : ['#6fb4ec', '#d6ecf8'];
}

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);
const css = (c: THREE.Color | number) => `#${(typeof c === 'number' ? new THREE.Color(c) : c).getHexString()}`;

export class Stadium {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  /** Fog for rain and snow (the scene takes it), or none. */
  readonly fog: THREE.Fog | null = null;
  /** One strip of cut-out fans per row of each stand (and where it sits when they're not jumping). */
  private crowdRows: { mesh: THREE.Mesh; y: number; phase: number; away: boolean }[] = [];
  private nets: THREE.LineSegments[] = [];
  private netShake = [0, 0];
  private time = 0;
  private flags: THREE.Mesh[] = [];
  /** Rain streaks, snowflakes or blowing leaves, in a box that follows the camera. */
  private particles: { obj: THREE.LineSegments | THREE.Points; pos: Float32Array; kind: 'rain' | 'snow' | 'leaves'; n: number } | null = null;
  /** The home or away end singing (they bounce in time). */
  private chanting: { away: boolean; from: number; until: number; beat: number } | null = null;

  constructor(readonly look: StadiumLook = DEFAULT_LOOK) {
    const g = this.group;
    const { ground, time, weather } = look;
    const night = time === 'night', evening = time === 'evening';

    // Sky dome with a gradient.
    const sk = skyFor(time, weather);
    const skyTex = canvasTexture(4, 256, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, sk[0]);
      grd.addColorStop(0.55, sk[1]);
      grd.addColorStop(1, sk[1]);
      c.fillStyle = grd;
      c.fillRect(0, 0, 4, 256);
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    g.add(sky);

    // Ground around the pitch, then the pitch: mowing pattern, wear, and the weather on it.
    const snow = weather === 'snow', wet = weather === 'rain';
    const surround = part(new THREE.PlaneGeometry(200, 160), snow ? 0xdde4ea : wet ? 0x2f6a28 : 0x3a7a30, 0, -0.01, 0);
    surround.rotation.x = -Math.PI / 2;
    surround.castShadow = false;
    g.add(surround);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.length + 6, PITCH.width + 6), new THREE.MeshToonMaterial({ map: grassTexture(ground, weather) }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    g.add(pitch);
    this.markings();

    for (const end of [-1, 1]) this.goal(end);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cornerFlag(sx * L, sz * W);
    this.boards();
    this.stands();
    this.floodlights(night ? 1.6 : evening ? 0.9 : 0.6);

    // Light: sky fill plus a sun from behind the camera's left (low and orange at sunset; at night
    // the floodlights, high overhead). Grey skies flatten it all out.
    const dull = weather === 'cloudy' || wet || snow;
    const hemi = night ? new THREE.HemisphereLight(0x6a78b0, 0x141e14, 0.5)
      : evening ? new THREE.HemisphereLight(0xffd0b0, 0x4a5a3a, dull ? 1.4 : 1.05)
      : new THREE.HemisphereLight(0xdcecff, 0x4a6a3a, dull ? 2.0 : 1.5);
    g.add(hemi);
    this.sun = night ? new THREE.DirectionalLight(0xe8f0ff, 2.1)
      : evening ? new THREE.DirectionalLight(0xffa860, dull ? 1.0 : 2.5)
      : new THREE.DirectionalLight(0xfff4e0, dull ? 1.1 : 2.6);
    if (night) this.sun.position.set(6, 45, 14);
    else if (evening) this.sun.position.set(-46, 13, 20);
    else this.sun.position.set(-18, 40, 26);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -L - 6; sc.right = L + 6; sc.top = W + 10; sc.bottom = -W - 10;
    sc.near = 1; sc.far = 140;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.sun, this.sun.target);

    if (wet) this.fog = new THREE.Fog(night ? 0x1a1e2a : 0x8a94a0, 35, 150);
    if (snow) this.fog = new THREE.Fog(night ? 0x2a3040 : 0xc8d0da, 35, 160);
    if (wet || snow || weather === 'windy') this.makeParticles(wet ? 'rain' : snow ? 'snow' : 'leaves');
  }

  /** Free the GPU memory (geometries and our own textures). */
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) (mat as THREE.MeshBasicMaterial).map?.dispose();
    });
  }

  private makeParticles(kind: 'rain' | 'snow' | 'leaves') {
    const n = kind === 'rain' ? 2600 : kind === 'snow' ? 2200 : 140;
    const pos = new Float32Array(n * (kind === 'rain' ? 6 : 3));
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 16, z = -W - 6 + Math.random() * (PITCH.width + 22);
      if (kind === 'rain') pos.set([x, y, z, x, y + 0.45, z], i * 6);
      else pos.set([x, kind === 'leaves' ? y * 0.3 : y, z], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = kind === 'rain'
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xdde6f2, transparent: true, opacity: 0.35, depthWrite: false }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ color: kind === 'snow' ? 0xffffff : 0xc0782c, size: kind === 'snow' ? 0.13 : 0.2, transparent: true, opacity: 0.95, depthWrite: false }));
    obj.frustumCulled = false;
    this.group.add(obj);
    this.particles = { obj, pos, kind, n };
  }

  /** The home or away end starts singing (they bounce in time with it) for a few seconds. */
  chant(away: boolean, secs: number, delay = 0, beat = 0.45) {
    this.chanting = { away, from: this.time + delay, until: this.time + delay + secs, beat };
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
   * standing on each row): cheap to draw, and from the broadcast camera they read as a crowd. The
   * home fans fill most of it; the away fans have the end on the right.
   */
  private stands() {
    const { ground, home, away } = this.look;
    const seatA = toon(ground.seats[0]), seatB = toon(ground.seats[1]);
    const rows = ground.rows, rowD = 1.15, rowH = 0.75;
    const homeTex = [0, 1, 2].map(() => crowdTexture(home, 0.75));
    const awayTex = away ? [0, 1].map(() => crowdTexture(away, 0.85)) : homeTex;
    const stripH = 1.2, stripW = 15.5;
    const top = rowH * rows;
    const stand = (cx: number, cz: number, len: number, ry: number, awayEnd: boolean, sign: boolean) => {
      const s = new THREE.Group();
      for (let i = 0; i < rows; i++) {
        s.add(rbox(len, rowH * (i + 1), rowD, i % 2 ? seatB : seatA, 0, (rowH * (i + 1)) / 2, -i * rowD, 0.02));
      }
      // Back wall, then a roof on posts (if the ground has one).
      s.add(rbox(len, top + 1.2, 0.4, toon(0x6a6a72), 0, (top + 1.2) / 2, -rows * rowD + 0.3, 0.02));
      if (ground.roof !== null) {
        s.add(rbox(len, 0.3, rows * rowD + 2, toon(ground.roof), 0, top + 4.2, -(rows - 1) * rowD / 2 - 0.5, 0.05));
        for (const x of [-len / 2 + 0.3, len / 2 - 0.3]) s.add(cyl(0.12, 0.12, top + 4.2, 0x6a6a72, x, 0, -(rows - 1) * rowD - 0.4));
      }
      if (sign) {
        // The ground's name along the front of the roof (or on top of the back wall).
        const tex = canvasTexture(1024, 96, (c) => {
          c.fillStyle = css(shade(ground.roof ?? ground.seats[0], ground.roof === null ? 0.8 : 1));
          c.fillRect(0, 0, 1024, 96);
          c.fillStyle = '#ffffff';
          c.strokeStyle = '#15110f';
          c.lineWidth = 6;
          c.font = '900 64px "Arial Black", Impact, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.strokeText(ground.name.toUpperCase(), 512, 52, 980);
          c.fillText(ground.name.toUpperCase(), 512, 52, 980);
        });
        const w = Math.min(len * 0.6, 22);
        const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 1024), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
        if (ground.roof !== null) signMesh.position.set(0, top + 3.7, 0.55);
        else signMesh.position.set(0, top + 1.2 + (w * 96 / 1024) / 2, -rows * rowD + 0.55);
        s.add(signMesh);
      }
      const texs = awayEnd ? awayTex : homeTex;
      for (let i = 0; i < rows; i++) {
        const t = texs[(i + Math.floor(Math.random() * 3)) % texs.length].clone();
        t.needsUpdate = true;
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.set(len / stripW, 1);
        t.offset.x = Math.random();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, stripH), new THREE.MeshToonMaterial({ map: t, alphaTest: 0.5 }));
        const y = rowH * (i + 1) + stripH / 2 - 0.12;
        mesh.position.set(0, y, -i * rowD - 0.15);
        s.add(mesh);
        this.crowdRows.push({ mesh, y, phase: Math.random() * Math.PI * 2, away: awayEnd });
      }
      s.position.set(cx, 0, cz);
      s.rotation.y = ry;
      this.group.add(s);
    };
    stand(0, -W - 5, PITCH.length + 6, 0, false, true);
    stand(-L - 6, 0, PITCH.width + 2, Math.PI / 2, false, false);
    stand(L + 6, 0, PITCH.width + 2, -Math.PI / 2, !!away, false);
  }

  private floodlights(glow: number) {
    for (const sx of [-1, 1]) {
      const x = sx * (L + 9), z = -(W + 8);
      this.group.add(cyl(0.25, 0.35, 22, 0x7a7a82, x, 0, z));
      const panel = rbox(3.2, 1.8, 0.4, toon(0xf8f4e0, glow), x, 22.5, z + 0.3);
      panel.rotation.x = 0.5;
      this.group.add(panel);
    }
  }

  /** Fans jump up when it gets exciting (goals!) or bounce along to a chant; nets settle, flags flap, the weather falls. */
  update(dt: number, excitement: number, camX = 0) {
    this.time += dt;
    const t = this.time;
    const jump = Math.max(0, (excitement - 0.55) / 0.45) * 0.14;
    const ch = this.chanting && t > this.chanting.from && t < this.chanting.until ? this.chanting : null;
    for (const r of this.crowdRows) {
      // Singing ends bounce together, on the beat.
      const sing = ch && ch.away === r.away ? Math.pow(Math.abs(Math.sin((Math.PI * (t - ch.from)) / ch.beat)), 2) * 0.12 : 0;
      r.mesh.position.y = r.y + Math.max(Math.max(0, Math.sin(t * 9 + r.phase)) * jump, sing);
    }
    const windy = this.look.weather === 'windy';
    for (const f of this.flags) f.rotation.y = Math.sin(t * (windy ? 9 : 3) + f.position.x) * (windy ? 0.25 : 0.4) + (windy ? CONDITIONS.windX * 0.5 : 0);
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
    this.fall(dt, camX);
  }

  /** Rain, snow or leaves: move them on, and wrap them round a box that follows the camera. */
  private fall(dt: number, camX: number) {
    const p = this.particles;
    if (!p) return;
    const a = p.pos, wx = CONDITIONS.windX, t = this.time;
    const z0 = -W - 6, zr = PITCH.width + 22;
    const wrapX = (x: number) => camX - 30 + ((((x - camX + 30) % 60) + 60) % 60);
    if (p.kind === 'rain') {
      for (let i = 0; i < p.n; i++) {
        const o = i * 6;
        let y = a[o + 1] - 17 * dt;
        let x = a[o];
        if (y < 0) { y += 16; x = camX + (Math.random() - 0.5) * 60; a[o + 2] = z0 + Math.random() * zr; }
        x = wrapX(x);
        a[o] = x; a[o + 1] = y;
        a[o + 3] = x - 0.06; a[o + 4] = y + 0.45; a[o + 5] = a[o + 2];
      }
    } else if (p.kind === 'snow') {
      for (let i = 0; i < p.n; i++) {
        const o = i * 3;
        let y = a[o + 1] - (0.9 + (i % 5) * 0.12) * dt;
        if (y < 0) y += 16;
        a[o] = wrapX(a[o] + (Math.sin(t * 0.8 + i) * 0.35 + wx * 0.5) * dt);
        a[o + 1] = y;
        a[o + 2] += Math.cos(t * 0.6 + i * 1.3) * 0.25 * dt;
      }
    } else {
      // Leaves tumbling along in the wind, low over the grass.
      for (let i = 0; i < p.n; i++) {
        const o = i * 3;
        a[o] = wrapX(a[o] + (wx * 4 + Math.sin(t * 2 + i) * 0.8) * dt);
        a[o + 1] = 0.25 + Math.abs(Math.sin(t * 1.7 + i * 0.7)) * (1 + (i % 4));
        a[o + 2] += (CONDITIONS.windZ * 4 + Math.cos(t * 1.3 + i)) * dt;
        if (a[o + 2] > z0 + zr) a[o + 2] -= zr;
        if (a[o + 2] < z0) a[o + 2] += zr;
      }
    }
    (p.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** The pitch: mowing pattern, wear (mud, bare goalmouths), and the weather on it (darker when wet, snow). */
function grassTexture(ground: Ground, weather: Weather) {
  const k = weather === 'rain' ? 0.82 : 1;
  const [g1, g2] = [css(shade(ground.grass[0], k)), css(shade(ground.grass[1], k))];
  // The canvas covers the pitch plus 3 m all round: 1024 × 512 for 50 × 34 m.
  const PX = 1024 / (PITCH.length + 6), PY = 512 / (PITCH.width + 6);
  return canvasTexture(1024, 512, (c) => {
    c.fillStyle = g1;
    c.fillRect(0, 0, 1024, 512);
    c.fillStyle = g2;
    switch (ground.pattern) {
      case 'stripes':
      case 'wide': {
        const n = ground.pattern === 'wide' ? 8 : 14;
        for (let i = 0; i < n; i += 2) c.fillRect((i * 1024) / n, 0, 1024 / n + 1, 512);
        break;
      }
      case 'checks':
        for (let i = 0; i < 14; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) c.fillRect((i * 1024) / 14, (j * 512) / 8, 1024 / 14 + 1, 512 / 8 + 1);
        break;
      case 'diagonal':
        c.save();
        c.translate(512, 256);
        c.rotate(Math.PI / 4);
        for (let x = -1200; x < 1200; x += 120) c.fillRect(x, -1200, 60, 2400);
        c.restore();
        break;
      case 'rings':
        for (let r = 720; r > 0; r -= 48) {
          c.fillStyle = (r / 48) % 2 ? g2 : g1;
          c.beginPath();
          c.ellipse(512, 256, r, (r * PY) / PX, 0, 0, Math.PI * 2);
          c.fill();
        }
        break;
    }
    // Wear: churned mud (the Mud Bowl) or bare, sandy goalmouths (the Tip).
    if (ground.wear) {
      const col = ground.wear === 'mud' ? 'rgba(106,74,42,' : 'rgba(168,150,92,';
      const blot = (x: number, y: number, r: number, n: number) => {
        for (let i = 0; i < n; i++) {
          c.fillStyle = col + (0.16 + Math.random() * 0.24) + ')';
          c.beginPath();
          c.ellipse(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 1.4, r * (0.2 + Math.random() * 0.5), r * (0.15 + Math.random() * 0.35), Math.random() * 3, 0, Math.PI * 2);
          c.fill();
        }
      };
      const cx = 512, cy = 256;
      for (const s of [-1, 1]) blot(cx + s * (PITCH.length / 2 - 2) * PX, cy, 3.5 * PX, ground.wear === 'mud' ? 26 : 18);
      blot(cx, cy, 4 * PX, ground.wear === 'mud' ? 30 : 12);
      if (ground.wear === 'mud') for (let i = 0; i < 10; i++) blot(Math.random() * 1024, Math.random() * 512, 2 * PX, 5);
    }
    // Speckles, so it reads as grass up close.
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      c.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
    }
    // Snow: a white dusting, thicker out wide where nobody runs.
    if (weather === 'snow') {
      c.filter = 'blur(5px)';
      for (let i = 0; i < 1100; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512;
        const edge = Math.min(1, Math.abs(y - 256) / 256 + Math.abs(x - 512) / 1400);
        c.fillStyle = `rgba(246,250,255,${0.1 + edge * 0.35})`;
        c.beginPath();
        c.ellipse(x, y, 8 + Math.random() * 16, 5 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.filter = 'none';
      // Out wide it's settled: a white band along the touchlines.
      for (const y of [0, 512]) {
        const grd = c.createLinearGradient(0, y, 0, y === 0 ? 70 : 442);
        grd.addColorStop(0, 'rgba(246,250,255,0.85)');
        grd.addColorStop(1, 'rgba(246,250,255,0)');
        c.fillStyle = grd;
        c.fillRect(0, y === 0 ? 0 : 442, 1024, 70);
      }
    }
    // Rain: puddles shining here and there.
    if (weather === 'rain') {
      for (let i = 0; i < 22; i++) {
        c.fillStyle = 'rgba(190,210,230,0.16)';
        c.beginPath();
        c.ellipse(Math.random() * 1024, Math.random() * 512, 10 + Math.random() * 26, 5 + Math.random() * 12, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/**
 * A strip of fans drawn on a canvas: animals of all kinds (round ears, pointy ears, long bunny ears,
 * duck beaks), mostly in the teams' colours, some with their arms up or waving scarves.
 */
function crowdTexture(fans: Fans, own: number) {
  const shirts = fans.colors;
  const furs = ['#8a5a34', '#f2ece4', '#a8988c', '#f09040', '#f4b4b8', '#5a4636', '#e8d070', '#6a6a72', '#c88850'];
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const n = 25, cw = 2048 / n;
  // Their own animal mostly (ears: 0 round, 1 pointy, 2 long; 3 a beak, 4 a snout).
  const KIND: Record<string, number> = { bunny: 2, pig: 4, dog: 0, cat: 1, duck: 3, raccoon: 1, bear: 0, mouse: 0 };
  return canvasTexture(2048, 160, (c) => {
    c.lineWidth = 3;
    c.strokeStyle = '#15110f';
    c.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.08) continue;
      const x = i * cw + cw / 2 + (Math.random() - 0.5) * 10;
      const base = 160, s = 0.85 + Math.random() * 0.25;
      const shirt = Math.random() < 0.82 ? hex(shirts[Math.floor(Math.random() * shirts.length)]) : ['#4a4a5a', '#e0e0e0', '#3a7a4a'][i % 3];
      const mine = Math.random() < own;
      const fur = mine ? hex(fans.fur) : furs[Math.floor(Math.random() * furs.length)];
      const kind = mine ? KIND[fans.animal] ?? 0 : Math.floor(Math.random() * 5);
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
