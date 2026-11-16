// On screen during a match: the scoreboard (teams, score, clock), big banners (GOAL!, CORNER...),
// and a power bar over your player while you hold a kick button.
import type { Team, Kit } from '../data/teams';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type Cards = { yellow: number; red: number };

export class Hud {
  private el: HTMLDivElement;
  private score: HTMLDivElement;
  private banner: HTMLDivElement;
  private power: HTMLDivElement;
  private fill: HTMLDivElement;
  private bannerT = 0;
  private hint: HTMLDivElement;
  private hintText = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="score"></div>
      <div class="banner hidden"></div>
      <div class="power hidden"><div class="power-fill"></div></div>
      <div class="hint hidden"></div>
      <div class="pens hidden"></div>`;
    parent.appendChild(this.el);
    this.score = this.el.querySelector('.score')!;
    this.banner = this.el.querySelector('.banner')!;
    this.power = this.el.querySelector('.power')!;
    this.fill = this.el.querySelector('.power-fill')!;
    this.hint = this.el.querySelector('.hint')!;
    this.pens = this.el.querySelector('.pens')!;
  }

  private pens: HTMLDivElement;
  private pensKey = '';

  /** A shootout's kicks under the scoreboard: a row of dots for each side (scored, missed, still to come). */
  setShootout(kicks: [boolean[], boolean[]] | null, names: [string, string] = ['', '']) {
    const key = kicks ? kicks.map((k) => k.map(Number).join('')).join('|') + names.join() : '';
    if (key === this.pensKey) return;
    this.pensKey = key;
    this.pens.classList.toggle('hidden', !kicks);
    if (!kicks) return;
    const n = Math.max(5, kicks[0].length, kicks[1].length);
    const row = (k: boolean[], name: string) => `<div class="pen-row"><span>${name}</span>${Array.from({ length: n }, (_, i) => `<i class="${i < k.length ? (k[i] ? 'in' : 'out') : ''}">${i < k.length ? (k[i] ? '✓' : '✗') : ''}</i>`).join('')}</div>`;
    this.pens.innerHTML = row(kicks[0], names[0]) + row(kicks[1], names[1]);
  }

  /** A line of help at the bottom (which buttons to press). */
  setHint(html: string) {
    if (html === this.hintText) return;
    this.hintText = html;
    this.hint.innerHTML = html;
    this.hint.classList.toggle('hidden', !html);
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  setScore(a: Team, ak: Kit, as: number, b: Team | null, bk: Kit | null, bs: number, minute: number | string | null, ac?: Cards, bc?: Cards) {
    // Little cards under each team's name.
    const cards = (c?: Cards) => c && (c.yellow || c.red) ? `<span class="cards">${'<i class="yc"></i>'.repeat(c.yellow)}${'<i class="rc"></i>'.repeat(c.red)}</span>` : '';
    const chip = (t: Team, k: Kit, c?: Cards) => `<span class="chip" style="background:${hex(k.shirt)};border-color:${hex(k.trim)}"></span><span class="tname">${t.short}${cards(c)}</span>`;
    const clock = minute === null ? 'TRAINING' : typeof minute === 'string' ? minute : `${Math.floor(minute)}'`;
    this.score.innerHTML = b && bk
      ? `${chip(a, ak, ac)}<span class="num">${as}</span><span class="dash">-</span><span class="num">${bs}</span>${chip(b, bk, bc)}<span class="clock">${clock}</span>`
      : `${chip(a, ak)}<span class="num">${as}</span><span class="clock">${clock}</span>`;
  }

  showBanner(text: string, sub = '', time = 2, color?: string) {
    this.banner.innerHTML = `<div class="banner-text"${color ? ` style="color:${color}"` : ''}>${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.banner.classList.remove('hidden');
    this.banner.classList.remove('pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.bannerT = time;
  }

  hideBanner() {
    this.bannerT = 0;
    this.banner.classList.add('hidden');
  }

  /** Power bar at a screen position (or hidden). */
  setPower(power: number | null, x = 0, y = 0) {
    if (power === null) { this.power.classList.add('hidden'); return; }
    this.power.classList.remove('hidden');
    this.power.style.transform = `translate(${x - 30}px, ${y - 40}px)`;
    this.fill.style.width = `${Math.round(power * 100)}%`;
    this.fill.classList.toggle('over', power > 0.9);
  }

  update(dt: number) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.add('hidden');
    }
  }
}
