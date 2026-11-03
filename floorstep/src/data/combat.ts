// Fighting numbers: every hero move, every monster attack. Times are in seconds, damage in
// half-hearts (2 = one full heart), distances in metres.
import type { HeroClass } from './heroes';
import type { Difficulty } from './tuning';

export interface MeleeMove {
  /** Pose the hero plays. */
  pose: 'swing1' | 'swing2' | 'heavy' | 'thrust' | 'slam' | 'bash';
  /** When the blow lands, and how long the whole move lasts. */
  hit: number;
  total: number;
  damage: number;
  reach: number;
  /** Half-angle of the arc it covers, in degrees. */
  arc: number;
  stamina: number;
  /** Knocks the monster back this far, and stuns it this long. */
  push?: number;
  stun?: number;
  /** Steps forward while striking. */
  lunge?: number;
}

export interface ClassCombat {
  maxHp: number;
  speed: number;
  /** Light combo: these moves chain if you press again before the previous one ends. */
  combo: MeleeMove[];
  heavy: MeleeMove;
  /** Damage taken while blocking (0.1 = only 10% gets through). Barbarians only parry. */
  block: number;
  special: {
    kind: 'blast' | 'bash' | 'slam' | 'smoke';
    cooldown: number;
    /** Wizard: magic charges that refill one by one. */
    charges?: number;
  };
}

const swing = (pose: 'swing1' | 'swing2', damage: number, reach: number): MeleeMove => ({ pose, hit: 0.16, total: 0.46, damage, reach, arc: 75, stamina: 10 });

export const COMBAT: Record<HeroClass, ClassCombat> = {
  wizard: {
    maxHp: 8,
    speed: 1,
    combo: [swing('swing1', 1, 1.0), swing('swing2', 1, 1.0), { pose: 'heavy', hit: 0.2, total: 0.55, damage: 1.5, reach: 1.05, arc: 50, stamina: 12, push: 0.4 }],
    heavy: { pose: 'heavy', hit: 0.38, total: 0.8, damage: 2.5, reach: 1.1, arc: 45, stamina: 22, push: 0.6, stun: 0.5 },
    block: 0.5,
    special: { kind: 'blast', cooldown: 0.6, charges: 3 },
  },
  knight: {
    maxHp: 12,
    speed: 0.9,
    combo: [
      { pose: 'thrust', hit: 0.2, total: 0.55, damage: 1, reach: 1.6, arc: 30, stamina: 11, lunge: 0.3 },
      { pose: 'thrust', hit: 0.2, total: 0.55, damage: 1, reach: 1.6, arc: 30, stamina: 11, lunge: 0.3 },
      { pose: 'heavy', hit: 0.26, total: 0.65, damage: 1.8, reach: 1.5, arc: 70, stamina: 14, push: 0.5 },
    ],
    heavy: { pose: 'heavy', hit: 0.42, total: 0.9, damage: 2.8, reach: 1.6, arc: 80, stamina: 24, push: 0.7, stun: 0.6 },
    block: 0.1,
    special: { kind: 'bash', cooldown: 5 },
  },
  barbarian: {
    maxHp: 12,
    speed: 0.95,
    combo: [
      { pose: 'swing1', hit: 0.2, total: 0.55, damage: 1.4, reach: 1.15, arc: 80, stamina: 12 },
      { pose: 'swing2', hit: 0.2, total: 0.55, damage: 1.4, reach: 1.15, arc: 80, stamina: 12 },
      { pose: 'heavy', hit: 0.3, total: 0.7, damage: 2.2, reach: 1.2, arc: 60, stamina: 16, push: 0.8, stun: 0.4 },
    ],
    heavy: { pose: 'heavy', hit: 0.5, total: 1.0, damage: 3.6, reach: 1.25, arc: 55, stamina: 26, push: 1.0, stun: 0.8 },
    block: 0.75,
    special: { kind: 'slam', cooldown: 6 },
  },
  thief: {
    maxHp: 10,
    speed: 1.1,
    // Knife moves; the crossbow fires instead of the first one while there are bolts left.
    combo: [
      { pose: 'swing1', hit: 0.12, total: 0.34, damage: 0.8, reach: 0.85, arc: 70, stamina: 8 },
      { pose: 'swing2', hit: 0.12, total: 0.34, damage: 0.8, reach: 0.85, arc: 70, stamina: 8 },
      { pose: 'thrust', hit: 0.14, total: 0.45, damage: 1.4, reach: 0.95, arc: 40, stamina: 10, lunge: 0.4 },
    ],
    heavy: { pose: 'thrust', hit: 0.3, total: 0.7, damage: 2.2, reach: 1.0, arc: 40, stamina: 18, lunge: 1.4, stun: 0.3 },
    block: 0.35,
    special: { kind: 'smoke', cooldown: 7 },
  },
};

export const STAMINA = { max: 100, regen: 32, delay: 0.5, dodge: 18, blockHit: 10 };
export const DODGE = { time: 0.32, speed: 7.5, invulnerable: 0.24 };
/** Pressing block this soon before a blow lands parries it: no damage, monster stunned. */
export const PARRY = { window: 0.2, stun: 1.0 };
export const BLAST = { speed: 10, damage: 2, recharge: 6, range: 12 };
export const CROSSBOW = { speed: 18, damage: 1.3, start: 12, reload: 0.55, range: 16 };
export const SLAM = { radius: 2.3, damage: 2, push: 1.2, stun: 0.7 };
export const BASH = { reach: 1.2, damage: 0.5, stun: 1.3 };
export const SMOKE = { blind: 3, dash: 2.2 };

/** How long the hero is stunned and pushed when hit. */
export const HURT = { time: 0.35, push: 0.5, invulnerable: 0.6 };

/** How much more patient monsters are on easy, and pushier on hard. */
/** `hp`: share of the monster's health bar it brings (on easy it only shows up once, so less). */
export const AGGRESSION: Record<Difficulty, { cooldown: number; tell: number; damage: number; hp: number }> = {
  easy: { cooldown: 1.5, tell: 1.25, damage: 0.7, hp: 0.55 },
  medium: { cooldown: 1, tell: 1, damage: 1, hp: 1 },
  hard: { cooldown: 0.8, tell: 0.9, damage: 1.25, hp: 1 },
};
