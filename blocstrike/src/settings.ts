import { loadJSON, saveJSON } from '@engine/save';
import type { DeviceConfig, KeyBindings } from '@engine/input';
import { KEYS_P1, KEYS_P2, PAD_BUTTONS } from './data/controls';
import type { Difficulty } from './data/tuning';
import type { SkinId } from './data/blocs';
import type { HatId } from './data/hats';
import type { WeaponId } from './data/weapons';
import type { BlocLook } from './entities/blocView';

/** "keyboard" or "gamepad:<index>". */
export type DeviceChoice = string;

export interface Settings {
  coins: number;
  wins: number;
  players: 1 | 2;
  p2Team: 'same' | 'other';
  difficulty: Difficulty;
  devices: [DeviceChoice, DeviceChoice];
  keys: [KeyBindings, KeyBindings];
  renderScale: number;
  safeMargin: number;
  volume: number;
  // Shop: one shared collection for both players.
  ownedSkins: SkinId[];
  ownedHats: HatId[];
  ownedWeapons: WeaponId[];
  /** What each player wears. */
  looks: [BlocLook, BlocLook];
  /** Weapon picked for each player's team. */
  weapons: [WeaponId, WeaponId];
  /** Weapon for an all-computer team. */
  enemyWeapon: WeaponId | 'random';
}

const KEY = 'blocstrike.v1';

const DEFAULTS: Settings = {
  coins: 0,
  wins: 0,
  players: 1,
  p2Team: 'same',
  difficulty: 'normal',
  devices: ['keyboard', 'gamepad:0'],
  keys: [structuredClone(KEYS_P1), structuredClone(KEYS_P2)],
  renderScale: 1,
  safeMargin: 0,
  volume: 0.8,
  ownedSkins: ['beginner'],
  ownedHats: [],
  ownedWeapons: ['spear'],
  looks: [{ skin: 'beginner', hat: null }, { skin: 'beginner', hat: null }],
  weapons: ['spear', 'spear'],
  enemyWeapon: 'random',
};

export const settings: Settings = loadJSON(KEY, DEFAULTS);

export function save() {
  saveJSON(KEY, settings);
}

export function deviceConfig(player: 0 | 1): DeviceConfig {
  const choice = settings.devices[player];
  if (choice.startsWith('gamepad:')) {
    return { kind: 'gamepad', index: Number(choice.split(':')[1]), buttons: PAD_BUTTONS };
  }
  return { kind: 'keyboard', keys: settings.keys[player] };
}
