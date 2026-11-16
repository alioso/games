// The computer golfer's thinking: try putts all round (every direction, every strength) through the
// aiming prediction and keep the best: one that drops if there is one (as gently as will do), otherwise
// the one that finishes nearest the cup, keeping out of ponds and sand. The search is spread over a
// few frames (a slice each frame) so nothing stutters while the computer is "thinking".
import { PUTT } from '../data/tuning';
import { type Shape, onSand } from '../world/geometry';
import { predict } from './predict';

export interface Shot {
  aim: number;
  power: number;
  holed: boolean;
}

/** Putt speed for a power (0..1) on the gauge. */
export const speedFor = (power: number) => PUTT.minSpeed + (PUTT.maxSpeed - PUTT.minSpeed) * Math.pow(power, PUTT.curve);

export class ShotSearch {
  /** Putts still to try: [aim, power]. */
  private todo: [number, number][] = [];
  private refined = false;
  private tried: (Shot & { score: number })[] = [];
  private best: (Shot & { score: number }) | null = null;

  constructor(private shape: Shape, private x: number, private z: number) {
    const [cx, cz] = shape.hole.cup;
    const base = Math.atan2(cx - x, -(cz - z));
    // First a rough look all round (straight at the cup first, fanning out), then a closer look
    // round the best few.
    for (let k = 0; k * 0.07 <= Math.PI; k++) {
      for (const aim of k ? [base + k * 0.07, base - k * 0.07] : [base]) {
        for (let p = 1; p <= 10; p++) this.todo.push([aim, p / 10]);
      }
    }
  }

  get done() {
    return this.refined && this.todo.length === 0;
  }

  private score(aim: number, power: number) {
    const [cx, cz] = this.shape.hole.cup;
    const r = predict(this.shape, this.x, this.z, Math.sin(aim), -Math.cos(aim), speedFor(power), 80);
    let score: number;
    if (r.holed) score = -10 + power;
    else {
      score = Math.hypot(r.end[0] - cx, r.end[1] - cz);
      if (r.water) score += 30;
      else if (onSand(this.shape, r.end[0], r.end[1])) score += 0.8;
    }
    const shot = { aim, power, holed: r.holed, score };
    if (!this.refined) this.tried.push(shot);
    if (!this.best || score < this.best.score) this.best = shot;
  }

  /** Think for up to `ms` milliseconds; true when finished. */
  step(ms = 6) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      const next = this.todo.pop();
      if (next) { this.score(next[0], next[1]); continue; }
      if (this.refined) break;
      // The rough look's done: look closely round its three best.
      this.refined = true;
      const top = this.tried.sort((a, b) => a.score - b.score).slice(0, 3);
      for (const t of top) {
        for (let da = -2; da <= 2; da++) {
          for (let dp = -3; dp <= 3; dp++) {
            const power = t.power + dp * 0.025;
            if (power > 0.02 && power <= 1 && (da || dp)) this.todo.push([t.aim + da * 0.0175, power]);
          }
        }
      }
    }
    return this.done;
  }

  /** The best putt found (searching to the end first if need be). */
  result(): Shot {
    while (!this.done) this.step(50);
    const b = this.best!;
    return { aim: b.aim, power: b.power, holed: b.holed };
  }
}

/** A normal random number (mean 0, spread 1). */
export function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** How steady a computer golfer's hands are: aim spread (radians) and power spread (fraction). */
export const CPU_SKILL = {
  easy: { aim: 0.07, power: 0.18 },
  good: { aim: 0.015, power: 0.05 },
};
export type CpuLevel = keyof typeof CPU_SKILL;
