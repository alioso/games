// On-screen captions: floor number, hearts, the key slot, the current goal, banners and fades.

export class Hud {
  readonly el: HTMLDivElement;
  private floorEl: HTMLDivElement;
  private hearts: HTMLDivElement;
  private keyEl: HTMLDivElement;
  private goal: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private bannerTimer = 0;
  private staminaEl: HTMLElement;
  private specialEl: HTMLElement;
  private specialFill: HTMLElement;
  private mbar: HTMLElement;
  private mbarName: HTMLElement;
  private mbarFill: HTMLElement;
  private mbarMark: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="hud-left caption"><div class="hud-name"></div><div class="hearts"></div><div class="stamina"><i></i></div><div class="special"><span></span><i></i></div></div>
      <div class="hud-mid"><div class="caption floor"></div><div class="goal"></div><div class="mbar hidden"><b></b><div class="mbar-track"><i></i><s></s></div></div></div>
      <div class="hud-right caption"><div class="keyslot"></div></div>`;
    parent.appendChild(this.el);
    this.floorEl = this.el.querySelector('.floor')!;
    this.hearts = this.el.querySelector('.hearts')!;
    this.keyEl = this.el.querySelector('.keyslot')!;
    this.goal = this.el.querySelector('.goal')!;
    this.nameEl = this.el.querySelector('.hud-name')!;
    this.staminaEl = this.el.querySelector('.stamina i')!;
    this.specialEl = this.el.querySelector('.special span')!;
    this.specialFill = this.el.querySelector('.special i')!;
    this.mbar = this.el.querySelector('.mbar')!;
    this.mbarName = this.el.querySelector('.mbar b')!;
    this.mbarFill = this.el.querySelector('.mbar-track i')!;
    this.mbarMark = this.el.querySelector('.mbar-track s')!;
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'banner hidden';
    parent.appendChild(this.bannerEl);
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    parent.appendChild(this.fadeEl);
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  setName(name: string) {
    this.nameEl.textContent = name;
  }

  setFloor(n: number, total: number) {
    this.floorEl.innerHTML = `FLOOR <b>${n}</b><small>/${total}</small>`;
  }

  setHp(hp: number, max: number) {
    let html = '';
    for (let i = 0; i < max / 2; i++) {
      const v = hp - i * 2;
      html += `<span class="heart ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}"></span>`;
    }
    this.hearts.innerHTML = html;
  }

  setStamina(frac: number) {
    this.staminaEl.style.width = `${Math.max(0, frac) * 100}%`;
    this.staminaEl.classList.toggle('low', frac < 0.25);
  }

  /** The class special: a label (charges, bolts...) and how ready it is (0..1). */
  setSpecial(label: string, ready: number) {
    if (this.specialEl.textContent !== label) this.specialEl.textContent = label;
    this.specialFill.style.width = `${Math.max(0, Math.min(1, ready)) * 100}%`;
  }

  /** The monster's health bar (null hides it); `mark` is where it will run away. */
  monster(name: string | null, frac: number, mark: number) {
    this.mbar.classList.toggle('hidden', !name);
    if (!name) return;
    if (this.mbarName.textContent !== name.toUpperCase()) this.mbarName.textContent = name.toUpperCase();
    this.mbarFill.style.width = `${Math.max(0, frac) * 100}%`;
    this.mbarMark.style.left = `${mark * 100}%`;
    this.mbarMark.style.display = mark > 0 ? 'block' : 'none';
  }

  setKey(has: boolean) {
    this.keyEl.className = 'keyslot' + (has ? ' has' : '');
    this.keyEl.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="12" cy="20" r="7" /><path d="M19 20 H36 M30 20 V27 M35 20 V25" /></svg>`;
  }

  objective(text: string) {
    this.goal.textContent = text;
    this.goal.classList.remove('flash');
    void this.goal.offsetWidth;
    this.goal.classList.add('flash');
  }

  banner(title: string, sub = '', seconds = 2.2, low = false) {
    this.bannerEl.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.bannerEl.classList.remove('hidden', 'pop');
    this.bannerEl.classList.toggle('low', low);
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('pop');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add('hidden'), seconds * 1000);
  }

  /** A small note at the bottom of the screen for a few seconds. */
  toast(html: string, seconds = 3) {
    let t = this.el.parentElement!.querySelector<HTMLElement>('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      this.el.parentElement!.appendChild(t);
    }
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t!.classList.remove('show'), seconds * 1000);
  }

  private toastTimer = 0;

  /** Fade to black (1) or back (0); resolves when done. */
  fade(to: 0 | 1, seconds = 0.6) {
    this.fadeEl.style.transition = `opacity ${seconds}s ease`;
    this.fadeEl.style.opacity = String(to);
    return new Promise<void>((res) => setTimeout(res, seconds * 1000));
  }
}
