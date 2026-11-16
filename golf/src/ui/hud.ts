// On screen while playing: the hole card (number, name, par, whose turn, strokes), the power gauge
// (with a tick where your last putt was), the mini-map of the hole in the top right, big banners
// (HOLE IN ONE!, BIRDIE...) and a line of help at the bottom.
import type { P2 } from '../data/holes';
import type { Shape } from '../world/geometry';

export class Hud {
  private el: HTMLDivElement;
  private card: HTMLDivElement;
  private gauge: HTMLDivElement;
  private fill: HTMLDivElement;
  private ghost: HTMLDivElement;
  private banner: HTMLDivElement;
  private hint: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  private mapXf: ((p: P2) => P2) | null = null;
  private bannerT = 0;
  private hintText = '';
  private cardText = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="card"></div>
      <canvas class="minimap" width="220" height="220"></canvas>
      <div class="gauge hidden"><div class="gauge-fill"></div><div class="gauge-ghost"></div><span>POWER</span></div>
      <div class="banner hidden"></div>
      <div class="hint hidden"></div>`;
    parent.appendChild(this.el);
    this.card = this.el.querySelector('.card')!;
    this.gauge = this.el.querySelector('.gauge')!;
    this.fill = this.el.querySelector('.gauge-fill')!;
    this.ghost = this.el.querySelector('.gauge-ghost')!;
    this.banner = this.el.querySelector('.banner')!;
    this.hint = this.el.querySelector('.hint')!;
    this.map = this.el.querySelector('.minimap')!;
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  /** The hole card: number, name, par, the player and their strokes so far. */
  setCard(hole: number, name: string, par: number, player: string, strokes: number, color: string, total = '') {
    const html = `<div class="hole-no">${hole}</div><div class="hole-info"><b>${name}</b><span>Par ${par}</span></div>
      <div class="who"><i style="background:${color}"></i>${player}<b>${strokes}</b><small>${strokes === 1 ? 'stroke' : 'strokes'}</small>${total ? `<span class="total" title="Round so far">${total}</span>` : ''}</div>`;
    if (html === this.cardText) return;
    this.cardText = html;
    this.card.innerHTML = html;
  }

  /** The power gauge (null hides it), and a tick where the last putt was. */
  setPower(power: number | null, last: number | null) {
    this.gauge.classList.toggle('hidden', power === null);
    if (power === null) return;
    this.fill.style.height = `${Math.round(power * 100)}%`;
    this.ghost.style.bottom = `${Math.round((last ?? 0) * 100)}%`;
    this.ghost.style.display = last === null ? 'none' : 'block';
  }

  showBanner(text: string, sub = '', time = 2.2, color?: string) {
    this.banner.innerHTML = `<div class="banner-text"${color ? ` style="color:${color}"` : ''}>${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.banner.classList.remove('hidden', 'pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.bannerT = time;
  }

  hideBanner() {
    this.bannerT = 0;
    this.banner.classList.add('hidden');
  }

  setHint(html: string) {
    if (html === this.hintText) return;
    this.hintText = html;
    this.hint.innerHTML = html;
    this.hint.classList.toggle('hidden', !html);
  }

  /** Draw the hole once for the mini-map, turned so the tee's at the bottom and the cup's at the top. */
  setHole(shape: Shape) {
    const W = this.map.width, H = this.map.height, pad = 16;
    const { tee, cup } = shape.hole;
    // Turn so tee → cup points up the map.
    const ang = Math.atan2(cup[0] - tee[0], -(cup[1] - tee[1]));
    const c = Math.cos(-ang), s = Math.sin(-ang);
    const rot = (p: P2): P2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const pts = shape.hole.outline.map(rot);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const k = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
    const ox = W / 2 - ((minX + maxX) / 2) * k, oz = H / 2 - ((minZ + maxZ) / 2) * k;
    this.mapXf = (p) => { const r = rot(p); return [ox + r[0] * k, oz + r[1] * k]; };
    const xf = this.mapXf;
    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    const g = base.getContext('2d')!;
    const poly = (ps: P2[]) => { g.beginPath(); ps.forEach((p, i) => { const [x, y] = xf(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    g.lineJoin = 'round';
    poly(shape.hole.outline);
    g.fillStyle = '#5ab84c';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#8a5a2e';
    g.stroke();
    for (const sand of shape.hole.sand ?? []) { poly(sand); g.fillStyle = '#e8d48a'; g.fill(); }
    for (const w of shape.hole.water ?? []) { poly(w); g.fillStyle = '#4ab0e8'; g.fill(); }
    for (const pl of shape.hole.planks ?? []) { poly(pl); g.fillStyle = '#b8864a'; g.fill(); }
    for (const b of shape.hole.blocks ?? []) { poly(b); g.fillStyle = '#8a5a2e'; g.fill(); }
    for (const [x, z, r] of shape.posts) {
      const [px, py] = xf([x, z]);
      g.beginPath(); g.arc(px, py, Math.max(2.5, r * k), 0, Math.PI * 2); g.fillStyle = '#6a4428'; g.fill();
    }
    // The tee mat.
    const [tx, ty] = xf(tee);
    g.fillStyle = '#2a5a34';
    g.fillRect(tx - 5, ty - 5, 10, 10);
    this.mapBase = base;
  }

  /** Each frame: the hole, the flag, the balls, and the aiming line. */
  drawMap(balls: { x: number; z: number; color: string; current: boolean }[], aim: [number, number][] | null) {
    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, this.map.width, this.map.height);
    if (!this.mapBase || !this.mapXf) return;
    g.drawImage(this.mapBase, 0, 0);
    const xf = this.mapXf;
    if (aim && aim.length > 1) {
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      let gap = true;
      for (const p of aim) {
        if (Number.isNaN(p[0])) { gap = true; continue; }
        const [x, y] = xf(p);
        if (gap) g.moveTo(x, y); else g.lineTo(x, y);
        gap = false;
      }
      g.stroke();
      g.setLineDash([]);
    }
    for (const b of balls) {
      const [x, y] = xf([b.x, b.z]);
      g.beginPath();
      g.arc(x, y, b.current ? 5 : 4, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#15110f';
      g.stroke();
    }
  }

  /** Where the flag goes on the map (drawn after the balls so it's on top). */
  drawFlag(cup: P2) {
    if (!this.mapXf) return;
    const g = this.map.getContext('2d')!;
    const [x, y] = this.mapXf(cup);
    g.fillStyle = '#15110f';
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 1, y - 18, 2, 18);
    g.fillStyle = '#f0c020';
    g.beginPath(); g.moveTo(x + 1, y - 18); g.lineTo(x + 13, y - 14); g.lineTo(x + 1, y - 10); g.fill();
  }

  update(dt: number) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.add('hidden');
    }
  }
}
