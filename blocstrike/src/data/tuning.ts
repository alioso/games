// ⚙️ GAME RULES & NUMBERS — change these and the game updates instantly.

export const TUNING = {
  bloc: {
    speed: 6.2, // units per second
    radius: 0.55,
    dashDistance: 3.2, // "you move a little, not like crazy"
    dashTime: 0.16, // seconds the dash lasts
    dashCooldown: 5, // seconds before you can dash again
  },
  bunny: {
    hp: 3, // poofs at the third hit
    speed: 2.6,
    radius: 0.7,
  },
  revive: {
    time: 3, // seconds standing on a teammate
    perPlayer: 1, // how many times each player can revive someone
    radius: 0.9, // how close you must stand
  },
  teams: {
    blocsPerTeam: 3,
  },
  rounds: {
    toWin: 3, // best of 5
  },
  coins: {
    perWin: 10, // for winning the whole match
  },
  /** Explosions push blocs that are close but not close enough to be hit. */
  knockback: {
    decay: 7, // how fast the push fades
  },
  /** Aim help: snap to an enemy if it's within this angle (degrees) of where you aim. */
  aimAssistDeg: { human: 14 },
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** How good the computer players are. */
export const AI_LEVELS: Record<Difficulty, {
  reaction: number; // seconds before reacting to a new chance to throw
  aimError: number; // degrees of random aim error
  dodgeChance: number; // chance to dodge an incoming spear
  leadTarget: number; // 0..1: how well they predict where you are going
}> = {
  easy: { reaction: 1.6, aimError: 16, dodgeChance: 0.2, leadTarget: 0.1 },
  normal: { reaction: 1.1, aimError: 10, dodgeChance: 0.45, leadTarget: 0.5 },
  hard: { reaction: 0.65, aimError: 5, dodgeChance: 0.65, leadTarget: 0.85 },
};
