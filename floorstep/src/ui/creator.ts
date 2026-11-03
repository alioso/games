// The hero creator: class, animal, kind, colours, weapon and name, with a live portrait.
// Works with a gamepad (stick/d-pad to move and change, Ⓐ to start or type, Ⓑ back) and a keyboard.
import { MenuInput } from '@engine/input';
import { ACCENTS, CLASSES, COSTUMES, type HeroClass, type HeroLook, NAME_IDEAS, WEAPONS } from '../data/heroes';
import type { Difficulty } from '../data/tuning';
import { SFX } from '../game/sounds';

const CLASS_ORDER: HeroClass[] = ['wizard', 'knight', 'barbarian', 'thief'];
const ANIMAL_NAMES: Record<string, string> = { duck: 'Duck', cat: 'Cat', dog: 'Dog', dragon: 'Dragon', bear: 'Bear', pig: 'Pig', lizard: 'Lizard', rabbit: 'Rabbit' };
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type Row = 'cls' | 'animal' | 'sex' | 'costume' | 'accent' | 'weapon' | 'name' | 'start';
const ROWS: Row[] = ['cls', 'animal', 'sex', 'costume', 'accent', 'weapon', 'name', 'start'];

export class Creator {
  private el: HTMLDivElement;
  readonly input = new MenuInput();
  private row = 0;
  private look!: HeroLook;
  private won: Difficulty[] = [];
  private nameEl!: HTMLInputElement;
  private typing = false;
  private onDone: ((look: HeroLook) => void) | null = null;
  private onBack: (() => void) | null = null;

  constructor(parent: HTMLElement, private portrait: (look: HeroLook) => string) {
    this.el = document.createElement('div');
    this.el.className = 'menu creator hidden';
    parent.appendChild(this.el);
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(start: HeroLook, won: Difficulty[], done: (look: HeroLook) => void, back: () => void) {
    this.look = { ...start };
    this.won = won;
    this.onDone = done;
    this.onBack = back;
    this.row = ROWS.indexOf('start');
    this.typing = false;
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private unlocked(i: number) {
    const u = COSTUMES[i].unlock;
    return !u || this.won.includes(u);
  }

  private render() {
    const L = this.look;
    const c = CLASSES[L.cls];
    const weapon = WEAPONS[L.cls].find((w) => w.id === L.weapon) ?? WEAPONS[L.cls][0];
    const swatches = (list: number[], current: number, locked: (i: number) => boolean) =>
      list.map((col, i) => `<span class="swatch${col === current ? ' on' : ''}${locked(i) ? ' locked' : ''}" style="background:${hex(col)}">${locked(i) ? '🔒' : ''}</span>`).join('');
    const line = (r: Row, label: string, value: string, sub = '') =>
      `<div class="crow${ROWS[this.row] === r ? ' focus' : ''}" data-row="${r}"><span class="clabel">${label}</span><span class="cval"><b class="arrow" data-dir="-1">◀</b>${value}<b class="arrow" data-dir="1">▶</b></span>${sub ? `<span class="csub">${sub}</span>` : ''}</div>`;
    this.el.innerHTML = `
      <div class="menu-panel creator-panel">
        <h1>Your hero</h1>
        <div class="creator-body">
          <div class="creator-portrait"><img src="${this.portrait(L)}" alt=""><div class="creator-blurb">${c.title}: ${c.blurb}</div></div>
          <div class="creator-rows">
            ${line('cls', 'Class', c.title)}
            ${line('animal', 'Animal', ANIMAL_NAMES[L.animal])}
            ${line('sex', 'Kind', L.sex === 'm' ? 'He' : 'She')}
            ${line('costume', 'Costume', swatches(COSTUMES.map((x) => x.color), L.costume, (i) => !this.unlocked(i)), this.won.length < 3 ? 'Finish the game to win the locked colours' : '')}
            ${line('accent', 'Trim', swatches(ACCENTS, L.accent, () => false))}
            ${line('weapon', 'Weapon', weapon.name, weapon.blurb)}
            <div class="crow${ROWS[this.row] === 'name' ? ' focus' : ''}" data-row="name"><span class="clabel">Name</span><span class="cval"><b class="arrow" data-dir="-1">◀</b><input class="cname" maxlength="14" value="${L.name.replace(/"/g, '')}"><b class="arrow" data-dir="1">▶</b></span><span class="csub">${this.typing ? 'Type a name, then Enter' : 'Ⓐ / Enter to type your own'}</span></div>
            <button class="menu-btn${ROWS[this.row] === 'start' ? ' focus' : ''} cstart" data-row="start"><span class="menu-label">Into the house!</span></button>
          </div>
        </div>
        <p class="menu-foot">◀ ▶ change · ▲ ▼ move · Ⓐ / Enter start · Ⓑ / Esc back</p>
      </div>`;
    this.nameEl = this.el.querySelector('.cname')!;
    this.nameEl.addEventListener('input', () => { this.look.name = this.nameEl.value.trim() || CLASSES[this.look.cls].name; });
    this.nameEl.addEventListener('focus', () => { if (!this.typing) { this.typing = true; this.row = ROWS.indexOf('name'); } });
    this.nameEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') { this.typing = false; this.nameEl.blur(); this.render(); }
    });
    this.nameEl.addEventListener('blur', () => { this.typing = false; });
    if (this.typing) {
      this.nameEl.focus();
      this.nameEl.setSelectionRange(this.nameEl.value.length, this.nameEl.value.length);
    }
    // Mouse: click a row to focus it, click arrows to change, click start to go.
    this.el.querySelectorAll<HTMLElement>('[data-row]').forEach((rowEl) => {
      rowEl.addEventListener('mousedown', (e) => {
        const r = rowEl.dataset.row as Row;
        this.row = ROWS.indexOf(r);
        const dir = (e.target as HTMLElement).dataset.dir;
        if (dir) this.change(Number(dir));
        else if (r === 'start') this.finish();
        else if (r !== 'name') this.render();
      });
    });
  }

