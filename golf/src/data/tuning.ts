// The numbers that make BB Golf feel the way it does. Metres, seconds, m/s.

export const BALL = {
  /** A bit bigger than a real golf ball (2.1 cm), so it reads on screen next to the little heroes. */
  radius: 0.045,
  mass: 0.046,
  /** Bounce off the ground (mostly dead) and how much a wall gives back. */
  groundBounce: 0.2,
  wallBounce: 0.72,
  /** Grip on the grass: high enough that it rolls instead of skidding. */
  friction: 0.6,
};

/**
 * How quickly a rolling ball slows on each surface (m/s² of deceleration, like a putting green's
 * "speed"). A real green is about 0.6; sand grabs it; the fringe is in between.
 */
export const SURFACE = {
  green: 0.62,
  fringe: 1.6,
  sand: 3.6,
};

export const PUTT = {
  /** Ball speed at full power. On a flat green that rolls about v²/(2·0.62) ≈ 34 m. */
  maxSpeed: 6.5,
  /** Gentlest putt (the gauge never quite reaches zero). */
  minSpeed: 0.25,
  /** Seconds for the gauge to fill; it then drops back down at the same speed while held. */
  fill: 1.5,
  /** The gauge's curve: <1 gives finer control of short putts. */
  curve: 1.6,
  /** Aim: turning speed (rad/s) at full stick, and the slower speed while nudging. */
  turn: 1.3,
  turnFine: 0.25,
};

export const CUP = {
  /** The hole: bigger than real (5.4 cm) to suit the bigger ball. */
  radius: 0.11,
  /** Fastest a ball can be going over the middle of the hole and still drop. Slower near the edge. */
  capture: 1.9,
};

export const PHYS = {
  /** Physics steps per second (small steps keep fast balls honest against walls). */
  hz: 240,
  gravity: 9.81,
  /** Below this speed (and on gentle ground) the ball has stopped. */
  stopSpeed: 0.05,
  /** Strokes before a hole is given up (counts as this many). */
  maxStrokes: 10,
};

export const WALL = {
  height: 0.16,
  thickness: 0.12,
};
