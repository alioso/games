// Comic-panel menus: a title, a few big buttons, keyboard / gamepad / mouse navigation.
import { MenuInput } from '@engine/input';
import { SFX } from '../game/sounds';

export interface MenuItem {
  label: string;
  sub?: string;
  /** Extra HTML inside the button (e.g. a class picture). */
  html?: string;
  action: () => void;
}

export interface MenuScreen {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  /** Lay buttons out in a row (cards) instead of a column. */
  cards?: boolean;
  back?: () => void;
  footer?: string;
}

export class Menu {
  private el: HTMLDivElement;
  readonly input = new MenuInput();
  private buttons: HTMLButtonElement[] = [];
  private screen: MenuScreen | null = null;
  private focus = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'menu hidden';
    parent.appendChild(this.el);
  }

  get open() {
    return !!this.screen;
  }

  show(s: MenuScreen) {
    this.screen = s;
    this.el.className = 'menu' + (s.cards ? ' cards' : '');
    this.el.innerHTML = `
      <div class="menu-panel">
        <h1>${s.title}</h1>
        ${s.subtitle ? `<p class="menu-sub">${s.subtitle}</p>` : ''}
        <div class="menu-items"></div>
        ${s.footer ? `<p class="menu-foot">${s.footer}</p>` : ''}
      </div>`;
    const box = this.el.querySelector('.menu-items')!;
    this.buttons = s.items.map((it, i) => {
      const b = document.createElement('button');
      b.className = 'menu-btn';
      b.innerHTML = `${it.html ?? ''}<span class="menu-label">${it.label}</span>${it.sub ? `<span class="menu-btn-sub">${it.sub}</span>` : ''}`;
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('mouseenter', () => this.setFocus(i, false));
      box.appendChild(b);
      return b;
    });
    this.setFocus(0, false);
  }

  hide() {
    this.screen = null;
    this.el.className = 'menu hidden';
    this.el.innerHTML = '';
    this.buttons = [];
  }

  private setFocus(i: number, sound = true) {
    if (!this.buttons.length) return;
    this.focus = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, j) => b.classList.toggle('focus', j === this.focus));
    this.buttons[this.focus].focus({ preventScroll: true });
    if (sound) SFX.ui();
  }

  private pick(i: number) {
    const s = this.screen;
    if (!s) return;
    SFX.uiConfirm();
    s.items[i].action();
  }

  update(now: number) {
    if (!this.screen) return;
    const a = this.input.poll(now);
    const prev = this.screen.cards ? a.left : a.up;
    const next = this.screen.cards ? a.right : a.down;
    if (prev || (this.screen.cards ? a.up : a.left)) this.setFocus(this.focus - 1);
    if (next || (this.screen.cards ? a.down : a.right)) this.setFocus(this.focus + 1);
    if (a.confirm) this.pick(this.focus);
    if (a.back && this.screen.back) { SFX.ui(); this.screen.back(); }
  }
}
