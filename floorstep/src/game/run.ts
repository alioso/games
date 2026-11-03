// Everything about a game in progress that carries from floor to floor, and gets saved.
import type { MonsterName } from '../data/monsters';
import type { HeroLook } from '../data/heroes';
import type { Difficulty } from '../data/tuning';
import type { Injury } from '../entities/monsterModel';
import { COMBAT, CROSSBOW } from '../data/combat';

export interface RunState {
  difficulty: Difficulty;
  floor: number;
  look: HeroLook;
  seedBase: number;
  /** Health (half-hearts): only food and potions bring it back. */
  hp: number;
  /** Thief's crossbow bolts. */
  arrows: number;
  /** Tries left on a floor before it's back to floor 1. */
  continues: number;
  /** How hurt each monster is, so it comes back with its bandage and half a health bar. */
  monsters: Partial<Record<MonsterName, { hp: number; injuries: Injury[]; dead?: boolean }>>;
  /** Junk you're carrying (ids from JUNK): some residents want it. */
  pocket: string[];
  /** How each resident feels about you (they remember you on later floors). */
  residents: Record<string, { mood: number; met: number }>;
  /** For the end screen. */
  stats: { searched: number; beaten: number; fled: number; falls: number; seconds: number; petted: number };
}

export const CONTINUES = 3;

export function newRun(difficulty: Difficulty, look: HeroLook, seedBase: number): RunState {
  return {
    difficulty, floor: 1, look, seedBase, hp: COMBAT[look.cls].maxHp, arrows: CROSSBOW.start, continues: CONTINUES, monsters: {},
    pocket: [], residents: {},
    stats: { searched: 0, beaten: 0, fled: 0, falls: 0, seconds: 0, petted: 0 },
  };
}
