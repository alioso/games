// Controls: see which controllers the browser has found (with a live button tester), and
// rebind every action by pressing the key or button you want.
import { MenuInput, keyboard } from '@engine/input';
import { ACTIONS, type Action, type Bindings, defaultBindings, keyName, padBlocker, padName, saveBindings } from '../game/controls';
import { SFX } from '../game/sounds';

type Col = 'keys' | 'pad';
type Listen = { action: Action; col: Col; since: number; released: boolean } | null;

export class ControlsScreen {
  private el: HTMLDivElement;
  private input: MenuInput;
  private row = 0;
  private col: Col = 'pad';
  private listen: Listen = null;
  private onBack: (() => void) | null = null;
  private padsEl!: HTMLElement;
  private testerEl!: HTMLElement;

  constructor(parent: HTMLElement, private bindings: Bindings, input: MenuInput, private changed: () => void) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'menu controls hidden';
    parent.appendChild(this.el);
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  /** Rows: every action, then Reset and Back. */
  private get rows() {
    return ACTIONS.length + 2;
  }

  private openedAt = 0;

  show(back: () => void) {
    this.onBack = back;
    this.row = 0;
    this.listen = null;
    // The press that opened this screen mustn't also start a rebind.
    keyboard.consume(['Enter', 'Space']);
    this.openedAt = performance.now();
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    keyboard.capture = null;
  }

  private render() {
    const b = this.bindings;
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
    const standard = pads.every((p) => p.mapping === 'standard');
    const cell = (a: Action, col: Col, i: number) => {
      const focus = this.row === i && this.col === col;
      const waiting = this.listen?.action === a && this.listen.col === col;
      const text = waiting
        ? col === 'keys' ? 'Press a key… (Esc: cancel)' : 'Press a button…'
        : col === 'keys' ? b.keys[a].map(keyName).join(' / ') : ACTIONS.find((x) => x.id === a)!.pad ? (b.pad[a] ?? []).map((n) => padName(n, standard)).join(' / ') || '—' : 'stick / d-pad';
      return `<td class="ccell${focus ? ' focus' : ''}${waiting ? ' waiting' : ''}" data-row="${i}" data-col="${col}">${text}</td>`;
    };
    this.el.innerHTML = `
      <div class="menu-panel controls-panel">
        <h1>Controls</h1>
        <div class="pads"></div>
        <div class="tester"></div>
        <table class="ctable">
          <tr><th></th><th>Keyboard</th><th>Controller</th></tr>
          ${ACTIONS.map((a, i) => `<tr><td class="cact">${a.label}</td>${cell(a.id, 'keys', i)}${cell(a.id, 'pad', i)}</tr>`).join('')}
        </table>
        <div class="cbtns">
          <button class="menu-btn${this.row === ACTIONS.length ? ' focus' : ''}" data-row="${ACTIONS.length}"><span class="menu-label">Reset to defaults</span></button>
          <button class="menu-btn${this.row === ACTIONS.length + 1 ? ' focus' : ''}" data-row="${ACTIONS.length + 1}"><span class="menu-label">Back</span></button>
        </div>
        <p class="menu-foot">▲▼ choose · ◀▶ keyboard / controller · Ⓐ or Enter: press the new key or button</p>
      </div>`;
    this.padsEl = this.el.querySelector('.pads')!;
    this.testerEl = this.el.querySelector('.tester')!;
    this.el.querySelectorAll<HTMLElement>('[data-row]').forEach((c) =>
      c.addEventListener('mousedown', () => {
        this.row = Number(c.dataset.row);
        if (c.dataset.col) this.col = c.dataset.col as Col;
        this.activate();
      }),
    );
    this.updatePads();
  }

