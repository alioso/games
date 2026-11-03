// Every number that shapes how the house feels, in one place.

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY: Record<Difficulty, { label: string; floors: number }> = {
  easy: { label: 'Easy', floors: 5 },
  medium: { label: 'Medium', floors: 10 },
  hard: { label: 'Hard', floors: 15 },
};

export const HOUSE = {
  wallHeight: 2.5,
  wallThick: 0.2,
  /** Height walls drop to when they stand between the camera and the hero. */
  cutHeight: 0.5,
  doorWidth: 1.3,
  doorHeight: 2.05,
  /** Room column widths and row depths are picked in these ranges. */
  colWidth: [8, 11] as const,
  rowDepth: [6.5, 8.5] as const,
  /** How far into a room furniture must keep away from a doorway. */
  doorClear: 1.35,
};

/** House size by floor number (1-based): bigger the higher you climb. */
export function gridFor(floor: number) {
  if (floor <= 2) return { cols: 3, rows: 3 };
  if (floor <= 8) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

export const HERO = {
  radius: 0.32,
  speed: 3.6,
  accel: 22,
  /** Distance from furniture at which you can search it. */
  reach: 0.65,
  maxHp: 10,
};

export const CAMERA = {
  height: 15,
  back: 13.4,
  /** Look a little ahead of where the hero walks. */
  lead: 0.6,
};
