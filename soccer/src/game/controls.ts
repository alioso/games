// The buttons. Every action button reports when it went down, how long it's been held, and when it
// came back up, so a tap and a long press can do different things (power for passes and shots).
//
//                       Controller          Keyboard
//   Move                left stick / d-pad  WASD or arrows
//   Sprint (hold)       RB / RT             Shift
//   Switch player       LB / LT             Q
//   Pause               Start               Esc / P
//   With the ball:
//     Pass              A                   J      tap = short, hold = harder
//     Shoot             X                   K      hold for power (too much = over the bar)
//     Lob / cross       B                   L      hold for distance
//     Through ball      Y                   I      a pass into space ahead of a teammate
//   Without the ball:
//     Tackle            A                   J
//     Slide tackle      B                   L      risky: get the ball, not the legs!
//     Teammate presses  X (hold)            K      your nearest teammate goes for the ball too
//   Keeper with the ball in hand: A throw · X / B kick it long
import { keyboard, padHat } from '@engine/input';

export type Button = 'pass' | 'shoot' | 'lob' | 'through' | 'sprint' | 'switch' | 'pause';

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
  pass: ['KeyJ'],
  shoot: ['KeyK'],
  lob: ['KeyL'],
  through: ['KeyI'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  switch: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
};

/** Standard gamepad layout: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start. */
export const PAD: Record<Button, number[]> = {
  pass: [0],
  shoot: [2],
  lob: [1],
  through: [3],
  sprint: [5, 7],
  switch: [4, 6],
  pause: [9],
};

const BUTTONS: Button[] = ['pass', 'shoot', 'lob', 'through', 'sprint', 'switch', 'pause'];
const DEADZONE = 0.22;

/** What the controls screen shows. */
export const CONTROL_HELP: { group: string; rows: [string, string, string][] }[] = [
  { group: 'Everywhere', rows: [['Move', 'Left stick / D-pad', 'WASD / Arrows'], ['Sprint (hold)', 'RB or RT', 'Shift'], ['Switch player', 'LB or LT', 'Q'], ['Pause', 'Start', 'Esc']] },
  {
    group: 'With the ball',
    rows: [
      ['Pass (tap short, hold harder)', 'A', 'J'],
      ['Shoot (hold for power)', 'X', 'K'],
      ['Lob / cross (hold for distance)', 'B', 'L'],
      ['Through ball (into space ahead)', 'Y', 'I'],
    ],
  },
  { group: 'Defending', rows: [['Tackle', 'A', 'J'], ['Slide tackle (careful!)', 'B', 'L'], ['Teammate presses too (hold)', 'X', 'K']] },
  { group: 'Keeper, ball in hands', rows: [['Throw it out', 'A', 'J'], ['Kick it long', 'X or B', 'K or L']] },
  {
    group: 'Free kicks and penalties',
    rows: [
      ['Free kick: shoot (hold longer to clear the wall)', 'X', 'K'],
      ['Your penalty: pick the corner, then shoot', 'stick + X', 'WASD + K'],
      ['Their penalty: hold where your keeper dives', 'stick (up = high)', 'WASD (W = high)'],
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
