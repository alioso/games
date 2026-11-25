// What the game remembers between visits: which mazes you've got the ruby from (each one opens the
// next), your best time and hearts in each, whether you've been to heaven, and who you played last.
import { loadJSON, saveJSON } from '@engine/save';

export interface Best { time: number; hearts: number }

export interface Progress {
  done: boolean[];
  best: (Best | null)[];
  heaven: boolean;
  hero: string | null;
}

const KEY = 'amazein-progress-v1';
const fresh = (): Progress => ({ done: [false, false, false], best: [null, null, null], heaven: false, hero: null });

export const progress: Progress = loadJSON(KEY, fresh());

export function save() {
  saveJSON(KEY, progress);
}

/** Can you play this maze yet? (The first is always open; each ruby opens the next.) */
export function unlocked(i: number) {
  return i === 0 || progress.done[i - 1];
}

/** Record a finished maze; true if it beat the best time. */
export function finish(i: number, time: number, hearts: number) {
  progress.done[i] = true;
  const b = progress.best[i];
  const better = !b || time < b.time;
  progress.best[i] = { time: better ? time : b!.time, hearts: Math.max(hearts, b?.hearts ?? 0) };
  save();
  return better;
}

export function resetProgress() {
  Object.assign(progress, fresh());
  save();
}

/** 4:05 */
export function clock(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
