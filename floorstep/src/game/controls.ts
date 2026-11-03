// Floor Step's buttons: one player, keyboard or any gamepad, all rebindable in Controls.
// Defaults:
//   Keyboard: move WASD/arrows · E search · J light · K heavy · L block (hold) · Space dodge · Q special · Esc pause
//   Gamepad (standard layout): stick/d-pad · A search · X light · Y heavy · RB/LB block · B dodge · RT/LT special · Start pause
import { keyboard, padHat } from '@engine/input';
import { loadJSON, saveJSON } from '@engine/save';

export interface HeroControls {
  moveX: number;
  moveZ: number;
  interact: boolean;
  light: boolean;
  heavy: boolean;
  /** Held. */
  block: boolean;
  dodge: boolean;
  special: boolean;
  pause: boolean;
}

export const NO_CONTROLS: HeroControls = { moveX: 0, moveZ: 0, interact: false, light: false, heavy: false, block: false, dodge: false, special: false, pause: false };

/** Actions you can rebind (movement keys too; the stick is always the stick). */
export type Action = 'up' | 'down' | 'left' | 'right' | 'interact' | 'light' | 'heavy' | 'block' | 'dodge' | 'special' | 'pause';
export const ACTIONS: { id: Action; label: string; pad: boolean }[] = [
  { id: 'interact', label: 'Search / open', pad: true },
  { id: 'light', label: 'Attack (combo)', pad: true },
  { id: 'heavy', label: 'Heavy attack', pad: true },
  { id: 'block', label: 'Block (hold)', pad: true },
  { id: 'dodge', label: 'Dodge', pad: true },
  { id: 'special', label: 'Special', pad: true },
  { id: 'pause', label: 'Pause', pad: true },
  { id: 'up', label: 'Move up', pad: false },
  { id: 'down', label: 'Move down', pad: false },
  { id: 'left', label: 'Move left', pad: false },
  { id: 'right', label: 'Move right', pad: false },
];

export interface Bindings {
  keys: Record<Action, string[]>;
  /** Gamepad button indices per action (movement uses the stick and d-pad). */
  pad: Partial<Record<Action, number[]>>;
}

export function defaultBindings(): Bindings {
  return {
    keys: {
      up: ['KeyW', 'ArrowUp'],
      down: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      interact: ['KeyE', 'Enter'],
      light: ['KeyJ'],
      heavy: ['KeyK'],
      block: ['KeyL', 'ShiftLeft', 'ShiftRight'],
      dodge: ['Space'],
      special: ['KeyQ'],
      pause: ['Escape', 'KeyP'],
    },
    pad: { interact: [0], light: [2], heavy: [3], block: [4, 5], dodge: [1], special: [6, 7], pause: [9] },
  };
}

const KEY = 'floorstep.controls';

export function loadBindings(): Bindings {
  const d = defaultBindings();
  const saved = loadJSON<Partial<Bindings>>(KEY, {});
  return { keys: { ...d.keys, ...(saved.keys ?? {}) }, pad: { ...d.pad, ...(saved.pad ?? {}) } };
}

export function saveBindings(b: Bindings) {
  saveJSON(KEY, b);
}

/** Readable name for a key code ("KeyJ" → "J"). */
export function keyName(code: string) {
  const special: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Space: 'Space', Enter: 'Enter',
    ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
  };
  return special[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

/** Readable name for a standard-layout gamepad button (Xbox labels; positions match any pad). */
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L-stick', 'R-stick', 'D-up', 'D-down', 'D-left', 'D-right', 'Home'];
export function padName(i: number, standard = true) {
  return standard && PAD_NAMES[i] ? PAD_NAMES[i] : `Button ${i}`;
}

/**
 * Why no controller can show up, if there's a reason we can tell: browsers only allow controllers
 * on secure addresses (localhost counts, a 192.168… network address doesn't).
 */
export function padBlocker(): string | null {
  if (!window.isSecureContext) {
    return `Controllers only work on a secure address. Open <b>http://localhost:${location.port || '5174'}</b> on this computer instead of <b>${location.host}</b>.`;
  }
  if (!navigator.getGamepads) return 'This browser doesn\'t support controllers. Try Chrome or Safari.';
  return null;
}

const DEADZONE = 0.22;

export class Controller {
  private prev = new Map<number, boolean[]>();

  constructor(public bindings: Bindings) {}

  poll(): HeroControls {
    const k = this.bindings.keys;
    let x = (keyboard.any(k.right) ? 1 : 0) - (keyboard.any(k.left) ? 1 : 0);
    let z = (keyboard.any(k.down) ? 1 : 0) - (keyboard.any(k.up) ? 1 : 0);
    const c: HeroControls = {
      moveX: 0,
      moveZ: 0,
      interact: keyboard.consume(k.interact),
      light: keyboard.consume(k.light),
      heavy: keyboard.consume(k.heavy),
      block: keyboard.any(k.block),
      dodge: keyboard.consume(k.dodge),
      special: keyboard.consume(k.special),
      pause: keyboard.consume(k.pause),
    };
    const P = this.bindings.pad;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const prev = this.prev.get(pad.index) ?? [];
      const held = (ids: number[] = []) => ids.some((i) => pad.buttons[i]?.pressed);
      const edge = (ids: number[] = []) => ids.some((i) => pad.buttons[i]?.pressed && !prev[i]);
      const ax = pad.axes[0] ?? 0, az = pad.axes[1] ?? 0;
      const m = Math.hypot(ax, az);
      if (m > DEADZONE && m <= 1.5) {
        const s = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
        x = (ax / m) * s;
        z = (az / m) * s;
      }
      // D-pad: standard buttons 12-15, or a hat axis on pads the browser doesn't map.
      let [dx, dz] = padHat(pad);
      if (pad.mapping === 'standard') {
        dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        dz = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      }
      if (dx || dz) { x = dx; z = dz; }
      c.interact ||= edge(P.interact);
      c.light ||= edge(P.light);
      c.heavy ||= edge(P.heavy);
      c.block ||= held(P.block);
      c.dodge ||= edge(P.dodge);
      c.special ||= edge(P.special);
      c.pause ||= edge(P.pause);
      this.prev.set(pad.index, pad.buttons.map((b) => b.pressed));
    }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    c.moveX = Number.isFinite(x) ? x : 0;
    c.moveZ = Number.isFinite(z) ? z : 0;
    return c;
  }
}