  /** The connected controllers and what they're doing right now. */
  private updatePads() {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
    const blocked = padBlocker();
    if (blocked) {
      this.padsEl.innerHTML = `<b>⚠ ${blocked}</b>`;
      this.testerEl.innerHTML = '';
      return;
    }
    if (!pads.length) {
      const chrome = /Chrome\//.test(navigator.userAgent);
      this.padsEl.innerHTML = `<b>No controller found yet.</b> Browsers only show a controller after you <b>press a button on it</b> while this window is in front, so press any button now.
        <br><small>${chrome ? 'Still nothing in Chrome with a Switch-mode controller? Try Safari, or switch the 8BitDo to X mode (hold X + Start to turn it on, then pair again).' : 'If buttons are mixed up once it shows, rebind them below.'}</small>`;
      this.testerEl.innerHTML = '';
      return;
    }
    this.padsEl.innerHTML = pads.map((p) => `🎮 <b>${p.id.replace(/\(.*?Vendor.*?\)/i, '').trim()}</b> ${p.mapping === 'standard' ? '— standard layout ✓' : '— <b>unusual layout</b>: rebind its buttons below'}`).join('<br>');
    const p = pads[0];
    const btns = p.buttons.map((b, i) => `<span class="pbtn${b.pressed ? ' on' : ''}">${i}</span>`).join('');
    const ax = p.axes.slice(0, 4).map((v) => v.toFixed(1)).join(' ');
    this.testerEl.innerHTML = `Buttons: ${btns} <span class="paxes">sticks: ${ax}</span>`;
  }

  private activate() {
    if (this.row === ACTIONS.length) {
      const d = defaultBindings();
      this.bindings.keys = d.keys;
      this.bindings.pad = d.pad;
      this.save();
      SFX.uiConfirm();
      this.render();
      return;
    }
    if (this.row === ACTIONS.length + 1) {
      SFX.ui();
      this.hide();
      this.onBack?.();
      return;
    }
    const a = ACTIONS[this.row];
    if (this.col === 'pad' && !a.pad) return;
    SFX.ui();
    this.listen = { action: a.id, col: this.col, since: performance.now(), released: false };
    if (this.col === 'keys') {
      keyboard.capture = (code) => {
        if (!this.listen) return;
        if (code !== 'Escape') this.assign(code);
        this.listen = null;
        this.render();
      };
    }
    this.render();
  }

  private assign(binding: string | number) {
    const l = this.listen!;
    if (l.col === 'keys') {
      const code = binding as string;
      // One key, one job.
      for (const k of Object.keys(this.bindings.keys) as Action[]) this.bindings.keys[k] = this.bindings.keys[k].filter((c) => c !== code);
      this.bindings.keys[l.action] = [code];
    } else {
      const n = binding as number;
      for (const k of Object.keys(this.bindings.pad) as Action[]) this.bindings.pad[k] = (this.bindings.pad[k] ?? []).filter((c) => c !== n);
      this.bindings.pad[l.action] = [n];
    }
    SFX.uiConfirm();
    this.save();
  }

  private save() {
    saveBindings(this.bindings);
    this.changed();
  }

  update(now: number) {
    if (!this.open) return;
    this.updatePads();
    const l = this.listen;
    if (l?.col === 'pad') {
      // Wait for every button to be let go (the one that started this), then take the next press.
      const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
      const pressed = pads.flatMap((p) => p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0));
      if (!l.released) l.released = pressed.length === 0;
      else if (pressed.length) { this.assign(pressed[0]); this.listen = null; this.render(); }
      if (keyboard.consume(['Escape']) || performance.now() - l.since > 8000) { this.listen = null; this.render(); }
      this.input.poll(now);
      return;
    }
    if (l) return;
    const a = this.input.poll(now);
    if (performance.now() - this.openedAt < 250) return;
    if (a.up) { this.row = (this.row - 1 + this.rows) % this.rows; SFX.ui(); this.render(); }
    if (a.down) { this.row = (this.row + 1) % this.rows; SFX.ui(); this.render(); }
    if (a.left || a.right) { this.col = this.col === 'keys' ? 'pad' : 'keys'; SFX.ui(); this.render(); }
    if (a.confirm || keyboard.consume(['Enter'])) this.activate();
    if (a.back) { SFX.ui(); this.hide(); this.onBack?.(); }
  }
}
