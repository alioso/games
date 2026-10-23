// 🎮 DEFAULT CONTROLS. Players can change these in the Controls menu (saved in the browser).

import type { KeyBindings, PadBindings } from '@engine/input';

export const KEYS_P1: KeyBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  attack: ['Space'],
  dash: ['ShiftLeft'],
  pause: ['Escape'],
};

export const KEYS_P2: KeyBindings = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  attack: ['Enter'],
  dash: ['ShiftRight'],
  pause: ['Backspace'],
};

/** A or RT = throw, B or LB/RB = dash, Start = pause. Left stick moves, right stick aims. */
export const PAD_BUTTONS: PadBindings = {
  attack: [0, 7],
  dash: [1, 4, 5],
  pause: [9],
};

export const KEY_ACTIONS = ['up', 'down', 'left', 'right', 'attack', 'dash'] as const;