  private change(dir: number) {
    const L = this.look;
    const r = ROWS[this.row];
    const cycle = <T>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + dir + list.length) % list.length];
    switch (r) {
      case 'cls': {
        const cls = cycle(CLASS_ORDER, L.cls);
        const c = CLASSES[cls];
        // Keep custom names; swap default ones.
        const wasDefault = Object.values(NAME_IDEAS).flat().includes(L.name);
        this.look = { ...L, cls, animal: c.animals[0], costume: c.costume, accent: c.accent, weapon: WEAPONS[cls][0].id, name: wasDefault ? c.name : L.name };
        break;
      }
      case 'animal':
        L.animal = cycle(CLASSES[L.cls].animals, L.animal);
        break;
      case 'sex':
        L.sex = L.sex === 'm' ? 'f' : 'm';
        break;
      case 'costume': {
        const colors = COSTUMES.map((x) => x.color);
        let i = Math.max(0, colors.indexOf(L.costume));
        for (let k = 0; k < colors.length; k++) {
          i = (i + dir + colors.length) % colors.length;
          if (this.unlocked(i)) break;
        }
        L.costume = colors[i];
        break;
      }
      case 'accent':
        L.accent = cycle(ACCENTS, L.accent);
        break;
      case 'weapon':
        L.weapon = cycle(WEAPONS[L.cls].map((w) => w.id), L.weapon);
        break;
      case 'name': {
        const ideas = NAME_IDEAS[L.cls];
        L.name = ideas.includes(L.name) ? cycle(ideas, L.name) : ideas[0];
        break;
      }
      case 'start':
        return;
    }
    SFX.ui();
    this.render();
  }

  private finish() {
    SFX.uiConfirm();
    const look = { ...this.look, name: this.look.name.trim() || CLASSES[this.look.cls].name };
    this.hide();
    this.onDone?.(look);
  }

  update(now: number) {
    if (!this.open) return;
    const a = this.input.poll(now);
    if (this.typing) return;
    if (a.up) { this.row = (this.row - 1 + ROWS.length) % ROWS.length; SFX.ui(); this.render(); }
    if (a.down) { this.row = (this.row + 1) % ROWS.length; SFX.ui(); this.render(); }
    if (a.left) this.change(-1);
    if (a.right) this.change(1);
    if (a.back) { SFX.ui(); this.hide(); this.onBack?.(); return; }
    const enter = a.confirm || this.enterPressed;
    this.enterPressed = false;
    if (enter) {
      const r = ROWS[this.row];
      if (r === 'start') this.finish();
      else if (r === 'name') { this.typing = true; this.render(); }
      else { this.row = ROWS.indexOf('start'); this.render(); }
    }
  }

  /** Enter on the keyboard (buttons aren't focused here, so it's caught by hand). */
  private enterPressed = false;
  listen() {
    window.addEventListener('keydown', (e) => {
      if (this.open && !this.typing && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.enterPressed = true;
      }
    });
    return this;
  }
}
