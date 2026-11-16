// A round: up to four players going round the course together. Each hole, the player with the best
// score on the hole before goes first (the "honour"); everyone plays the whole hole in turn.
import type { Character } from '../data/characters';
import { BALL_COLORS } from '../data/characters';
import type { HoleDef } from '../data/holes';
import type { GolferLike } from '../entities/golfer';
import { Golfer } from '../entities/golfer';
import { YouserGolfer } from '../entities/youserGolfer';
import type { CpuLevel } from './ai';

/** Who's in: a golfer, and whether the computer plays them. */
export interface Entry {
  character: Character;
  cpu?: CpuLevel;
}

export interface RoundPlayer {
  character: Character;
  name: string;
  color: number;
  golfer: GolferLike;
  cpu?: CpuLevel;
  /** Strokes on each hole (null until played). */
  scores: (number | null)[];
}

export function makeGolfer(c: Character): GolferLike {
  return c.kind === 'hero' ? new Golfer(c.look) : new YouserGolfer();
}

export class Round {
  readonly players: RoundPlayer[];
  hole = 0;

  /** @param first the course number of the first hole played (1 for the front nine, 10 for the back). */
  constructor(readonly entries: Entry[], readonly holes: HoleDef[], readonly first = 1) {
    this.players = entries.map(({ character: c, cpu }, i) => ({ character: c, name: cpu ? `${c.name} (CPU)` : c.name, color: BALL_COLORS[i], golfer: makeGolfer(c), cpu, scores: holes.map(() => null) }));
  }

  /** Playing order for the current hole: honours from the last hole (ties keep the previous order). */
  order(): RoundPlayer[] {
    if (this.hole === 0) return [...this.players];
    const prev = this.hole - 1;
    return [...this.players].sort((a, b) => (a.scores[prev] ?? 99) - (b.scores[prev] ?? 99));
  }

  /** Strokes so far, and against par for the holes played. */
  total(p: RoundPlayer) {
    let strokes = 0, par = 0;
    p.scores.forEach((s, i) => { if (s !== null) { strokes += s; par += this.holes[i].par; } });
    return { strokes, vsPar: strokes - par };
  }

  get finished() {
    return this.hole >= this.holes.length;
  }

  /** Best first (fewest strokes). */
  standings() {
    return [...this.players].sort((a, b) => this.total(a).strokes - this.total(b).strokes);
  }
}

/** "+2", "-1", "E" (even). */
export function vsParText(v: number) {
  return v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`;
}
