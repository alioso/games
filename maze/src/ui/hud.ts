// On screen while exploring: your hearts (top left), the map (top right; the big map on a button),
// big banners, and a line of help at the bottom. The map only shows what you've seen, plus a pulsing
// red glow round where the ruby is (roughly), and the way out once you have it.
import { STYLES } from '../world/themes';
import type { TrapKind } from '../data/mazes';
import type { Layout } from '../data/mazes';
import { tileMid } from '../world/maze';

export interface MapView {
  layout: Layout;
  /** Has this tile been seen? */
  seen: (tx: number, ty: number) => boolean;
  hero: { x: number; z: number; yaw: number };
  hasRuby: boolean;
  /** Traps and keepers (drawn once their tile's been seen). */
  traps: { kind: TrapKind; tile: [number, number] }[];
  keepers: { tile: [number, number]; open: boolean }[];
}

/** How each trap shows on the map. */
const TRAP_ICON: Record<TrapKind, [string, string]> = {
  thorns: ['✖', '#a02020'],
  wasps: ['🐝', '#15110f'],
  mud: ['●', '#6a4a2a'],
  manhole: ['◉', '#2a2a30'],
  flowerpot: ['🪴', '#15110f'],
  honey: ['🍯', '#15110f'],
  spikes: ['▲', '#a02020'],
  fire: ['🔥', '#15110f'],
  trapdoor: ['▦', '#6a4a2a'],
};

