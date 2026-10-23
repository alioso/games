import { keyboard, MenuInput } from '@engine/input';
import { SFX } from '../data/sounds';

// Menus are plain HTML. They work with mouse, keyboard (arrows/WASD + Enter) and gamepad (D-pad/stick + A, B = back).

export type MenuItem =
  | { kind: 'button'; label: string; primary?: boolean; onClick: () => void }
  | { kind: 'option'; label: string; values: string[]; get: () => number; set: (i: number) => void; disabled?: () => boolean }
  | { kind: 'rebind'; label: string; value: () => string; onCapture: (code: string) => void }
  | { kind: 'text'; html: string };

export interface Screen {
  title?: string;
  /** Raw HTML shown above the items (logo, coins…). */
  header?: string;
  items: MenuItem[];
  onBack?: () => void;
  wide?: boolean;
}

export class Menus {
  readonly root: HTMLElement;
  private input = new MenuInput();
  private current: Screen | null = null;
  private refreshers: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'menu hidden';
    parent.appendChild(this.root);
  }

  get open() {
    return this.current !== null;
  }

  show(screen: Screen) {
    this.current = screen;
    this.input.poll(performance.now() / 1000); // drop presses that happened while the menu was closed
    this.root.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.current = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private render() {
    const s = this.current!;
    this.refreshers = [];
    const panel = document.createElement('div');
    panel.className = `panel${s.wide ? ' wide' : ''}`;
    if (s.header) panel.insertAdjacentHTML('beforeend', s.header);
    if (s.title) panel.insertAdjacentHTML('beforeend', `<h2>${s.title}</h2>`);
    for (const item of s.items) panel.appendChild(this.renderItem(item));
    this.root.innerHTML = '';
    this.root.appendChild(panel);
    this.buttons()[0]?.focus();
  }

  private renderItem(item: MenuItem): HTMLElement {
    if (item.kind === 'text') {
      const d = document.createElement('div');
      d.className = 'text';
      d.innerHTML = item.html;
      return d;
    }
    const b = document.createElement('button');
    if (item.kind === 'button') {
      b.className = item.primary ? 'primary' : '';
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
        this.refreshAll();
      };
      b.onclick = () => cycle(1);
      (b as HTMLButtonElement & { cycle?: (d: number) => void }).cycle = cycle;
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

  /** Call every frame while a menu is open. */
  update(now: number) {
    if (!this.current) return;
    const a = this.input.poll(now);
    if (keyboard.capture) return;
    const list = this.buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (j: number) => { list[(j + list.length) % list.length]?.focus(); SFX.ui(); };
    if (a.up) focus(i < 0 ? 0 : i - 1);
    if (a.down) focus(i < 0 ? 0 : i + 1);
    const cur = list[i] as (HTMLButtonElement & { cycle?: (d: number) => void }) | undefined;
    if (cur?.cycle && (a.left || a.right)) cur.cycle(a.left ? -1 : 1);
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
