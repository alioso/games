import { keyboard, MenuInput } from '@engine/input';
import { SFX } from '../data/sounds';

// Menus are plain HTML. They work with mouse, keyboard (arrows/WASD + Enter) and gamepad (D-pad/stick + A, B = back).
// Arrows move to the nearest button in that direction, so rows and grids work too.

export interface Card {
  img?: string;
  title: string;
  /** Small label under the title: price, OWNED, WEARING… */
  tag: string;
  tagClass?: 'price' | 'owned' | 'equipped' | 'confirm' | 'locked';
  selected?: boolean;
  onClick: () => void;
}

export type MenuItem =
  | { kind: 'button'; label: string; primary?: boolean; selected?: boolean; onClick: () => void }
  | { kind: 'option'; label: string; values: string[]; get: () => number; set: (i: number) => void; disabled?: () => boolean }
  | { kind: 'rebind'; label: string; value: () => string; onCapture: (code: string) => void }
  | { kind: 'row'; items: MenuItem[] }
  | { kind: 'grid'; cards: Card[] }
  | { kind: 'text'; html: string };

export interface Screen {
  title?: string;
  /** Raw HTML shown above the items (logo, coins…). */
  header?: string;
  items: MenuItem[];
  onBack?: () => void;
  wide?: boolean;
}

type CyclingButton = HTMLButtonElement & { cycle?: (d: number) => void };

export class Menus {
  readonly root: HTMLElement;
  private input = new MenuInput();
  private current: Screen | null = null;
  private build: (() => Screen) | null = null;
  private refreshers: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'menu hidden';
    parent.appendChild(this.root);
  }

  get open() {
    return this.current !== null;
  }

  /** Show a screen. Pass a function to be able to rebuild it later with refresh(). */
  show(screen: Screen | (() => Screen)) {
    this.build = typeof screen === 'function' ? screen : null;
    this.current = typeof screen === 'function' ? screen() : screen;
    this.input.poll(performance.now() / 1000); // drop presses that happened while the menu was closed
    this.root.classList.remove('hidden');
    this.render(0);
  }

  /** Rebuild the current screen (after buying something, say), keeping the focused button. */
  refresh() {
    if (!this.build) return;
    const i = this.buttons().indexOf(document.activeElement as HTMLButtonElement);
    const scroll = this.root.querySelector('.panel')?.scrollTop ?? 0;
    this.current = this.build();
    this.render(Math.max(0, i));
    const panel = this.root.querySelector('.panel');
    if (panel) panel.scrollTop = scroll;
  }

  hide() {
    this.current = null;
    this.build = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private render(focusIndex: number) {
    const s = this.current!;
    this.refreshers = [];
    const panel = document.createElement('div');
    panel.className = `panel${s.wide ? ' wide' : ''}`;
    if (s.header) panel.insertAdjacentHTML('beforeend', s.header);
    if (s.title) panel.insertAdjacentHTML('beforeend', `<h2>${s.title}</h2>`);
    for (const item of s.items) panel.appendChild(this.renderItem(item));
    this.root.innerHTML = '';
    this.root.appendChild(panel);
    const list = this.buttons();
    list[Math.min(focusIndex, list.length - 1)]?.focus({ preventScroll: focusIndex === 0 });
  }

  private renderItem(item: MenuItem): HTMLElement {
    if (item.kind === 'text') {
      const d = document.createElement('div');
      d.className = 'text';
      d.innerHTML = item.html;
      return d;
    }
    if (item.kind === 'row') {
      const d = document.createElement('div');
      d.className = 'row';
      for (const i of item.items) d.appendChild(this.renderItem(i));
      return d;
    }
    if (item.kind === 'grid') {
      const d = document.createElement('div');
      d.className = 'grid';
      for (const c of item.cards) {
        const b = document.createElement('button');
        b.className = `card${c.selected ? ' selected' : ''}`;
        b.innerHTML = `${c.img ? `<img src="${c.img}" alt="">` : ''}<span class="title">${c.title}</span><span class="tag ${c.tagClass ?? ''}">${c.tag}</span>`;
        b.onclick = c.onClick;
        d.appendChild(b);
      }
      return d;
    }
    const b = document.createElement('button');
    if (item.kind === 'button') {
      b.className = `${item.primary ? 'primary' : ''}${item.selected ? ' selected' : ''}`;
      b.textContent = item.label;
      b.onclick = () => { SFX.ui(); item.onClick(); };
      return b;
    }
    if (item.kind === 'option') {
      b.className = 'option';
      const refresh = () => {
        const off = item.disabled?.() ?? false;
        b.classList.toggle('disabled', off);
        b.innerHTML = `<span class="label">${item.label}</span><span class="value">‹ ${item.values[item.get()] ?? ''} ›</span>`;
      };
      const cycle = (dir: number) => {
        if (item.disabled?.()) return;
        SFX.ui();
        item.set((item.get() + dir + item.values.length) % item.values.length);
        if (this.build) this.refresh();
        else this.refreshAll();
      };
      b.onclick = () => cycle(1);
      (b as CyclingButton).cycle = cycle;
      this.refreshers.push(refresh);
      refresh();
      return b;
    }
    b.className = 'option rebind';
    const refresh = () => {
      b.innerHTML = `<span class="label">${item.label}</span><span class="value key">${item.value()}</span>`;
    };
    b.onclick = () => {
      b.querySelector('.value')!.textContent = 'Press a key…';
      b.classList.add('waiting');
      keyboard.capture = (code) => {
        b.classList.remove('waiting');
        if (code !== 'Escape') item.onCapture(code);
        SFX.ui();
        this.refreshAll();
      };
    };
    this.refreshers.push(refresh);
    refresh();
    return b;
  }

  private refreshAll() {
    for (const r of this.refreshers) r();
  }

  private buttons() {
    return [...this.root.querySelectorAll<HTMLButtonElement>('button')];
  }

  /** The nearest button from `from` in a direction, judged by on-screen position. */
  private neighbour(from: HTMLElement, dx: number, dy: number) {
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLButtonElement | null = null, bestScore = Infinity;
    for (const b of this.buttons()) {
      if (b === from) continue;
      const r = b.getBoundingClientRect();
      const ox = r.left + r.width / 2 - ax, oy = r.top + r.height / 2 - ay;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ox * dy - oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  /** Call every frame while a menu is open. */
  update(now: number) {
    if (!this.current) return;
    const a = this.input.poll(now);
    if (keyboard.capture) return;
    const list = this.buttons();
    const cur = (list.includes(document.activeElement as HTMLButtonElement) ? document.activeElement : null) as CyclingButton | null;
    const move = (dx: number, dy: number) => {
      if (!cur) { list[0]?.focus(); return; }
      const n = this.neighbour(cur, dx, dy) ?? (dy ? list[dy > 0 ? 0 : list.length - 1] : null);
      if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); SFX.ui(); }
    };
    if (a.up) move(0, -1);
    if (a.down) move(0, 1);
    if (a.left || a.right) {
      if (cur?.cycle) cur.cycle(a.left ? -1 : 1);
      else move(a.left ? -1 : 1, 0);
    }
    if (a.confirm) (cur ?? list[0])?.click();
    if (a.back && this.current.onBack) { SFX.ui(); this.current.onBack(); }
  }
}

const NAMES: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

export function keyName(code: string) {
  return NAMES[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
