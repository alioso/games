// Talking to the residents: a comic panel at the bottom of the screen with their portrait, what
// they say (typed out, with mumbling blips), and your possible answers.
import { MenuInput, keyboard } from '@engine/input';
import { SFX } from '../game/sounds';

export interface DialogOption {
  label: string;
  action: () => void;
}

export class Dialog {
  readonly input = new MenuInput();
  private el: HTMLDivElement;
  private textEl!: HTMLElement;
  private optsEl!: HTMLElement;
  private full = '';
  private shown = 0;
  private options: DialogOption[] = [];
  private focus = 0;
  private voice = 300;
  private openedAt = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dialog hidden';
    parent.appendChild(this.el);
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  /** Show a line from a resident and the answers you can give. */
  say(name: string, portrait: string, text: string, options: DialogOption[], voice: number) {
    this.full = text;
    this.shown = 0;
    this.options = options;
    this.focus = 0;
    this.voice = voice;
    this.openedAt = performance.now();
    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="dialog-panel">
        <img class="dialog-face" src="${portrait}" alt="">
        <div class="dialog-body">
          <div class="dialog-name">${name}</div>
          <div class="dialog-text"></div>
          <div class="dialog-opts"></div>
        </div>
      </div>`;
    this.textEl = this.el.querySelector('.dialog-text')!;
    this.optsEl = this.el.querySelector('.dialog-opts')!;
    keyboard.consume(['Enter', 'Space', 'KeyE']);
    // Note which pad buttons are already down, so the press that opened this doesn't count.
    this.input.poll(performance.now() / 1000);
  }

  close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private renderOptions() {
    this.optsEl.innerHTML = this.options.map((o, i) => `<button class="dialog-opt${i === this.focus ? ' focus' : ''}" data-i="${i}">${o.label}</button>`).join('');
    this.optsEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.addEventListener('mousedown', () => this.choose(Number(b.dataset.i)));
      b.addEventListener('mouseenter', () => { this.focus = Number(b.dataset.i); this.highlight(); });
    });
  }

  private highlight() {
    this.optsEl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('focus', i === this.focus));
  }

  private choose(i: number) {
    const o = this.options[i];
    if (!o) return;
    SFX.uiConfirm();
    o.action();
  }

  update(dt: number, now: number) {
    if (!this.open) return;
    const a = this.input.poll(now);
    const enter = keyboard.consume(['Enter', 'Space', 'KeyE']) || a.confirm;
    const typing = this.shown < this.full.length;
    if (typing) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * 40);
      const n = Math.floor(this.shown);
      if (n > before) {
        this.textEl.textContent = this.full.slice(0, n);
        const ch = this.full[n - 1];
        if (n % 2 === 1 && /\w/.test(ch)) SFX.voice(this.voice, ch);
      }
      // Pressing a button finishes the line at once.
      if (enter && performance.now() - this.openedAt > 150) this.shown = this.full.length;
      if (this.shown >= this.full.length) { this.textEl.textContent = this.full; this.renderOptions(); }
      return;
    }
    if (!this.optsEl.children.length) this.renderOptions();
    if (a.up) { this.focus = (this.focus - 1 + this.options.length) % this.options.length; SFX.ui(); this.highlight(); }
    if (a.down) { this.focus = (this.focus + 1) % this.options.length; SFX.ui(); this.highlight(); }
    if (enter) this.choose(this.focus);
    else if (a.back) this.choose(this.options.length - 1);
  }
}
