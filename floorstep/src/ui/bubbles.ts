// Comic overlays drawn in HTML over the 3D view: speech bubbles, sound words, prompts, search rings.
import * as THREE from 'three';

interface Bubble {
  el: HTMLDivElement;
  text: HTMLSpanElement;
  anchor: THREE.Object3D;
  full: string;
  shown: number;
  life: number;
  onChar?: (ch: string) => void;
}

interface Pow {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
}

const v = new THREE.Vector3();

export class Bubbles {
  private root: HTMLDivElement;
  private bubbles: Bubble[] = [];
  private pows: Pow[] = [];
  private promptEl: HTMLDivElement;
  private promptPos = new THREE.Vector3();
  private ringEl: HTMLDivElement;
  private ringPos = new THREE.Vector3();

  constructor(parent: HTMLElement, private camera: THREE.Camera) {
    this.root = document.createElement('div');
    this.root.className = 'overlay-layer';
    parent.appendChild(this.root);
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'prompt hidden';
    this.root.appendChild(this.promptEl);
    this.ringEl = document.createElement('div');
    this.ringEl.className = 'search-ring hidden';
    this.root.appendChild(this.ringEl);
  }

  private project(p: THREE.Vector3): [number, number, boolean] {
    v.copy(p).project(this.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return [x, y, v.z < 1];
  }

  /** A speech bubble over `anchor`; the text types itself out, calling onChar for voice blips. */
  say(anchor: THREE.Object3D, text: string, opts: { life?: number; shout?: boolean; onChar?: (ch: string) => void } = {}) {
    for (const b of this.bubbles.filter((b) => b.anchor === anchor)) this.kill(b);
    const el = document.createElement('div');
    el.className = 'bubble' + (opts.shout ? ' shout' : '');
    const span = document.createElement('span');
    el.appendChild(span);
    this.root.appendChild(el);
    const life = opts.life ?? Math.max(2.2, text.length * 0.07 + 1.4);
    this.bubbles.push({ el, text: span, anchor, full: text, shown: 0, life, onChar: opts.onChar });
  }

  speaking(anchor: THREE.Object3D) {
    return this.bubbles.some((b) => b.anchor === anchor);
  }

  /** Big comic sound word ("CRASH!") that pops and fades at a world position. */
  pow(pos: THREE.Vector3, text: string, color = '#ffd23f', size = 1) {
    const el = document.createElement('div');
    el.className = 'pow';
    el.textContent = text;
    el.style.color = color;
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 24}deg`);
    el.style.setProperty('--size', `${size}`);
    this.root.appendChild(el);
    this.pows.push({ el, pos: pos.clone(), t: 0, life: 1.1 });
  }

  prompt(pos: THREE.Vector3 | null, key: string, text: string) {
    if (!pos) {
      this.promptEl.classList.add('hidden');
      return;
    }
    this.promptPos.copy(pos);
    const html = `<b>${key}</b> ${text}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.classList.remove('hidden');
  }

  ring(pos: THREE.Vector3 | null, progress = 0) {
    if (!pos) {
      this.ringEl.classList.add('hidden');
      return;
    }
    this.ringPos.copy(pos);
    this.ringEl.style.setProperty('--p', `${Math.min(1, progress) * 360}deg`);
    this.ringEl.classList.remove('hidden');
  }

  private kill(b: Bubble) {
    b.el.remove();
    this.bubbles.splice(this.bubbles.indexOf(b), 1);
  }

  clear() {
    for (const b of [...this.bubbles]) this.kill(b);
    for (const p of this.pows) p.el.remove();
    this.pows = [];
    this.prompt(null, '', '');
    this.ring(null);
  }

  update(dt: number) {
    for (const b of [...this.bubbles]) {
      const before = Math.floor(b.shown);
      b.shown = Math.min(b.full.length, b.shown + dt * 38);
      const now = Math.floor(b.shown);
      if (now > before) {
        b.text.textContent = b.full.slice(0, now);
        const ch = b.full[now - 1];
        if (b.onChar && now % 2 === 1 && /\w/.test(ch)) b.onChar(ch);
      }
      if (now >= b.full.length) b.life -= dt;
      if (b.life <= 0) {
        this.kill(b);
        continue;
      }
      b.anchor.getWorldPosition(v);
      const [x, y, vis] = this.project(v);
      b.el.style.transform = `translate(${x}px, ${y}px)`;
      b.el.style.opacity = vis ? String(Math.min(1, b.life * 3)) : '0';
    }
    for (const p of [...this.pows]) {
      p.t += dt;
      if (p.t >= p.life) {
        p.el.remove();
        this.pows.splice(this.pows.indexOf(p), 1);
        continue;
      }
      const [x, y] = this.project(p.pos);
      const k = p.t / p.life;
      const pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.8 : 1.2 - Math.min(0.2, (k - 0.12) * 0.6);
      p.el.style.transform = `translate(${x}px, ${y - k * 40}px) translate(-50%, -50%) rotate(var(--rot)) scale(${pop})`;
      p.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
    if (!this.promptEl.classList.contains('hidden')) {
      const [x, y] = this.project(this.promptPos);
      this.promptEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    if (!this.ringEl.classList.contains('hidden')) {
      const [x, y] = this.project(this.ringPos);
      this.ringEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }
}
