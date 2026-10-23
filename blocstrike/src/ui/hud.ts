import type { TeamStatus } from '../match';
import { TEXT } from '../data/text';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** In-match overlay: team status, banners, countdown, controls hint. */
export class Hud {
  readonly root: HTMLElement;
  private teams: HTMLElement;
  private banners: HTMLElement;
  private count: HTMLElement;
  private hint: HTMLElement;
  private lastStatus = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="teams"></div>
      <div class="banners"></div>
      <div class="countdown"></div>
      <div class="hint"></div>`;
    parent.appendChild(this.root);
    this.teams = this.root.querySelector('.teams')!;
    this.banners = this.root.querySelector('.banners')!;
    this.count = this.root.querySelector('.countdown')!;
    this.hint = this.root.querySelector('.hint')!;
  }

  show(on: boolean, hint = TEXT.hint) {
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.hint.textContent = hint;
      this.hint.classList.remove('fade');
      setTimeout(() => this.hint.classList.add('fade'), 7000);
    } else {
      this.banners.innerHTML = '';
      this.count.textContent = '';
      this.lastStatus = '';
    }
  }

  setStatus(status: TeamStatus[]) {
    const key = JSON.stringify(status.map((s) => [s.blocs.map((b) => b.state), s.robotHp, s.eliminated]));
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.teams.innerHTML = status
      .map((s, i) => {
        const blocs = s.blocs
          .map((b) => `<span class="pip ${b.state}" style="--c:${hex(s.team.color)}">${b.human !== null ? `P${b.human + 1}` : ''}</span>`)
          .join('');
        const hearts = Array.from({ length: 3 }, (_, h) => `<span class="heart ${h < s.robotHp ? 'on' : ''}">♥</span>`).join('');
        return `${i > 0 ? '<span class="vs">VS</span>' : ''}
          <div class="team ${s.eliminated ? 'out' : ''}" style="--c:${hex(s.team.color)}">
            <div class="blocs">${blocs}</div>
            <div class="robot"><span class="bot">🤖</span>${hearts}</div>
          </div>`;
      })
      .join('');
  }

  countdown(n: number | null) {
    this.count.textContent = n === null ? '' : String(n);
    this.count.classList.remove('pop');
    void this.count.offsetWidth;
    this.count.classList.add('pop');
  }

  banner(text: string, style: 'big' | 'small' = 'big', color?: number) {
    const el = document.createElement('div');
    el.className = `banner ${style}`;
    el.textContent = text;
    if (color !== undefined) el.style.setProperty('--c', hex(color));
    this.banners.appendChild(el);
    setTimeout(() => el.remove(), style === 'big' ? 1600 : 2600);
  }
}