export class Hud {
  private el: HTMLDivElement;
  private hearts: HTMLDivElement;
  private banner: HTMLDivElement;
  private hint: HTMLDivElement;
  private map: HTMLCanvasElement;
  private bubbleEl: HTMLDivElement;
  private flash: HTMLDivElement;
  private bubbleText = '';
  private bars: HTMLDivElement;
  private pows: HTMLDivElement;
  private bannerT = 0;
  private hintText = '';
  private heartsN = -1;
  big = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="hearts"></div>
      <canvas class="mazemap" width="440" height="440"></canvas>
      <div class="banner hidden"></div>
      <div class="hint hidden"></div>
      <div class="bubble hidden"></div>
      <div class="fightbars hidden">
        <div class="fb you"><b class="fb-name"></b><div class="fb-bar"><i></i></div></div>
        <div class="fb vs">VS</div>
        <div class="fb it"><b>THE WATCHER</b><div class="fb-bar"><i></i></div></div>
      </div>
      <div class="pows"></div>
      <div class="hurtflash"></div>`;
    parent.appendChild(this.el);
    this.hearts = this.el.querySelector('.hearts')!;
    this.banner = this.el.querySelector('.banner')!;
    this.hint = this.el.querySelector('.hint')!;
    this.map = this.el.querySelector('.mazemap')!;
    this.bubbleEl = this.el.querySelector('.bubble')!;
    this.flash = this.el.querySelector('.hurtflash')!;
    this.bars = this.el.querySelector('.fightbars')!;
    this.pows = this.el.querySelector('.pows')!;
  }

  /** The fight's health bars (null hides them). */
  setFight(f: { name: string; you: number; it: number; powered: boolean } | null) {
    this.bars.classList.toggle('hidden', !f);
    this.map.style.display = f ? 'none' : '';
    if (!f) return;
    (this.bars.querySelector('.fb-name') as HTMLElement).textContent = f.name;
    const [a, b] = this.bars.querySelectorAll<HTMLElement>('.fb-bar i');
    a.style.width = `${Math.max(0, f.you)}%`;
    b.style.width = `${Math.max(0, f.it)}%`;
    this.bars.classList.toggle('powered', f.powered);
  }

  /** A comic word bursting out at a spot on screen. */
  pow(text: string, x: number, y: number, color: string) {
    const el = document.createElement('div');
    el.className = 'pow';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 24}deg`);
    this.pows.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /** A speech bubble at a spot on screen (null hides it). */
  setBubble(text: string | null, x = 0, y = 0) {
    this.bubbleEl.classList.toggle('hidden', !text);
    if (!text) return;
    if (text !== this.bubbleText) { this.bubbleText = text; this.bubbleEl.textContent = text; }
    this.bubbleEl.style.left = `${x}px`;
    this.bubbleEl.style.top = `${y}px`;
  }

  /** Red round the edges when you're hurt (0..1). */
  setHurt(k: number) {
    this.flash.style.opacity = String(Math.max(0, Math.min(1, k)));
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  /** In a maze (hearts and the map) or not (heaven: just banners and hints). */
  setPlaying(on: boolean) {
    this.hearts.style.display = on ? '' : 'none';
    this.map.style.display = on ? '' : 'none';
    if (!on) this.setHurt(0);
  }

  setHearts(n: number, max = 3) {
    if (n === this.heartsN) return;
    this.heartsN = n;
    this.hearts.innerHTML = Array.from({ length: max }, (_, i) => `<span class="heart${i < n ? '' : ' lost'}">♥</span>`).join('');
  }

  showBanner(text: string, sub = '', time = 2.4, color?: string) {
    this.banner.innerHTML = `<div class="banner-text"${color ? ` style="color:${color}"` : ''}>${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.banner.classList.remove('hidden', 'pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.bannerT = time;
  }

  setHint(html: string) {
    if (html === this.hintText) return;
    this.hintText = html;
    this.hint.innerHTML = html;
    this.hint.classList.toggle('hidden', !html);
  }

  setBigMap(on: boolean) {
    this.big = on;
    this.map.classList.toggle('big', on);
  }

  /** Draw the map: what you've seen, you, the ruby's glow, the way out. */
  drawMap(v: MapView, time: number) {
    const c = this.map.getContext('2d')!;
    const W = this.map.width, H = this.map.height, pad = 18;
    const { tw, th, wall } = v.layout;
    // Tiles drawn at their true sizes (thin walls, wide passages).
    const last = tw - 1;
    const total = tileMid(last) + 0.4;
    const k = Math.min((W - pad * 2) / total, (H - pad * 2 - 20) / (tileMid(th - 1) + 0.4));
    const ox = (W - total * k) / 2, oy = pad;
    const X = (x: number) => ox + x * k, Y = (z: number) => oy + z * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#f4ecd8';
    c.fillRect(0, 0, W, H);
    const st = STYLES[v.layout.def.theme];
    const start = (i: number) => Math.floor(i / 2) * 3.1 + (i % 2 ? 0.8 : 0), size = (i: number) => (i % 2 ? 2.3 : 0.8);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const isWall = wall[ty * tw + tx] === 1;
      // A hedge is known once a passage beside it has been seen.
      const known = isWall
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < tw && y < th && !wall[y * tw + x] && v.seen(x, y); })
        : v.seen(tx, ty);
      if (!known) continue;
      c.fillStyle = isWall ? st.mapWall : st.mapPath;
      c.fillRect(X(start(tx)) - 0.5, Y(start(ty)) - 0.5, size(tx) * k + 1, size(ty) * k + 1);
    }
    // Traps and keepers you've seen.
    for (const t of v.traps) {
      if (!v.seen(...t.tile)) continue;
      const cx = X(start(t.tile[0]) + size(t.tile[0]) / 2), cy = Y(start(t.tile[1]) + size(t.tile[1]) / 2);
      c.font = `${Math.max(10, 1.6 * k)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // Each trap its own mark: red crosses for the ones you mustn't walk into, a picture for the rest.
      const [txt, col] = TRAP_ICON[t.kind] ?? ['●', '#15110f'];
      c.fillStyle = col;
      c.fillText(txt, cx, cy);
      c.fillStyle = '#15110f';
    }
    for (const kp of v.keepers) {
      if (kp.open || !v.seen(...kp.tile)) continue;
      const cx = X(start(kp.tile[0]) + size(kp.tile[0]) / 2), cy = Y(start(kp.tile[1]) + size(kp.tile[1]) / 2);
      c.fillStyle = '#f4d040';
      c.beginPath(); c.arc(cx, cy, Math.max(6, 1.1 * k), 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#15110f'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#15110f';
      c.font = `700 ${Math.max(10, 1.5 * k)}px Fredoka, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('?', cx, cy + 0.5);
    }
    c.textBaseline = 'alphabetic';
    // The way in / out, below the gap.
    const [gx, gy] = v.layout.entrance.gap;
    const ex = X(tileMid(gx)), ey = Y(start(gy) + 0.8) + 8;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    c.fillStyle = v.hasRuby ? `rgba(255,200,40,${0.6 + 0.4 * pulse})` : '#8a6a48';
    c.beginPath(); c.moveTo(ex, ey - 8); c.lineTo(ex + 8, ey + 4); c.lineTo(ex - 8, ey + 4); c.closePath(); c.fill();
    c.font = '700 13px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#15110f';
    if (v.hasRuby) c.fillText('WAY OUT', ex, ey + 18);
    // The ruby: a soft red glow roughly where it is.
    if (!v.hasRuby) {
      const [hx, hy] = v.layout.rubyHint;
      const rx = X(tileMid(hx * 2 + 1)), ry = Y(tileMid(hy * 2 + 1));
      const r = 3.1 * 2.2 * k;
      const g = c.createRadialGradient(rx, ry, 0, rx, ry, r);
      g.addColorStop(0, `rgba(230,30,60,${0.45 + 0.2 * pulse})`);
      g.addColorStop(1, 'rgba(230,30,60,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(rx, ry, r, 0, Math.PI * 2); c.fill();
    }
    // You: an arrow.
    const px = X(v.hero.x), py = Y(v.hero.z);
    c.save();
    c.translate(px, py);
    c.rotate(-v.hero.yaw + Math.PI);
    c.fillStyle = '#2a6ae0';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 7); c.lineTo(0, 3); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  update(dt: number) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.add('hidden');
    }
  }
}
