import type { PlayerStatus, TeamStatus } from '../match';
import { WEAPONS } from '../data/weapons';
import { TUNING } from '../data/tuning';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** In-match overlay: team status and round score, player cards, banners, countdown, controls hint. */
export class Hud {
  readonly root: HTMLElement;
  private teams: HTMLElement;
  private cards: HTMLElement;
  private banners: HTMLElement;
  private count: HTMLElement;
  private hint: HTMLElement;
  private lastStatus = '';
  private lastCards = '';
  private roundWins: number[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="teams"></div>
      <div class="cards"></div>
      <div class="banners"></div>
      <div class="countdown"></div>
      <div class="hint"></div>`;
    parent.appendChild(this.root);
    this.teams = this.root.querySelector('.teams')!;
    this.cards = this.root.querySelector('.cards')!;
    this.banners = this.root.querySelector('.banners')!;
    this.count = this.root.querySelector('.countdown')!;
    this.hint = this.root.querySelector('.hint')!;
  }

  show(on: boolean, hint = '') {
    this.root.classList.toggle('hidden', !on);
    if (on && hint) {
      this.hint.textContent = hint;
      this.hint.classList.remove('fade');
      setTimeout(() => this.hint.classList.add('fade'), 7000);
    }
    if (!on) {
      this.banners.innerHTML = '';
      this.count.textContent = '';
    }
    this.lastStatus = this.lastCards = '';
  }

  setRounds(wins: number[]) {
    this.roundWins = wins;
    this.lastStatus = '';
  }

  setStatus(status: TeamStatus[]) {
    const key = JSON.stringify([status.map((s) => [s.blocs.map((b) => b.state), s.bunnyHp, s.eliminated]), this.roundWins]);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.teams.innerHTML = status
      .map((s, i) => {
        const blocs = s.blocs
          .map((b) => `<span class="pip ${b.state}" style="--c:${hex(s.team.color)}">${b.human !== null ? `P${b.human + 1}` : ''}</span>`)
          .join('');
        const hearts = Array.from({ length: TUNING.bunny.hp }, (_, h) => `<span class="heart ${h < s.bunnyHp ? 'on' : ''}">♥</span>`).join('');
        const rounds = Array.from({ length: TUNING.rounds.toWin }, (_, r) => `<span class="round ${r < (this.roundWins[s.team.id] ?? 0) ? 'won' : ''}"></span>`).join('');
        return `${i > 0 ? '<span class="vs">VS</span>' : ''}
          <div class="team ${s.eliminated ? 'out' : ''}" style="--c:${hex(s.team.color)}">
            <div class="blocs">${blocs}</div>
            <div class="bunny"><span class="bun">🐰</span>${hearts}</div>
            <div class="rounds">${rounds}</div>
          </div>`;
      })
      .join('');
  }

  setPlayers(players: PlayerStatus[]) {
    const key = JSON.stringify(players.map((p) => [p.alive, p.weaponStatus.label, Math.round(p.weaponStatus.ready * 20), p.dash >= 1, p.revives]));
    if (key === this.lastCards) return;
    this.lastCards = key;
    this.cards.innerHTML = players
      .map((p) => `
        <div class="pcard p${p.player + 1} ${p.alive ? '' : 'down'}" style="--c:${hex(p.team.color)}">
          <div class="who">P${p.player + 1}</div>
          <div class="wpn">
            <div class="wname">${WEAPONS[p.weapon].icon} ${p.weaponStatus.label}</div>
            <div class="bar"><div style="width:${Math.round(p.weaponStatus.ready * 100)}%"></div></div>
          </div>
          <div class="extras">
            <span class="dash ${p.dash >= 1 ? 'on' : ''}" title="Dash">💨</span>
            <span class="rev ${p.revives > 0 ? 'on' : ''}" title="Revive">💚</span>
          </div>
        </div>`)
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
