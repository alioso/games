// The Cup: eight teams, knockout (quarter-finals, semi-finals, final). You play your ties; the
// others are made up (a likely-looking score, and a shootout when it's level). Drawn ties go
// straight to penalties.
import type { Team } from '../data/teams';
import type { Difficulty } from '../data/tuning';

export interface Tie {
  a: Team;
  b: Team;
  /** Goals, and the shootout score if it went to penalties. */
  sa?: number;
  sb?: number;
  pens?: [number, number];
  winner?: Team;
}

export const ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'];

export class Cup {
  /** Ties by round (4, then 2, then 1); later rounds fill in as teams go through. */
  readonly rounds: Tie[][] = [[], [], []];
  round = 0;
  out = false;

  constructor(readonly you: Team, all: Team[], readonly half: number, readonly difficulty: Difficulty) {
    // The draw: you, then the rest shuffled.
    const others = all.filter((t) => t !== you).sort(() => Math.random() - 0.5);
    const teams = [you, ...others].slice(0, 8);
    for (let i = 0; i < 8; i += 2) this.rounds[0].push({ a: teams[i], b: teams[i + 1] });
  }

  /** Your tie in the current round. */
  get yours() {
    return this.rounds[this.round].find((t) => t.a === this.you || t.b === this.you)!;
  }

  get opponent() {
    const t = this.yours;
    return t.a === this.you ? t.b : t.a;
  }

  get won() {
    return this.round === 2 && this.rounds[2][0].winner === this.you;
  }

  /** Your result is in (your goals, theirs, and the shootout if any): make up the others, and draw the next round. */
  record(yours: number, theirs: number, pens: [number, number] | null) {
    const t = this.yours;
    const youA = t.a === this.you;
    t.sa = youA ? yours : theirs;
    t.sb = youA ? theirs : yours;
    if (pens) t.pens = youA ? pens : [pens[1], pens[0]];
    const youWon = pens ? pens[0] > pens[1] : yours > theirs;
    t.winner = youWon ? this.you : youA ? t.b : t.a;
    for (const other of this.rounds[this.round]) if (other !== t) simulate(other);
    if (!youWon) this.out = true;
    if (this.round < 2) {
      const winners = this.rounds[this.round].map((x) => x.winner!);
      this.rounds[this.round + 1] = [];
      for (let i = 0; i < winners.length; i += 2) this.rounds[this.round + 1].push({ a: winners[i], b: winners[i + 1] });
    }
  }

  /** On to the next round (after a win). */
  advance() {
    if (this.round < 2) this.round++;
  }

  /** If you're out, play the rest out so the bracket shows who won it. */
  finishWithoutYou() {
    for (let r = this.round + 1; r <= 2; r++) {
      for (const t of this.rounds[r]) simulate(t);
      if (r < 2) {
        const w = this.rounds[r].map((x) => x.winner!);
        this.rounds[r + 1] = [];
        for (let i = 0; i < w.length; i += 2) this.rounds[r + 1].push({ a: w[i], b: w[i + 1] });
      }
    }
  }

  /** The bracket as HTML: three columns of ties, your team highlighted. */
  html() {
    const name = (t: Team, won: boolean | undefined) => `<span class="${t === this.you ? 'you' : ''} ${won === false ? 'lost' : ''}">${t.short}</span>`;
    const tie = (t: Tie) => {
      const done = t.winner !== undefined;
      const sc = done ? `${t.sa} - ${t.sb}${t.pens ? `<small>(${t.pens[0]}-${t.pens[1]} pens)</small>` : ''}` : 'v';
      return `<div class="tie">${name(t.a, done ? t.winner === t.a : undefined)}<b>${sc}</b>${name(t.b, done ? t.winner === t.b : undefined)}</div>`;
    };
    const col = (r: number) => `<div class="round"><h4>${ROUND_NAMES[r]}${r < 2 ? 's' : ''}</h4>${this.rounds[r].length ? this.rounds[r].map(tie).join('') : '<div class="tie tbd">…</div>'}</div>`;
    return `<div class="bracket">${col(0)}${col(1)}${col(2)}</div>`;
  }
}

/** A made-up result: a couple of goals each at most, and a shootout if level. */
function simulate(t: Tie) {
  const goals = () => { let n = 0; while (Math.random() < 0.55 && n < 5) n++; return n; };
  t.sa = goals();
  t.sb = goals();
  if (t.sa === t.sb) {
    let pa = 0, pb = 0;
    for (let i = 0; i < 5; i++) { pa += Math.random() < 0.75 ? 1 : 0; pb += Math.random() < 0.75 ? 1 : 0; }
    while (pa === pb) { pa += Math.random() < 0.75 ? 1 : 0; pb += Math.random() < 0.75 ? 1 : 0; }
    t.pens = [pa, pb];
    t.winner = pa > pb ? t.a : t.b;
  } else t.winner = t.sa > t.sb ? t.a : t.b;
}
