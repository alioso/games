// Keyboard + gamepad input, mapped per player through a DeviceConfig.
// Key names are KeyboardEvent.code values ("KeyW", "Space", "ArrowUp"...).
// Gamepad buttons use the browser's "standard" layout: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 9=Start 12-15=D-pad.

export interface KeyBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  attack: string[];
  dash: string[];
  pause: string[];
}

export interface PadBindings {
  attack: number[];
  dash: number[];
  pause: number[];
}

export type DeviceConfig =
  | { kind: 'keyboard'; keys: KeyBindings }
  | { kind: 'gamepad'; index: number; buttons: PadBindings };

export interface Controls {
  /** Movement, length 0..1. z is "down the screen". */
  moveX: number;
  moveZ: number;
  /** Explicit aim (right stick), when the device has one and it's pushed. */
  aimX: number;
  aimZ: number;
  hasAim: boolean;
  attack: boolean;
  attackPressed: boolean;
  attackReleased: boolean;
  dashPressed: boolean;
  pausePressed: boolean;
}

const DEADZONE = 0.22;

class KeyboardState {
  readonly down = new Set<string>();
  readonly hits = new Map<string, number>();
  /** When set, the next key press is handed here instead of the game (used for rebinding). */
  capture: ((code: string) => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.hits.set(e.code, (this.hits.get(e.code) ?? 0) + 1);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  any(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** True if any of the codes was pressed since the last call for those codes. */
  consume(codes: string[]) {
    let hit = false;
    for (const c of codes) {
      if (this.hits.get(c)) hit = true;
      this.hits.delete(c);
    }
    return hit;
  }
}

export const keyboard = new KeyboardState();

export function connectedGamepads(): { index: number; id: string }[] {
  const pads = navigator.getGamepads?.() ?? [];
  const out: { index: number; id: string }[] = [];
  for (const p of pads) if (p && p.connected) out.push({ index: p.index, id: p.id });
  return out;
}

function stick(x: number, y: number): [number, number, number] {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0, 0];
  const s = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  return [(x / m) * s, (y / m) * s, s];
}

/** Turns one player's device into Controls each tick, tracking button edges. */
export class PlayerController {
  private prevAttack = false;
  private prevPad: boolean[] = [];

  constructor(public device: DeviceConfig) {}

  poll(): Controls {
    const c: Controls = {
      moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, hasAim: false,
      attack: false, attackPressed: false, attackReleased: false,
      dashPressed: false, pausePressed: false,
    };
    const d = this.device;
    if (d.kind === 'keyboard') {
      const k = d.keys;
      let x = (keyboard.any(k.right) ? 1 : 0) - (keyboard.any(k.left) ? 1 : 0);
      let z = (keyboard.any(k.down) ? 1 : 0) - (keyboard.any(k.up) ? 1 : 0);
      const m = Math.hypot(x, z);
      if (m > 0) { x /= m; z /= m; }
      c.moveX = x; c.moveZ = z;
      const tapped = keyboard.consume(k.attack);
      c.attack = keyboard.any(k.attack) || tapped;
      c.attackPressed = tapped || (c.attack && !this.prevAttack);
      c.dashPressed = keyboard.consume(k.dash);
      c.pausePressed = keyboard.consume(k.pause);
    } else {
      const pad = navigator.getGamepads?.()[d.index];
      if (pad) {
        const [mx, mz] = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
        let dx = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        let dz = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
        if (dx || dz) { const m = Math.hypot(dx, dz); dx /= m; dz /= m; }
        c.moveX = mx || dx; c.moveZ = mz || dz;
        const [ax, az, as] = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
        if (as > 0.3) { c.hasAim = true; c.aimX = ax / as; c.aimZ = az / as; }
        const held = (ids: number[]) => ids.some((i) => pad.buttons[i]?.pressed);
        const edge = (ids: number[]) => ids.some((i) => pad.buttons[i]?.pressed && !this.prevPad[i]);
        c.attack = held(d.buttons.attack);
        c.attackPressed = edge(d.buttons.attack);
        c.dashPressed = edge(d.buttons.dash);
        c.pausePressed = edge(d.buttons.pause);
        this.prevPad = pad.buttons.map((b) => b.pressed);
      }
    }
    c.attackReleased = this.prevAttack && !c.attack;
    this.prevAttack = c.attack;
    return c;
  }
}

export interface MenuActions {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
}

/** Menu navigation from every keyboard key set and every connected pad, with stick auto-repeat. */
export class MenuInput {
  private prev = new Map<number, boolean[]>();
  private repeatAt = 0;
  private lastDir = '';

  poll(now: number): MenuActions {
    const a: MenuActions = { up: false, down: false, left: false, right: false, confirm: false, back: false };
    a.up = keyboard.consume(['ArrowUp', 'KeyW']);
    a.down = keyboard.consume(['ArrowDown', 'KeyS']);
    a.left = keyboard.consume(['ArrowLeft', 'KeyA']);
    a.right = keyboard.consume(['ArrowRight', 'KeyD']);
    a.back = keyboard.consume(['Escape', 'Backspace']);
    // Enter/Space activate the focused <button> natively, so they aren't handled here.

    let dir = '';
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const prev = this.prev.get(pad.index) ?? [];
      const edge = (i: number) => !!pad.buttons[i]?.pressed && !prev[i];
      if (edge(0)) a.confirm = true;
      if (edge(1)) a.back = true;
      if (edge(12)) a.up = true;
      if (edge(13)) a.down = true;
      if (edge(14)) a.left = true;
      if (edge(15)) a.right = true;
      this.prev.set(pad.index, pad.buttons.map((b) => b.pressed));
      const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
      if (Math.abs(y) > 0.6) dir = y < 0 ? 'up' : 'down';
      else if (Math.abs(x) > 0.6) dir = x < 0 ? 'left' : 'right';
    }
    if (dir && (dir !== this.lastDir || now >= this.repeatAt)) {
      a[dir as 'up'] = true;
      this.repeatAt = now + (dir !== this.lastDir ? 0.4 : 0.15);
    }
    this.lastDir = dir;
    return a;
  }
}
