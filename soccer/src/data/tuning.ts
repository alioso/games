// Every number that shapes how the game plays. Sizes are metres, speeds metres per second;
// the players are animals about 1 m tall. The pitch runs along x (goals at each end), across z.

export const PITCH = {
  length: 44,
  width: 28,
  goalWidth: 4.6,
  goalHeight: 1.7,
  goalDepth: 1.4,
  /** Penalty area, measured from the goal line, and its width. */
  boxDepth: 6.5,
  boxWidth: 15,
  /** Goal area (the small box). */
  smallDepth: 2.2,
  smallWidth: 8,
  /** Penalty spot, from the goal line. */
  spot: 5.5,
  circle: 4,
  post: 0.07,
};

export const BALL = {
  radius: 0.13,
  gravity: 9.81,
  /** How much of its speed a bounce keeps (up/down, and along the ground). */
  bounce: 0.55,
  bounceGrip: 0.82,
  /** Slowing down while rolling on grass (m/s²). */
  roll: 1.9,
  /** Air drag (per metre travelled, roughly). */
  drag: 0.011,
  /** How strongly spin curls the ball (in the air), how much of that it keeps rolling along the
   *  grass, and how quickly the grass rubs the spin off. */
  magnus: 0.0045,
  rollCurl: 2.2,
  rollSpinDecay: 0.7,
};

export const PLAYER = {
  jog: 4.6,
  sprint: 6.6,
  /** Speed multiplier while dribbling. */
  withBall: 0.9,
  /** Getting going (m/s², from standing; less as they near full speed), and stopping. Low enough
   *  that a player caught flat-footed can't instantly chase a pass down. */
  accel: 11,
  brake: 17,
  /** Turning speed (radians per second): slower with the ball, slower still sprinting with it. */
  turn: 12,
  turnWithBall: 7.5,
  turnSprintBall: 5,
  radius: 0.3,
  /** How close the ball must come (beyond the body's edge) to take control of it. */
  control: 0.38,
  /** Lose the ball if it gets further than this from the dribbler. */
  keep: 1.0,
  /** How far the ball can be (from the body) and still get kicked. */
  reach: 0.75,
  /** Heights the ball can be headed at. */
  headLow: 0.75,
  headHigh: 1.65,
};

export const KICK = {
  /** Seconds holding a button to reach full power. */
  charge: 0.9,
  /** Wind-up before the foot meets the ball. */
  windup: 0.11,
  /** Ball speeds, weakest to strongest. The pitch is ~40% of a real one, so these are well under
   *  real-life speeds (a real 30 m/s shot here would cross the box in a blink). */
  pass: [7, 17] as const,
  shot: [10, 19] as const,
  lob: [7, 17] as const,
  throwIn: [5, 10] as const,
  header: [5, 10] as const,
  /** Keeper throws, and punts / clearances (top speeds). */
  keeperThrow: 12,
  punt: 20,
  /** Ball speed (relative to the player) that can be taken cleanly, and that can be cushioned at all. */
  takeClean: 11.5,
  takeHard: 17.5,
};

/** The broadcast camera: up in the stand on the near side, following the ball. */
export const CAMERA = {
  fov: 30,
  height: 13,
  /** Distance back from the near touchline. */
  back: 14,
  /** How far it looks ahead of a moving ball (seconds). */
  lead: 0.35,
};

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AiLevel {
  label: string;
  /** Seconds between decisions for the player on the ball. */
  think: number;
  /** Random error (radians) on passes and shots. */
  passError: number;
  shotError: number;
  /** Tackle attempts per second when close to the ball. */
  tackleRate: number;
  /** Running speed multiplier. */
  speed: number;
  /** Goalkeeper: 0..1 how good at saving. */
  keeper: number;
  /** How far out they'll shoot from. */
  shootRange: number;
  /** How keen to pass rather than dribble (0..1). */
  passing: number;
  /** Seconds to read the other team's pass before reacting to it. */
  read: number;
}

export const AI_LEVELS: Record<Difficulty, AiLevel> = {
  easy: { label: 'Easy', think: 0.75, passError: 0.16, shotError: 0.27, tackleRate: 0.5, speed: 0.85, keeper: 0.22, shootRange: 10, passing: 0.35, read: 0.45 },
  medium: { label: 'Medium', think: 0.45, passError: 0.09, shotError: 0.17, tackleRate: 1.2, speed: 0.93, keeper: 0.4, shootRange: 13, passing: 0.55, read: 0.33 },
  hard: { label: 'Hard', think: 0.25, passError: 0.045, shotError: 0.1, tackleRate: 2.2, speed: 1.0, keeper: 0.55, shootRange: 16, passing: 0.75, read: 0.22 },
};

/** Your teammates play at medium; your keeper is better on the easier levels. */
export function teammateLevel(d: Difficulty): AiLevel {
  return { ...AI_LEVELS.medium, read: 0.3, shotError: 0.1, speed: 0.96, keeper: d === 'easy' ? 1 : d === 'medium' ? 0.85 : 0.75 };
}

/** Minutes per half you can pick. */
export const HALF_LENGTHS = [5, 10, 20];

/**
 * The weather's (small) effect on the ball for the match being played: rolling friction and bounce
 * multipliers, extra skid off a bounce, and wind pushing a ball in the air (m/s²). Set at kick-off.
 */
export const CONDITIONS = { roll: 1, bounce: 1, grip: 1, windX: 0, windZ: 0 };
