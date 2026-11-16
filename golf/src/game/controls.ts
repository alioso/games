// The buttons. Every button reports when it went down, how long it's been held, and when it came
// back up (holding the swing button fills the power gauge; letting go swings).
//
//                       Controller            Keyboard
//   Aim                 left stick / d-pad    ← → (or A / D)
//   Fine aim (hold)     LB / RB               Shift
//   Swing (hold, let go) A                    Space (or J)
//   Look at the hole    Y                     V
//   Skip the hole       Back / Select         N (hold)
//   Pause               Start                 Esc / P
import { keyboard, padHat } from '@engine/input';

export type Button = 'swing' | 'view' | 'skip' | 'fine' | 'pause';

export interface ButtonState {
  /** Held right now. */
  down: boolean;
  /** Went down this tick. */
  pressed: boolean;
  /** Came up this tick (held for `held` seconds). */
  released: boolean;
  /** How long it's been (or was) held. */
  held: number;
}

export interface PadInput {
  moveX: number;
  moveZ: number;
  b: Record<Button, ButtonState>;
}

export const KEYS: Record<Button, string[]> = {
  swing: ['Space', 'KeyJ'],
  view: ['KeyV'],
  skip: ['KeyN'],
  fine: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
};

/** Standard gamepad layout: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start. */
export const PAD: Record<Button, number[]> = {
  swing: [0],
  view: [3],
  skip: [8],
  fine: [4, 5],
  pause: [9],
};

const BUTTONS: Button[] = ['swing', 'view', 'skip', 'fine', 'pause'];
const DEADZONE = 0.22;

/** What the controls screen shows. */
export const CONTROL_HELP: { group: string; rows: [string, string, string][] }[] = [
  {
    group: 'Putting',
    rows: [
      ['Aim', 'Left stick / D-pad', '← → or A / D'],
      ['Aim slowly (hold)', 'LB or RB', 'Shift'],
      ['Power: hold, then let go to swing', 'A', 'Space'],
      ['Look at the hole (and back)', 'Y', 'V'],
      ['Skip the hole (counts 10)', 'Back (hold)', 'N (hold)'],
      ['Pause', 'Start', 'Esc'],
    ],
  },
];

export class Controller {
  private state = new Map<Button, ButtonState>();
  private prevPad = new Map<number, boolean[]>();

  constructor() {
    for (const b of BUTTONS) this.state.set(b, { down: false, pressed: false, released: false, held: 0 });
  }

  /** Read everything; call once per tick. */
  poll(dt: number): PadInput {
    let x = (keyboard.any(['KeyD', 'ArrowRight']) ? 1 : 0) - (keyboard.any(['KeyA', 'ArrowLeft']) ? 1 : 0);
    let z = (keyboard.any(['KeyS', 'ArrowDown']) ? 1 : 0) - (keyboard.any(['KeyW', 'ArrowUp']) ? 1 : 0);
    const downNow = new Map<Button, boolean>();
    const tapped = new Map<Button, boolean>();
    for (const b of BUTTONS) {
      tapped.set(b, keyboard.consume(KEYS[b]));
      downNow.set(b, keyboard.any(KEYS[b]));
    }
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const prev = this.prevPad.get(pad.index) ?? [];
      const ax = pad.axes[0] ?? 0, az = pad.axes[1] ?? 0;
      const m = Math.hypot(ax, az);
      if (m > DEADZONE && m <= 1.5) {
        const s = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
        x = (ax / m) * s;
        z = (az / m) * s;
      }
      let [dx, dz] = padHat(pad);
      if (pad.mapping === 'standard') {
        dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        dz = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      }
      if (dx || dz) { x = dx; z = dz; }
      for (const b of BUTTONS) {
        const ids = PAD[b];
        // Triggers can be analogue: count them as pressed past halfway.
        const isDown = ids.some((i) => (pad.buttons[i]?.value ?? 0) > 0.5 || pad.buttons[i]?.pressed);
        if (isDown) downNow.set(b, true);
        if (ids.some((i) => pad.buttons[i]?.pressed && !prev[i])) tapped.set(b, true);
      }
      this.prevPad.set(pad.index, pad.buttons.map((bt) => bt.pressed || bt.value > 0.5));
    }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    const out = { moveX: Number.isFinite(x) ? x : 0, moveZ: Number.isFinite(z) ? z : 0, b: {} as Record<Button, ButtonState> };
    for (const b of BUTTONS) {
      const s = this.state.get(b)!;
      const was = s.down, held = downNow.get(b)!;
      // A key pressed and let go between two ticks still counts: pressed and released at once.
      const blip = !held && !was && tapped.get(b)!;
      s.pressed = (held && !was) || blip;
      s.released = (was && !held) || blip;
      if (s.pressed) s.held = 0;
      else if (held) s.held += dt;
      s.down = held;
      out.b[b] = { ...s };
    }
    return out;
  }

  /** Forget any held buttons (e.g. after a menu). */
  reset() {
    for (const s of this.state.values()) Object.assign(s, { down: false, pressed: false, released: false, held: 0 });
    keyboard.consume(Object.values(KEYS).flat());
  }
}

export const NO_INPUT: PadInput = {
  moveX: 0,
  moveZ: 0,
  b: Object.fromEntries(BUTTONS.map((b) => [b, { down: false, pressed: false, released: false, held: 0 }])) as Record<Button, ButtonState>,
};
