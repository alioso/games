// A match: two teams of seven, the ball, the clock and the rules (kick-offs, throw-ins, corners,
// goal kicks, goals, half time, fouls, free kicks, penalties, cards, offside). You control one player of side 0 (the nearest to the ball, or
// whoever you switch to); everyone else is run by their team's brain.
import * as THREE from 'three';
import { AI_LEVELS, type AiLevel, BALL, type Difficulty, KICK, PITCH, PLAYER, teammateLevel } from '../data/tuning';
import { NUMBERS, type Kit, type Team, kitsFor } from '../data/teams';
import { Ball, type BallEvent } from './ball';
import { type PadInput, NO_INPUT } from './controls';
import { curled, groundKick, loftCapped, loftTime, rollSpeed, shot, wobble } from './kicks';
import { Player, type Role, type SideRef } from './player';
import { TeamBrain } from './ai';
import { Referee } from './referee';
import type { Pose } from '../entities/playerModel';

const L = PITCH.length / 2, W = PITCH.width / 2, GW = PITCH.goalWidth / 2, R = BALL.radius;

export interface Side extends SideRef {
  team: Team;
  kit: Kit;
  players: Player[];
  score: number;
  level: AiLevel;
  brain: TeamBrain;
  /** Holding "teammate presses": a second player goes for the ball. */
  extraPress: boolean;
}

export type Phase = 'kickoff' | 'play' | 'out' | 'restart' | 'goal' | 'halftime' | 'fulltime';
export type RestartKind = 'kickoff' | 'throw' | 'corner' | 'goalkick' | 'free' | 'penalty';

export interface Restart {
  kind: RestartKind;
  side: Side;
  x: number;
  z: number;
  taker: Player;
  /** The taker is at the ball and it can be played. */
  ready: boolean;
  t: number;
  /** Indirect free kick (after offside): no scoring straight from it. */
  indirect?: boolean;
}

export type KickKind = 'pass' | 'shot' | 'lob' | 'through' | 'clear';

/** A kick waiting to happen as soon as the ball's in reach. */
export interface Order {
  kind: KickKind;
  /** 0..1 (how long the button was held). */
  power: number;
  /** Aim direction (stick), or zero to let the game pick. */
  aimX: number;
  aimZ: number;
  /** A teammate to aim at (picked from the aim). */
  target?: Player | null;
  /** An exact spot to put it (AI). */
  spotX?: number;
  spotZ?: number;
  /** Shots: where in the goal (z) and how high. */
  goalZ?: number;
  goalY?: number;
  curl?: number;
  /** Give up after this (match time). */
  until: number;
}

export type MatchEvent =
  | { kind: 'whistle'; long: number }
  | { kind: 'kick'; power: number; header: boolean }
  | { kind: 'touch' }
  | { kind: 'bounce'; speed: number }
  | { kind: 'post' }
  | { kind: 'net'; end: number; speed: number }
  | { kind: 'goal'; side: Side; scorer: Player | null; ownGoal: boolean }
  | { kind: 'save'; catch: boolean }
  | { kind: 'tackle'; won: boolean }
  | { kind: 'banner'; text: string; sub?: string; time?: number; color?: string }
  | { kind: 'foul'; penalty: boolean }
  | { kind: 'card'; player: Player; red: boolean }
  | { kind: 'offside' }
  | { kind: 'halftime' }
  | { kind: 'fulltime' }
  | { kind: 'miss' }
  /** An animal call: the player's own noise (a quack, a woof...) in a mood. */
  | { kind: 'voice'; who: Player; mood: 'happy' | 'sad' | 'ouch' | 'card' };

export interface MatchOptions {
  home: Team;
  away: Team;
  /** Minutes per half. */
  half: number;
  difficulty: Difficulty;
  /** Just your team, no opponents, no clock. */
  training?: boolean;
}

/** Formation, attack-relative: x from -1 (own goal line) to 1, z from -1 to 1 (fractions of half length/width). */
const FORMATION: [number, number, Role][] = [
  [-0.97, 0, 'gk'],
  [-0.62, -0.4, 'def'],
  [-0.62, 0.4, 'def'],
  [-0.32, 0, 'mid'],
  [-0.08, -0.62, 'mid'],
  [-0.08, 0.62, 'mid'],
  [0.22, 0, 'fwd'],
];

/** Pace by formation slot (every team the same): wingers and the striker are a bit quicker. */
/** Goal celebrations, dealt from a shuffled pack so you see them all before any comes round again. */
type Celebration = 'pile' | 'kneeslide' | 'airplane' | 'flip' | 'dance' | 'belly' | 'spin';
const CELEBRATIONS: Celebration[] = ['pile', 'kneeslide', 'airplane', 'flip', 'dance', 'belly', 'spin'];

const PACE = [1, 0.96, 0.97, 0.98, 1.03, 1.03, 1.05];

export class Match {
  readonly group = new THREE.Group();
  readonly sides: Side[];
  readonly ball = new Ball();
  readonly players: Player[] = [];
  phase: Phase = 'kickoff';
  phaseT = 0;
  /** Seconds played in this half (real time). */
  clock = 0;
  half = 1;
  readonly halfLength: number;
  time = 0;
  /** The player you control. */
  human: Player | null = null;
  restart: Restart | null = null;
  readonly orders = new Map<Player, Order>();
  /** A pass on its way to someone (so they go and meet it). */
  pass: { from: Player; to: Player; t: number } | null = null;
  /** Button being held for a kick, for the power bar. */
  charge: { power: number } | null = null;
  scorer: Player | null = null;
  /** Who leads the celebration (the scorer, or for an own goal the nearest attacker), and how. */
  leader: Player | null = null;
  celebration: Celebration = 'pile';
  private celebPack: Celebration[] = [];
  /** Animal calls still to come in this celebration (phase time), and the referee's hoot for a card. */
  private celebCalls: number[] = [];
  private cardHoot = 0;
  /** Make side 0 play itself (tests, attract mode). */
  autopilot = false;
  /** The last kick or throw (which side, when): the other team needs a moment to read it. */
  lastKick: { side: number; t: number } | null = null;
  /** Which way you're pushing the stick (unit vector), for steering your first touch. */
  humanAim: [number, number] | null = null;
  readonly referee = new Referee();
  /** Yellow cards so far, per player; players sent off (walking off, then gone). */
  readonly yellows = new Map<Player, number>();
  readonly sentOff: Player[] = [];
  /** Offside: attackers in an offside position when their team last played the ball. */
  private offside: { side: number; flagged: Set<Player> } | null = null;
  /** An indirect free kick's taker, until someone else touches it (no goal straight from it). */
  private indirectBy: Player | null = null;
  /** A penalty being taken: who, against which keeper, when it was struck. */
  penalty: { side: Side; taker: Player; keeper: Player | null; kickedAt: number } | null = null;
  /** Where you're holding the stick as your keeper faces a penalty (-1/0/1 along the goal, and high?). */
  private keeperGuess = { z: 0, high: false };
  /** Players standing in the wall for a free kick, and their spots. */
  readonly wall = new Map<Player, { x: number; z: number }>();
  /** Tackles already judged (each one is judged once). */
  private judged = new Set<Player>();
  /** How long play stays stopped before the restart is set up. */
  private outDelay = 1;
  /** Everything worth a sound or a banner, collected each update. */
  readonly events: MatchEvent[] = [];
  private kickoffSide = 0;
  /** Which side scored last. */
  private goalSide = 0;
  private switchLock = 0;
  private lastAutoSwitch = 0;
  private lastShot: { t: number; side: number } | null = null;

  constructor(readonly opts: MatchOptions) {
    this.halfLength = opts.half * 60;
    const [hk, ak] = kitsFor(opts.home, opts.away);
    const make = (index: 0 | 1, team: Team, kit: Kit, level: AiLevel): Side => {
      const side = { index, dir: index === 0 ? 1 : -1, team, kit, players: [] as Player[], score: 0, level, extraPress: false } as unknown as Side;
      side.brain = new TeamBrain(this, side);
      return side;
    };
    this.sides = [make(0, opts.home, hk, teammateLevel(opts.difficulty)), make(1, opts.away, ak, AI_LEVELS[opts.difficulty])];
    for (const side of this.sides) {
      if (opts.training && side.index === 1) continue;
      FORMATION.forEach(([, , role], slot) => {
        const p = new Player(side.team, side, role, slot, NUMBERS[slot], role === 'gk' ? side.team.keeper : side.kit);
        p.speedMul = side.level.speed * PACE[slot];
        side.players.push(p);
        this.players.push(p);
        this.group.add(p.rig.root);
      });
    }
    this.group.add(this.ball.mesh, this.ball.shadow, this.ball.trail);
    if (!opts.training) this.group.add(this.referee.root);
    this.kickoff(0);
  }

  get training() {
    return !!this.opts.training;
  }

  get you() {
    return this.sides[0];
  }

  /** Football minutes on the clock (0-90). */
  get minute() {
    if (this.training) return 0;
    return Math.min(45, (this.clock / this.halfLength) * 45) + (this.half - 1) * 45;
  }

  other(side: SideRef) {
    return this.sides[1 - side.index];
  }

  /** The goal a side attacks (x of its line). */
  goalX(side: SideRef) {
    return side.dir * L;
  }

  private emit(e: MatchEvent) {
    this.events.push(e);
  }

  // ---------- setting up ----------

  /** Where a player stands in the formation (attack-relative numbers turned into the pitch). */
  formationSpot(p: Player, kickoff = false) {
    const [fx, fz] = FORMATION[p.slot];
    let x = fx * L, z = fz * W * 0.8;
    if (kickoff) x = Math.min(-1.2, fx * L * 0.85);
    return { x: x * p.side.dir, z };
  }

  /** Everyone back in their half, the ball on the spot. */
  kickoff(sideIndex: number) {
    const side = this.sides[sideIndex];
    this.ball.place(0, 0);
    this.ball.lastTouch = null;
    this.orders.clear();
    this.pass = null;
    this.penalty = null;
    this.offside = null;
    this.wall.clear();
    this.referee.place(-2.5, -4);
    for (const p of this.players) {
      const s = this.formationSpot(p, true);
      // Keep out of the centre circle unless you're kicking off.
      if (p.side !== side && Math.hypot(s.x, s.z) < PITCH.circle + 0.5) s.x = -p.side.dir * (PITCH.circle + 0.8);
      p.teleport(s.x, s.z, p.side.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    const taker = side.players.find((p) => p.role === 'fwd') ?? side.players[0];
    if (taker) {
      taker.teleport(-side.dir * 0.45, 0, side.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.restart = { kind: 'kickoff', side, x: 0, z: 0, taker, ready: true, t: 0 };
      this.ball.owner = taker;
      this.ball.lastTouch = taker;
    } else {
      this.restart = null;
    }
    this.setPhase('kickoff');
    if (side.index === 0 && taker) this.setHuman(taker);
    else this.setHuman(this.nearestOf(this.you, 0, 0));
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  setHuman(p: Player | null) {
    if (this.human === p) return;
    this.human?.rig.setMarker(null);
    this.human = p;
    if (p) {
      p.rig.setMarker(0xffe23a);
      // Let go of anything the brain had them doing.
      this.orders.delete(p);
    }
  }

  nearestOf(side: Side, x: number, z: number, skipKeeper = true, except?: Player | null) {
    let best: Player | null = null, bd = Infinity;
    for (const p of side.players) {
      if ((skipKeeper && p.role === 'gk') || p === except) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---------- the main update ----------

  update(dt: number, input: PadInput) {
    this.events.length = 0;
    this.time += dt;
    this.phaseT += dt;
    this.switchLock = Math.max(0, this.switchLock - dt);
    if (!this.training && (this.phase === 'play' || this.phase === 'out' || this.phase === 'restart')) {
      this.clock += dt;
      if (this.clock >= this.halfLength && this.phase !== 'out') this.endHalf();
    }

    const inp = this.autopilot ? NO_INPUT : input;
    // Brains decide, then you.
    for (const side of this.sides) if (side.players.length) side.brain.update(dt);
    if (!this.autopilot) this.humanControls(inp, dt);
    else this.charge = null;

    this.walkOff();
    for (const p of this.players) p.update(dt, this.ball.owner === p);
    if (!this.training) this.referee.update(dt, this.time, this.ball.pos.x, this.ball.pos.z);
    if (this.cardHoot && this.time > this.cardHoot) { this.cardHoot = 0; this.emit({ kind: 'voice', who: this.referee.p, mood: 'card' }); }
    this.separate();
    this.phaseLogic(dt);
    this.runOrders();
    this.ballPlay(dt);
    for (const e of this.ball.step(dt)) this.ballEvent(e);
    if (this.pass && (this.time - this.pass.t > 3 || this.ball.owner || this.ball.holder)) this.pass = null;
  }

  /** Bump players apart so nobody overlaps. */
  private separate() {
    const ps = this.players;
    const min = PLAYER.radius * 2;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (a.state === 'dive' || b.state === 'dive' || a.state === 'down' || b.state === 'down') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          // Whoever has the ball holds their ground a little better.
          const ka = this.ball.owner === a ? 0.3 : this.ball.owner === b ? 1.7 : 1;
          a.x -= (dx / d) * push * ka;
          a.z -= (dz / d) * push * ka;
          b.x += (dx / d) * push * (2 - ka);
          b.z += (dz / d) * push * (2 - ka);
        }
      }
    }
    for (const p of ps) {
      p.x = Math.max(-L - 4, Math.min(L + 4, p.x));
      p.z = Math.max(-W - 2.5, Math.min(W + 2.5, p.z));
    }
  }

  // ---------- you ----------

  private humanControls(input: PadInput, dt: number) {
    const side = this.you;
    if (!side.players.length) return;
    const b = this.ball;
    // Pick who you control: whoever gets the ball, or the nearest to it when you're defending.
    if (b.owner && b.owner.side === side && b.owner !== this.human) this.setHuman(b.owner);
    else if (b.holder && b.holder.side === side && b.holder !== this.human) this.setHuman(b.holder);
    else if (this.pass && this.pass.to.side === side && this.pass.from.side === side && this.human !== this.pass.to && this.pass.from === this.human) this.setHuman(this.pass.to);
    else if (!this.restart && this.switchLock <= 0 && this.time - this.lastAutoSwitch > 0.6 && !(b.owner && b.owner === this.human)) {
      const target = b.owner ?? b.holder ? b.pos : b.predict(0.4);
      const best = this.nearestOf(side, target.x, target.z);
      const cur = this.human;
      if (best && best !== cur && (!cur || cur.role === 'gk' || Math.hypot(cur.x - target.x, cur.z - target.z) - Math.hypot(best.x - target.x, best.z - target.z) > 2.5)) {
        this.setHuman(best);
        this.lastAutoSwitch = this.time;
      }
    }
    if (input.b.switch.pressed) {
      const at = b.pos;
      const next = this.nearestOf(side, at.x, at.z, true, this.human);
      if (next) { this.setHuman(next); this.switchLock = 1.5; }
    }
    const h = this.human;
    if (!h) return;
    // Walking to take a restart: the game does that for you.
    if (this.restart && !this.restart.ready && this.restart.taker === h) return;

    const mx = input.moveX, mz = input.moveZ;
    const pen = this.penalty;
    // Facing a penalty in goal: stay on the line; hold the stick where you'll dive (screen left/right,
    // up for high, nothing to stay put). The camera's behind the taker, so screen right is along
    // +z for a taker shooting toward +x.
    if (pen && pen.keeper === h && !pen.kickedAt) {
      h.mx = h.mz = 0;
      this.keeperGuess = { z: Math.abs(mx) > 0.4 ? Math.sign(mx) * pen.side.dir : 0, high: -mz > 0.4 };
      this.charge = null;
      return;
    }
    const hasAim = Math.hypot(mx, mz) > 0.3;
    this.humanAim = hasAim ? [mx / Math.hypot(mx, mz), mz / Math.hypot(mx, mz)] : null;
    // During restarts the taker stands still and aims.
    const taking = this.restart?.ready && this.restart.taker === h;
    h.mx = taking ? 0 : mx;
    h.mz = taking ? 0 : mz;
    h.sprint = input.b.sprint.down;
    if (taking && hasAim && !pen) h.faceNow(Math.atan2(mx, mz), 4 * dt);
    // A pass on its way to you: if you're not steering, go and meet it (push the stick to take over).
    if (!taking && !hasAim && this.pass?.to === h && !b.owner && !b.holder && this.phase === 'play') side.brain.meet(h);

    const theirs = (b.owner && b.owner.side !== side) || (b.holder && b.holder.side !== side);
    const aimX = hasAim ? mx : h.fx, aimZ = hasAim ? mz : h.fz;
    const fire = (kind: KickKind, held: number) => {
      const power = Math.min(1, held / KICK.charge);
      if (pen && pen.taker === h && !pen.kickedAt) {
        // Your penalty: the stick picks the spot (screen left/right, up = high, down = low).
        const goalZ = Math.abs(mx) > 0.3 ? Math.sign(mx) * pen.side.dir * (GW - 0.5) : 0;
        const goalY = -mz > 0.4 ? 1.3 : mz > 0.4 ? 0.25 : 0.6;
        this.orders.set(h, { kind: 'shot', power, aimX: pen.side.dir, aimZ: 0, goalZ, goalY, curl: 0, until: this.time + 0.7 });
        return;
      }
      this.orders.set(h, { kind, power, aimX, aimZ, until: this.time + 0.7 });
    };

    // Charging (show the power bar while a kick button is held).
    const held = (['pass', 'shoot', 'lob', 'through'] as const).find((k) => input.b[k].down);
    this.charge = held && !theirs ? { power: Math.min(1, input.b[held].held / KICK.charge) } : null;

    if (h.state === 'hold' && b.holder === h) {
      // Throw-in: any button throws (lob throws long).
      if (this.restart?.kind === 'throw') {
        const btn = (['pass', 'lob', 'shoot', 'through'] as const).find((k) => input.b[k].released);
        if (btn) this.keeperRelease(h, 'throw', aimX, aimZ, btn === 'pass' ? Math.min(1, input.b.pass.held / KICK.charge) * 0.6 : 1);
        return;
      }
      // Keeper with the ball: throw it or kick it out.
      if (input.b.pass.released) this.keeperRelease(h, 'throw', aimX, aimZ, Math.min(1, input.b.pass.held / KICK.charge));
      else if (input.b.shoot.released || input.b.lob.released) this.keeperRelease(h, 'punt', aimX, aimZ, Math.min(1, Math.max(input.b.shoot.held, input.b.lob.held) / KICK.charge));
      return;
    }
    if (theirs) {
      side.extraPress = input.b.shoot.down;
      if (input.b.pass.pressed) this.tackle(h);
      else if (input.b.lob.pressed) this.slide(h);
      return;
    }
    side.extraPress = false;
    // Kicks go off when the button comes up (power = how long it was held).
    if (input.b.pass.released) fire('pass', input.b.pass.held);
    else if (input.b.shoot.released) fire('shot', input.b.shoot.held);
    else if (input.b.lob.released) fire('lob', input.b.lob.held);
    else if (input.b.through.released) fire('through', input.b.through.held);
  }

  // ---------- kicking ----------

  /** Can this player kick the ball right now? (feet, or head if it's up high) */
  private reach(p: Player): 'foot' | 'head' | null {
    const b = this.ball;
    if (b.holder || !p.active) return null;
    const dx = b.pos.x - p.x, dz = b.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (b.pos.y < 0.9 && d < PLAYER.reach) return 'foot';
    if (b.pos.y >= PLAYER.headLow && b.pos.y < PLAYER.headHigh && d < 0.6) return 'head';
    return null;
  }

  private runOrders() {
    // Kicks being wound up: the ball goes when the foot gets there (if it's still there).
    for (const p of this.players) {
      if (!p.windup || p.state !== 'kick' || p.stateT < p.kickContact) continue;
      const o = p.windup as Order;
      p.windup = null;
      if (this.reach(p) === 'foot' && (!this.ball.owner || this.ball.owner === p)) this.doKick(p, o, false);
    }
    for (const [p, o] of this.orders) {
      if (this.time > o.until) { this.orders.delete(p); continue; }
      if (this.phase !== 'play' && !(this.restart?.ready && this.restart.taker === p)) continue;
      if (p.windup) continue;
      const how = this.reach(p);
      if (!how) continue;
      // Only the ball's owner (or nobody) can kick it: no kicking it off someone's feet.
      if (this.ball.owner && this.ball.owner !== p) continue;
      this.orders.delete(p);
      if (how === 'head') { this.doKick(p, o, true); continue; }
      // Wind up first: bigger kicks take a longer back-lift; a ball flying past gets hit quicker.
      const style = o.kind === 'pass' || o.kind === 'through' ? 'pass' : o.kind === 'lob' || o.kind === 'clear' ? 'lob' : 'shot';
      let contact = style === 'pass' ? 0.08 + o.power * 0.06 : style === 'lob' ? 0.12 + o.power * 0.05 : 0.11 + o.power * 0.09;
      if (this.ball.owner !== p && this.ball.speed > 3) contact *= 0.55;
      p.setState('kick');
      p.kickContact = contact;
      p.kickPower = o.power;
      p.kickStyle = style;
      p.windup = o;
      // Turn toward the kick while winding up.
      const aim = o.target ? Math.atan2(o.target.x - p.x, o.target.z - p.z) : o.kind === 'shot' ? Math.atan2(this.goalX(p.side as Side) - p.x, (o.goalZ ?? 0) - p.z) : Math.atan2(o.aimX, o.aimZ);
      p.faceNow(aim, 0.6);
    }
  }

  /** The teammate best placed in a direction (for passes), or null if nobody's that way. */
  pickTarget(p: Player, ax: number, az: number, maxAngle = 0.7) {
    const al = Math.hypot(ax, az) || 1;
    let best: Player | null = null, bs = Infinity;
    for (const t of (p.side as Side).players) {
      if (t === p) continue;
      const dx = t.x - p.x, dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * ax + dz * az) / (d * al))));
      if (ang > maxAngle) continue;
      // (Through balls look for someone already running forward.)
      const running = maxAngle > 0.8 && (t.vx * (p.side as Side).dir) > 2.5 ? 0.6 : 0;
      const s = ang * 2.2 + d / 25 + (t.role === 'gk' ? 1 : 0) - running;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  doKick(p: Player, o: Order, header: boolean) {
    const b = this.ball, side = p.side as Side;
    if (b.owner !== p && this.touched(p)) return;
    const from = b.pos.clone();
    const err = (p === this.human ? 0.025 : side.level.passError) * (0.6 + o.power);
    let vel: THREE.Vector3;
    let spin: THREE.Vector3 | undefined;
    let target = o.target ?? null;
    const al = Math.hypot(o.aimX, o.aimZ) || 1;
    const ax = o.aimX / al, az = o.aimZ / al;
    switch (o.kind) {
      case 'pass':
      case 'through': {
        if (target === null && o.spotX === undefined) target = this.pickTarget(p, ax, az, o.kind === 'through' ? 0.9 : 0.7);
        let tx: number, tz: number, arrive = 4 + o.power * 5.5;
        if (o.spotX !== undefined) { tx = o.spotX; tz = o.spotZ!; }
        else if (target) {
          const d = Math.hypot(target.x - p.x, target.z - p.z);
          const lead = d / 11;
          tx = target.x + target.vx * lead;
          tz = target.z + target.vz * lead;
          if (o.kind === 'through') {
            // Into the space in front of them, toward goal.
            const run = 4 + o.power * 7;
            const gx = this.goalX(side);
            const dirx = Math.sign(gx - target.x) * 0.85, dirz = (-target.z / W) * 0.3 + Math.sign(target.vz) * 0.2;
            const dl = Math.hypot(dirx, dirz);
            tx = target.x + (dirx / dl) * run;
            tz = target.z + (dirz / dl) * run;
            arrive = 1.5;
          }
        } else {
          // Nobody there: just knock it that way.
          const d = 6 + o.power * 18;
          tx = p.x + ax * d;
          tz = p.z + az * d;
        }
        const d = Math.hypot(tx - from.x, tz - from.z);
        const sp = Math.max(KICK.pass[0], Math.min(KICK.pass[1], rollSpeed(d, arrive)));
        // A little bend on it (mostly the inside of the foot); short ones hardly at all.
        const curl = header ? 0 : (Math.random() < 0.7 ? 1 : -1) * (0.15 + Math.random() * 0.3) * Math.min(1, d / 12);
        const c = curled(from, groundKick(from.x, from.z, tx, tz, sp), curl, tx, tz);
        vel = wobble(c.vel, err);
        spin = c.spin;
        if (header) { vel.multiplyScalar(0.7); vel.y = 2; }
        if (target) this.pass = { from: p, to: target, t: this.time };
        break;
      }
      case 'lob': {
        if (target === null && o.spotX === undefined) target = this.pickTarget(p, ax, az, 0.6);
        let tx: number, tz: number;
        if (o.spotX !== undefined) { tx = o.spotX; tz = o.spotZ!; }
        else if (target) {
          const d = Math.hypot(target.x - p.x, target.z - p.z);
          const tt = loftTime(d);
          tx = target.x + target.vx * tt;
          tz = target.z + target.vz * tt;
        } else {
          const d = 10 + o.power * 22;
          tx = p.x + ax * d;
          tz = p.z + az * d;
        }
        const d = Math.hypot(tx - from.x, tz - from.z);
        // Lofted balls and crosses whip round in the air.
        const curl = (Math.random() < 0.6 ? 1 : -1) * (0.4 + Math.random() * 0.45) * Math.min(1, d / 10);
        const c = curled(from, loftCapped(from, tx, tz, loftTime(d), KICK.lob[1]), curl, tx, tz, true);
        vel = wobble(c.vel, err * 1.3);
        spin = c.spin;
        if (target) this.pass = { from: p, to: target, t: this.time };
        break;
      }
      case 'shot': {
        const gx = this.goalX(side);
        // Where in the goal: the stick picks a side (up = far post from the camera), or the far post by default.
        let tz = o.goalZ ?? (Math.abs(o.aimZ) > 0.25 ? Math.sign(o.aimZ) * (GW - 0.5) : -Math.sign(p.z || 1) * (GW - 0.6));
        tz = Math.max(-GW + 0.2, Math.min(GW - 0.2, tz));
        let ty = o.goalY ?? 0.25 + o.power * 0.95;
        // Too much power sends it over.
        if (o.power > 0.9) ty += (o.power - 0.9) * 14;
        const speed = KICK.shot[0] + o.power * (KICK.shot[1] - KICK.shot[0]);
        const dist = Math.hypot(gx - from.x, tz - from.z);
        // Harder, longer and off-balance shots are less accurate.
        const facing = Math.abs(Math.atan2(Math.sin(Math.atan2(gx - p.x, tz - p.z) - p.yaw), Math.cos(Math.atan2(gx - p.x, tz - p.z) - p.yaw)));
        let sd = (p === this.human ? 0.018 : side.level.shotError) + o.power * o.power * 0.035 + dist * 0.0012 + facing * 0.03;
        // A penalty: no one's rushing you, so it's much tidier.
        if (this.penalty?.taker === p && !this.penalty.kickedAt) sd *= 0.35;
        // Placed shots start toward the middle and bend away from the keeper into the corner (the
        // keeper reads the line it starts on); power shots barely curl. The computer picks its own.
        const away = -Math.sign(tz || Math.random() - 0.5) * Math.sign(gx - from.x);
        const curl = header ? 0 : o.curl ?? away * (o.power > 0.8 ? 0.15 : 0.45 + (0.8 - o.power) * 0.5);
        const s = curled(from, shot(from, gx, ty, tz, speed).vel, curl, gx, tz);
        vel = wobble(s.vel, sd, sd * 4);
        spin = s.spin;
        if (header) { vel.multiplyScalar(0.55); vel.y = Math.min(vel.y, 1); }
        this.lastShot = { t: this.time, side: side.index };
        break;
      }
      case 'clear': {
        const gx = this.goalX(side);
        const tx = gx * 0.4, tz = Math.sign(p.z || 1) * W * 0.6;
        const d = Math.hypot(tx - from.x, tz - from.z);
        const c = curled(from, loftCapped(from, tx, tz, loftTime(d, 1.2), KICK.punt), (Math.random() - 0.5) * 0.6, tx, tz, true);
        vel = wobble(c.vel, 0.15);
        spin = c.spin;
        break;
      }
    }
    // Snap round toward where it's going, and strike.
    p.faceNow(Math.atan2(vel.x, vel.z), 1.2);
    if (header) p.setState('header');
    else if (p.state !== 'kick') {
      // (A kick that skipped the wind-up: show the strike from the contact.)
      p.setState('kick');
      p.kickContact = 0.04;
      p.kickPower = o.power;
      p.kickStyle = o.kind === 'pass' || o.kind === 'through' ? 'pass' : o.kind === 'shot' ? 'shot' : 'lob';
    }
    p.noTouch = 0.3;
    b.kick(p, vel, spin);
    this.lastKick = { side: side.index, t: this.time };
    // Offside counts from passes in open play and free kicks (not throw-ins, corners or goal kicks).
    const restartKind = this.restart?.taker === p ? this.restart.kind : null;
    if (!restartKind || restartKind === 'free' || restartKind === 'kickoff') this.noteOffside(p);
    else this.offside = null;
    if (this.penalty && this.penalty.taker === p && !this.penalty.kickedAt) this.penaltyDive(vel);
    if (this.restart && this.restart.taker === p) this.restartTaken();
    this.emit({ kind: 'kick', power: vel.length(), header });
  }

  /**
   * The penalty's struck: the keeper dives (or stays) at once, a guess: your guess if it's your
   * keeper, otherwise the computer's (right more often the better the keeper is).
   */
  private penaltyDive(vel: THREE.Vector3) {
    const pen = this.penalty!;
    pen.kickedAt = this.time;
    const k = pen.keeper;
    if (!k) return;
    const b = this.ball;
    const t = Math.abs((k.x - b.pos.x) / (vel.x || 1));
    const zl = b.pos.z + vel.z * t, yl = b.pos.y + vel.y * t - 0.5 * BALL.gravity * t * t;
    let gz: number, high: boolean;
    if (k === this.human && !this.autopilot) {
      gz = this.keeperGuess.z;
      high = this.keeperGuess.high;
    } else {
      const skill = (k.side as Side).level.keeper;
      const r = Math.random();
      gz = r < 0.12 ? 0 : (Math.random() < 0.35 + skill * 0.3 ? 1 : -1) * Math.sign(zl || 1);
      high = Math.random() < 0.55 + skill * 0.2 ? yl > 0.9 : yl <= 0.9;
    }
    if (!gz) { k.jump(high ? 2.6 : 0.8); return; }
    const leftZ = -Math.sin(k.yaw);
    k.diveSide = Math.sign(gz * leftZ) || 1;
    k.diveVz = gz * (2.2 + (k.side as Side).level.keeper * 1.6);
    k.diveVx = 0;
    k.diveVy = high ? 3.8 : 1.5;
    k.setState('dive');
    // (So the keeper's brain doesn't also react to it.)
    k.noTouch = 0;
  }

  /** During a penalty, a camera behind the taker looking at the goal (or null). */
  penaltyView() {
    const pen = this.penalty;
    if (!pen) return null;
    if (pen.kickedAt && this.time - pen.kickedAt > 2.2) { this.penalty = null; return null; }
    const dir = pen.side.dir, gx = this.goalX(pen.side), sx = gx - dir * PITCH.spot;
    return { from: [sx - dir * 6, 2.3, 0.6] as const, at: [gx, 0.8, 0] as const };
  }

  /** Keeper throws or kicks the ball out of their hands. */
  keeperRelease(k: Player, how: 'throw' | 'punt', ax: number, az: number, power: number) {
    const b = this.ball;
    b.holder = null;
    const from = new THREE.Vector3(k.x + k.fx * 0.4, how === 'throw' ? 1.0 : 0.5, k.z + k.fz * 0.4);
    b.pos.copy(from);
    const target = this.pickTarget(k, ax, az, how === 'throw' ? 0.8 : 0.5);
    let vel: THREE.Vector3;
    if (how === 'throw') {
      const tx = target ? target.x : k.x + ax * 12, tz = target ? target.z : k.z + az * 12;
      const d = Math.hypot(tx - from.x, tz - from.z);
      // Throw-ins are gentler than a keeper's throw; how hard depends on how long the button was held.
      const throwIn = this.restart?.kind === 'throw';
      const top = throwIn ? KICK.throwIn[0] + power * (KICK.throwIn[1] - KICK.throwIn[0]) : KICK.keeperThrow;
      vel = loftCapped(from, tx, tz, Math.max(0.7, 0.5 + d * 0.05), top);
      k.setState('throw');
      k.stateT = 0.3;
    } else {
      const d = 22 + power * 14;
      const tx = target ? target.x : k.x + ax * d, tz = target ? target.z : k.z + az * d;
      const dd = Math.hypot(tx - from.x, tz - from.z);
      vel = wobble(loftCapped(from, tx, tz, loftTime(dd, 1.25), KICK.punt), 0.08);
      k.setState('kick');
    }
    if (target) this.pass = { from: k, to: target, t: this.time };
    k.noTouch = 0.5;
    b.kick(k, vel);
    this.lastKick = { side: k.side.index, t: this.time };
    if (this.restart?.kind === 'throw' && this.restart.taker === k) this.offside = null;
    else this.noteOffside(k);
    if (this.restart?.taker === k) this.restartTaken();
    this.emit({ kind: 'kick', power: vel.length(), header: false });
  }

  // ---------- tackles ----------

  tackle(p: Player) {
    if (p.state !== 'free') return;
    p.setState('tackle');
    const o = this.ball.owner;
    if (o) p.faceNow(Math.atan2(o.x + o.fx * 0.4 - p.x, o.z + o.fz * 0.4 - p.z), 0.8);
  }

  slide(p: Player) {
    if (p.state !== 'free' || p.speed < 2) return;
    const b = this.ball;
    p.faceNow(Math.atan2(b.pos.x - p.x, b.pos.z - p.z), 0.6);
    p.setState('slide');
  }

  /**
   * Tackles and slides: feet meeting the ball (win it, or not), or meeting a player instead (a
   * foul). Each tackle is judged once. Going through the dribbler's body, sliding in from behind,
   * or catching someone who's just passed it are fouls; a clean tackle at the right moment isn't.
   */
  private tackles() {
    const b = this.ball;
    if (this.phase !== 'play' || b.holder) return;
    for (const p of this.players) {
      const tackling = p.state === 'tackle' && p.stateT > 0.04 && p.stateT < 0.32;
      const sliding = p.state === 'slide' && p.stateT > 0.04 && p.stateT < 0.65;
      if (!tackling && !sliding) { if (p.state !== 'tackle' && p.state !== 'slide') this.judged.delete(p); continue; }
      if (this.judged.has(p)) continue;
      const reach = sliding ? 0.75 : 0.62;
      const fx = p.x + p.fx * reach * 0.8, fz = p.z + p.fz * reach * 0.8;
      const owner = b.owner;
      if (owner === p) continue;
      const onBall = b.pos.y < 0.5 && Math.hypot(b.pos.x - fx, b.pos.z - fz) <= (sliding ? 0.55 : 0.5);
      // Someone in the way of the tackle (the dribbler, or whoever just played it).
      let victim: Player | null = null;
      for (const q of this.players) {
        if (q.side === p.side || q.state === 'down' || q.state === 'dive') continue;
        if (Math.hypot(q.x - (p.x + p.fx * 0.35), q.z - (p.z + p.fz * 0.35)) < 0.55) { victim = q; break; }
      }
      // Missing the ball and hitting the player is only decided once the tackle's done.
      const ending = tackling ? p.stateT > 0.27 : p.stateT > 0.6;
      if (!onBall && !(victim && ending)) continue;
      this.judged.add(p);
      const vb = victim ?? owner;
      const behind = !!vb && vb.fx * p.fx + vb.fz * p.fz > 0.4;

      if (!onBall) {
        // Missed the ball, got the player.
        if (victim === owner) {
          if (Math.random() < (sliding ? 0.85 : behind ? 0.6 : 0.4)) this.foul(p, victim!, sliding ? 'slide' : 'tackle', behind);
        } else if (victim && victim.state === 'kick' || (victim && victim.noTouch > 0 && this.ball.lastTouch === victim)) {
          if (Math.random() < 0.6) this.foul(p, victim!, 'late', behind);
        }
        continue;
      }
      if (this.touched(p)) return;
      let won = true, shielded = false;
      if (owner && tackling) {
        // Timing and angle: going through the dribbler's body (they're shielding it) rarely works;
        // nicking it just after a touch has pushed it out in front is the moment.
        const obx = b.pos.x - owner.x, obz = b.pos.z - owner.z;
        shielded = obx * (p.x - owner.x) + obz * (p.z - owner.z) < 0;
        const out = Math.hypot(obx, obz);
        let chance = shielded ? 0.12 : Math.max(0.25, Math.min(0.9, 0.3 + (out - 0.4) * 2));
        if (behind && !shielded) chance *= 0.7;
        won = Math.random() < chance;
      }
      if (!won) {
        // Went through the man: often a foul, otherwise they bounce off.
        if (owner && Math.random() < (shielded ? 0.5 : behind ? 0.3 : 0.08)) { this.foul(p, owner, 'tackle', behind || shielded); return; }
        this.emit({ kind: 'tackle', won: false });
        p.setState('stunned');
        continue;
      }
      // Won the ball... but a slide from behind takes the player too.
      if (owner && sliding && behind && Math.random() < 0.55) { this.foul(p, owner, 'slide', true); return; }
      const sp = sliding ? 5 + Math.random() * 3 : 3 + Math.random() * 2.5;
      const side = (Math.random() - 0.5) * 2;
      b.kick(p, new THREE.Vector3(p.fx * sp - p.fz * side, 0.4, p.fz * sp + p.fx * side));
      p.noTouch = 0.15;
      if (owner) {
        owner.setState(sliding ? 'down' : 'stunned');
        owner.noTouch = 0.6;
        if (sliding && Math.random() < 0.6) this.emit({ kind: 'voice', who: owner, mood: 'ouch' });
      }
      p.cheer = 1.2;
      this.emit({ kind: 'tackle', won: true });
    }
  }

  // ---------- fouls, cards, offside ----------

  /** A foul by `by` on `on`: whistle, maybe a card, and a free kick (or a penalty). */
  private foul(by: Player, on: Player, how: 'tackle' | 'slide' | 'late', behind: boolean) {
    if (this.phase !== 'play' || this.training) return;
    const bySide = by.side as Side, to = this.other(bySide);
    const b = this.ball;
    b.owner = null;
    b.dead = true;
    this.orders.clear();
    this.pass = null;
    this.offside = null;
    on.setState('down');
    on.noTouch = 1;
    this.emit({ kind: 'voice', who: on, mood: 'ouch' });
    const x = Math.max(-L + 0.6, Math.min(L - 0.6, on.x)), z = Math.max(-W + 0.6, Math.min(W - 0.6, on.z));
    // In the offender's own penalty area: a penalty.
    const own = -bySide.dir * L;
    const inBox = Math.abs(x - own) < PITCH.boxDepth && Math.abs(z) < PITCH.boxWidth / 2;
    // How bad: slides from behind are the worst; stopping a clear run at goal is worse still.
    const towardGoal = -bySide.dir;
    const clear = on.x * towardGoal > L - 15 && !bySide.players.some((q) => q !== by && q.role !== 'gk' && q.x * towardGoal > on.x * towardGoal);
    let card = 0;
    const roll = Math.random();
    if (how === 'slide') card = roll < (behind ? 0.5 : 0.15) ? 1 : 0;
    else if (how === 'late') card = roll < 0.3 ? 1 : 0;
    else card = roll < (behind ? 0.1 : 0.02) ? 1 : 0;
    if (clear && behind && how === 'slide' && Math.random() < 0.5) card = 2;
    if (card === 1 && (this.yellows.get(by) ?? 0) >= 1) card = 2;
    if (by.role === 'gk' && card === 2) card = 1;
    this.emit({ kind: 'whistle', long: 0 });
    this.emit({ kind: 'foul', penalty: inBox });
    const who = `#${by.number} · ${bySide.team.name}`;
    if (card) {
      if (card === 1) this.yellows.set(by, (this.yellows.get(by) ?? 0) + 1);
      this.referee.card(by, card === 2 ? 0xe02020 : 0xf6d21e, this.time);
      this.emit({ kind: 'card', player: by, red: card === 2 });
      this.cardHoot = this.time + 1.2;
      const second = card === 2 && (this.yellows.get(by) ?? 0) >= 1;
      this.emit({ kind: 'banner', text: inBox ? 'PENALTY!' : card === 2 ? 'RED CARD!' : 'YELLOW CARD', sub: `${card === 2 ? (second ? 'Second yellow: off you go, ' : 'Sent off: ') : inBox ? 'Yellow card for ' : 'Foul by '}${who}`, time: 2.4, color: card === 2 ? '#ff5040' : undefined });
      if (card === 2) this.sendOff(by);
    } else {
      this.emit({ kind: 'banner', text: inBox ? 'PENALTY!' : 'FOUL!', sub: who, time: 1.5 });
    }
    if (inBox) this.referee.point(own + bySide.dir * PITCH.spot, 0, this.time + 0.3);
    this.pendingRestart = inBox
      ? { kind: 'penalty', sideIdx: to.index, x: own + bySide.dir * PITCH.spot, z: 0 }
      : { kind: 'free', sideIdx: to.index, x, z };
    this.outDelay = card ? 2.9 : 1.4;
    this.setPhase('out');
  }

  /** Off they go: out of the team at once, and walking off the pitch. */
  private sendOff(p: Player) {
    const side = p.side as Side;
    side.players = side.players.filter((q) => q !== p);
    this.sentOff.push(p);
    this.orders.delete(p);
    this.wall.delete(p);
    if (this.human === p) this.setHuman(this.nearestOf(side, p.x, p.z));
  }

  /** Sent-off players trudge to the near touchline and disappear. */
  private walkOff() {
    for (const p of this.sentOff) {
      if (!this.players.includes(p)) continue;
      if (p.state !== 'free' && p.state !== 'down') p.setState('free');
      p.mx = 0;
      p.mz = 0.55;
      p.sprint = false;
      if (p.z > W + 2.4) {
        this.players.splice(this.players.indexOf(p), 1);
        p.rig.root.removeFromParent();
      }
    }
  }

  /** Cards so far for one side (for the scoreboard). */
  cardsFor(side: Side) {
    let yellow = 0, red = 0;
    for (const [p, n] of this.yellows) if (p.side === side) yellow += n;
    for (const p of this.sentOff) if (p.side === side) red++;
    return { yellow, red };
  }

  /**
   * As someone plays the ball, note which of their teammates are offside: in the other half,
   * ahead of the ball and clearly past the second-last defender (only clear ones, so it's rare).
   */
  private noteOffside(by: Player) {
    const side = by.side as Side, dir = side.dir, opp = this.other(side);
    this.offside = null;
    if (!opp.players.length) return;
    const xs = opp.players.map((q) => q.x * dir).sort((a, b) => b - a);
    const line = Math.max(xs[1] ?? L, this.ball.pos.x * dir, 0);
    const flagged = new Set<Player>();
    for (const q of side.players) if (q !== by && q.x * dir > line + 0.6) flagged.add(q);
    if (flagged.size) this.offside = { side: side.index, flagged };
  }

  /**
   * Someone's touched the ball. An offside player getting involved is offside (returns true and
   * stops play); anyone else's touch clears it.
   */
  private touched(p: Player) {
    if (this.indirectBy && p !== this.indirectBy) this.indirectBy = null;
    const o = this.offside;
    if (!o) return false;
    if (p.side.index === o.side && o.flagged.has(p) && this.phase === 'play' && !this.training) {
      const b = this.ball;
      b.owner = null;
      b.dead = true;
      this.orders.clear();
      this.pass = null;
      this.offside = null;
      this.emit({ kind: 'whistle', long: 0 });
      this.emit({ kind: 'offside' });
      const to = this.other(p.side as Side);
      this.emit({ kind: 'banner', text: 'OFFSIDE', sub: `#${p.number} · ${(p.side as Side).team.name}`, time: 1.5 });
      this.pendingRestart = { kind: 'free', sideIdx: to.index, x: Math.max(-L + 1, Math.min(L - 1, p.x)), z: Math.max(-W + 1, Math.min(W - 1, p.z)), indirect: true };
      this.outDelay = 1.3;
      this.setPhase('out');
      return true;
    }
    this.offside = null;
    return false;
  }

  // ---------- the ball between players ----------

  private ballPlay(dt: number) {
    const b = this.ball;
    if (b.holder) {
      // In the keeper's (or thrower's) hands.
      const k = b.holder;
      const hand = new THREE.Vector3();
      k.rig.root.updateMatrixWorld(true);
      k.rig.handL.getWorldPosition(hand);
      const hr = new THREE.Vector3();
      k.rig.handR.getWorldPosition(hr);
      hand.add(hr).multiplyScalar(0.5);
      if (k.state === 'hold') hand.addScaledVector(new THREE.Vector3(k.fx, 0, k.fz), 0.12);
      b.pos.copy(hand);
      b.vel.set(0, 0, 0);
      return;
    }
    if (this.phase === 'goal' || this.phase === 'halftime' || this.phase === 'fulltime') return;
    if (b.dead && this.phase !== 'restart') return;
    this.tackles();
    if (this.phase === 'play') this.keepers();
    if (b.holder) return;

    // The owner keeps it, unless they've been knocked off it or it got away.
    const o = b.owner;
    if (o && (!o.active || Math.hypot(b.pos.x - o.x, b.pos.z - o.z) > PLAYER.keep || b.pos.y > 1.4)) b.owner = null;

    // Pushed a bit ahead: an opponent whose foot is closer to it can nick it.
    if (b.owner && Math.hypot(b.pos.x - b.owner.x, b.pos.z - b.owner.z) > 0.55) {
      const ow = b.owner;
      const od = Math.hypot(b.pos.x - ow.x - ow.fx * 0.32, b.pos.z - ow.z - ow.fz * 0.32);
      for (const p of this.players) {
        if (p.side === ow.side || !p.active || p.role === 'gk') continue;
        const d = Math.hypot(b.pos.x - p.x - p.fx * 0.32, b.pos.z - p.z - p.fz * 0.32);
        if (d < PLAYER.control && d < od) { b.owner = null; break; }
      }
    }
    if (!b.owner && this.phase !== 'kickoff' && !(this.restart && !this.restart.ready)) this.receive();
    if (b.owner) this.dribble(b.owner, dt);
    else this.bodyBlocks();
  }

  /**
   * A loose ball coming to someone: they put a foot out as it arrives and cushion it (along the
   * ground), or take it down on the thigh or chest (in the air), then it's theirs.
   */
  private receive() {
    const b = this.ball;
    let best: Player | null = null, bd = Infinity, how: 'foot' | 'body' = 'foot';
    for (const p of this.players) {
      if (!p.active || p.state === 'tackle' || p.state === 'slide' || p.state === 'kick') continue;
      // Distance from the body (the legs reach round to any side, a bit further in front).
      const bx = b.pos.x - p.x, bz = b.pos.z - p.z;
      const dc = Math.hypot(bx, bz) || 1e-6;
      const front = (bx * p.fx + bz * p.fz) / dc;
      const d = dc - 0.22 - 0.1 * Math.max(0, front);
      const rvx = b.vel.x - p.vx, rvz = b.vel.z - p.vz;
      const closing = -(bx * rvx + bz * rvz) / dc;
      // Coming this way: stand and face it, and reach a foot out just as it arrives.
      if (b.pos.y < 1.3 && dc < 3 && closing > 1.5) {
        if (p.speed < 1.2 && p !== b.lastTouch) p.faceYaw = Math.atan2(bx, bz);
        if (b.pos.y < 0.6 && p.touchT > 0.35 && d / closing < 0.12) { p.touchT = 0; p.touchFoot = -1; }
      }
      if (b.pos.y < 0.6 && d < PLAYER.control && d < bd) { bd = d; best = p; how = 'foot'; }
      else if (b.pos.y >= 0.6 && b.pos.y < 1.3 && b.vel.y < 1.5 && p.role !== 'gk') {
        const db = Math.hypot(b.pos.x - p.x - p.fx * 0.15, b.pos.z - p.z - p.fz * 0.15);
        if (db < 0.42 && db < bd) { bd = db; best = p; how = 'body'; }
      }
    }
    if (!best) return;
    const p = best;
    const rel = Math.hypot(b.vel.x - p.vx, b.vel.z - p.vz);
    if (rel > KICK.takeHard) return;
    if (this.touched(p)) return;
    if (rel > KICK.takeClean) {
      // A hard ball: you always cushion it; computer players sometimes let it bounce off them.
      const clean = p === this.human || Math.random() < 0.55 + (p.side as Side).level.passing * 0.5;
      if (!clean) {
        b.vel.multiplyScalar(0.35);
        b.vel.x += (Math.random() - 0.5) * 3;
        b.vel.z += (Math.random() - 0.5) * 3;
        b.lastTouch = p;
        p.noTouch = 0.25;
        p.touchT = 0;
        this.emit({ kind: 'touch' });
        return;
      }
    }
    // The first touch: kill the pace, steering it a little the way you're pushing the stick (or
    // the way they're running).
    const aim = p === this.human && this.humanAim ? this.humanAim : null;
    const dx = aim ? aim[0] : p.fx, dz = aim ? aim[1] : p.fz;
    const out = Math.min(2.2, 0.6 + rel * 0.12);
    b.vel.x = p.vx + dx * out;
    b.vel.z = p.vz + dz * out;
    if (how === 'body') b.vel.y = -0.5;
    b.spin.set(0, 0, 0);
    // Turn a little to meet it.
    p.faceNow(Math.atan2(b.pos.x - p.x, b.pos.z - p.z), 0.5);
    if (p.touchT > 0.15) { p.touchT = 0.05; p.touchFoot = -1; }
    this.emit({ kind: 'touch' });
    b.owner = p;
    b.lastTouch = p;
    if (this.pass && this.pass.to !== p) this.pass = null;
  }

  /**
   * Dribbling: the ball stays close, in front of the right foot. Running, each stride that foot
   * nudges it a little ahead and the dribbler catches it up (further when sprinting). It never
   * snaps: it moves toward where it should be at a limited speed relative to the player.
   */
  private dribble(o: Player, dt: number) {
    const b = this.ball;
    const sp = o.speed;
    if (b.vel.y > 0.5) b.vel.y = 0.5;
    const running = sp > 1.4 && o.state === 'free';
    // How far through the touch cycle (one touch per stride, as the right foot comes forward).
    const u = (((o.stride - Math.PI * 1.5) / (Math.PI * 2)) % 1 + 1) % 1;
    if (running && u < o.dribbleU) {
      o.touchT = 0;
      o.touchFoot = -1;
      this.emit({ kind: 'touch' });
    }
    o.dribbleU = u;
    const run = Math.min(1, sp / 6);
    const amp = running ? 0.05 + 0.16 * run + (o.sprint ? 0.12 : 0) : 0;
    const lead = 0.3 + 0.025 * sp + amp * Math.sin(Math.PI * u);
    // In front of the right foot (the character's right is -left = (-cos yaw, sin yaw)).
    const tx = o.x + o.fx * lead - Math.cos(o.yaw) * 0.06;
    const tz = o.z + o.fz * lead + Math.sin(o.yaw) * 0.06;
    let rvx = (tx - b.pos.x) * 14, rvz = (tz - b.pos.z) * 14;
    const rl = Math.hypot(rvx, rvz);
    const cap = 4.5;
    if (rl > cap) { rvx *= cap / rl; rvz *= cap / rl; }
    b.vel.x = o.vx + rvx;
    b.vel.z = o.vz + rvz;
    void dt;
  }

  /** A loose ball hitting someone's body bounces off them. */
  private bodyBlocks() {
    const b = this.ball;
    if (b.speed < 4) return;
    for (const p of this.players) {
      if (p.noTouch > 0 || p.state === 'dive' || p.role === 'gk') continue;
      if (b.pos.y - p.y > 1.2) continue;
      const dx = b.pos.x - p.x, dz = b.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.28 + R || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      const vn = b.vel.x * nx + b.vel.z * nz;
      if (vn >= 0) continue;
      b.vel.x -= 1.5 * vn * nx;
      b.vel.z -= 1.5 * vn * nz;
      b.vel.multiplyScalar(0.55);
      b.pos.x = p.x + nx * (0.29 + R);
      b.pos.z = p.z + nz * (0.29 + R);
      if (this.touched(p)) return;
      b.lastTouch = p;
      p.noTouch = 0.2;
    }
  }

  /** Keepers: catching, parrying, picking up a loose ball in their box. */
  private keepers() {
    const b = this.ball;
    for (const side of this.sides) {
      const k = side.players[0];
      if (!k || k.role !== 'gk' || k.noTouch > 0) continue;
      const own = -side.dir * L;
      const inBox = Math.abs(b.pos.x - own) < PITCH.boxDepth + 0.2 && Math.abs(b.pos.z) < PITCH.boxWidth / 2 + 0.2;
      if (!inBox) continue;
      // Not when a teammate passed it back (keepers can't pick those up).
      if (b.lastTouch && b.lastTouch.side === side && b.lastTouch !== k && !b.owner) continue;
      if (b.owner === k) {
        // Dribbling it in their own box: just pick it up.
        this.catch(k);
        continue;
      }
      if (b.owner) continue;
      let hit = false;
      const sp = b.speed;
      if (k.state === 'dive') {
        // Body stretched out to the side they dived.
        const lx = Math.cos(k.yaw) * k.diveSide, lz = -Math.sin(k.yaw) * k.diveSide;
        const hx = k.x, hy = k.y + 0.4, hz = k.z;
        const t = Math.max(-0.15, Math.min(0.7, (b.pos.x - hx) * lx + (b.pos.z - hz) * lz));
        const cx = hx + lx * t, cz = hz + lz * t;
        hit = Math.hypot(b.pos.x - cx, b.pos.y - hy, b.pos.z - cz) < 0.3 + R;
      } else if (k.state === 'free' || k.state === 'kick') {
        const d = Math.hypot(b.pos.x - k.x, b.pos.z - k.z);
        hit = d < 0.42 + R && b.pos.y < 1.75;
        if (!hit && sp < 4 && d < 0.75 && b.pos.y < 0.6) hit = true;
      }
      if (!hit) continue;
      this.touched(k);
      const skill = side.level.keeper;
      const chance = sp < 5 ? 1 : skill * Math.max(0.15, Math.min(1, 1.4 - sp / 17)) + (k.state === 'free' ? 0.15 : 0);
      if (Math.random() < chance) {
        this.catch(k);
        this.emit({ kind: 'save', catch: true });
        if (sp > 8) { k.cheer = 1.5; if (Math.random() < 0.5) this.emit({ kind: 'voice', who: k, mood: 'happy' }); }
      } else if (sp > 12.5 && Math.random() < 0.35) {
        // Got a hand to it, but it's too hard: it squirms on.
        b.vel.multiplyScalar(0.6);
        b.vel.z += (Math.random() - 0.5) * 3;
        b.vel.y += 1;
        b.lastTouch = k;
        k.noTouch = 0.5;
        this.emit({ kind: 'save', catch: false });
      } else {
        // Parried away from the goal.
        const out = side.dir;
        b.vel.set(out * (3 + Math.random() * 4), 1.5 + Math.random() * 2.5, Math.sign(b.pos.z - k.z || 1) * (2 + Math.random() * 4));
        b.lastTouch = k;
        k.noTouch = 0.5;
        this.emit({ kind: 'save', catch: false });
      }
    }
  }

  private catch(k: Player) {
    const b = this.ball;
    b.owner = null;
    b.holder = k;
    b.lastTouch = k;
    b.vel.set(0, 0, 0);
    this.pass = null;
    if (k.state !== 'dive') k.setState('hold');
    k.vx = k.vz = 0;
    if (k.side.index === 0 && !this.autopilot) this.setHuman(k);
  }

  // ---------- rules ----------

  private ballEvent(e: BallEvent) {
    switch (e.kind) {
      case 'bounce':
        if (e.speed > 2) this.emit({ kind: 'bounce', speed: e.speed });
        break;
      case 'post':
        this.emit({ kind: 'post' });
        break;
      case 'net':
        this.emit({ kind: 'net', end: e.end, speed: e.speed });
        break;
      case 'goal': {
        if (this.phase !== 'play') break;
        if (this.indirectBy && this.ball.lastTouch === this.indirectBy) {
          // Straight in from an indirect free kick: doesn't count.
          const defending = this.sides.find((s) => s.dir === -e.end)!;
          this.indirectBy = null;
          this.ball.owner = null;
          this.orders.clear();
          this.emit({ kind: 'whistle', long: 0 });
          this.emit({ kind: 'banner', text: 'NO GOAL', sub: 'Indirect free kick: someone else has to touch it', time: 2 });
          this.pendingRestart = { kind: 'goalkick', sideIdx: defending.index, x: e.end * (L - PITCH.smallDepth + 0.6), z: 1.8 };
          this.outDelay = 2;
          this.setPhase('out');
          break;
        }
        this.penalty = null;
        const side = this.sides.find((s) => s.dir === e.end) ?? this.sides[0];
        const lt = this.ball.lastTouch;
        const ownGoal = !!lt && lt.side !== side;
        side.score++;
        this.goalSide = side.index;
        this.scorer = ownGoal ? null : lt;
        this.ball.owner = null;
        this.orders.clear();
        this.setPhase('goal');
        this.emit({ kind: 'goal', side, scorer: this.scorer, ownGoal });
        this.emit({ kind: 'banner', text: 'GOAL!', sub: ownGoal ? 'Own goal!' : this.scorer ? `#${this.scorer.number} · ${side.team.name}` : side.team.name, time: 3.5 });
        this.startCelebration(side);
        break;
      }
      case 'out': {
        if (this.phase !== 'play') break;
        const lt = this.ball.lastTouch;
        const ltSide = lt ? lt.side.index : 0;
        if (this.lastShot && this.time - this.lastShot.t < 2.5 && e.side === 'goal') this.emit({ kind: 'miss' });
        this.ball.owner = null;
        this.orders.clear();
        this.emit({ kind: 'whistle', long: 0 });
        let kind: RestartKind, sideIdx: number, x: number, z: number;
        if (e.side === 'touch') {
          kind = 'throw';
          sideIdx = 1 - ltSide;
          x = Math.max(-L + 1, Math.min(L - 1, e.x));
          z = e.z;
        } else {
          // Over the goal line: who defends that end?
          const defending = this.sides.find((s) => s.dir === -e.end)!;
          if (defending.index === ltSide) {
            kind = 'corner';
            sideIdx = 1 - defending.index;
            x = e.end * (L - 0.4);
            z = Math.sign(e.z || 1) * (W - 0.4);
          } else {
            kind = 'goalkick';
            sideIdx = defending.index;
            x = e.end * (L - PITCH.smallDepth + 0.6);
            z = Math.sign(e.z || 1) * 1.8;
          }
        }
        // Training: no other team, so it's always ours.
        if (!this.sides[sideIdx].players.length) {
          sideIdx = 0;
          if (kind === 'goalkick' && this.sides[0].dir === e.end) kind = 'corner';
        }
        this.pendingRestart = { kind, sideIdx, x, z };
        this.pass = null;
        this.outDelay = 1;
        this.penalty = null;
        this.setPhase('out');
        const names: Record<RestartKind, string> = { throw: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK', kickoff: 'KICK-OFF', free: 'FREE KICK', penalty: 'PENALTY' };
        this.emit({ kind: 'banner', text: names[kind], sub: this.sides[sideIdx].team.name, time: 1.4 });
        break;
      }
    }
  }

  private pendingRestart: { kind: RestartKind; sideIdx: number; x: number; z: number; indirect?: boolean } | null = null;

  private phaseLogic(dt: number) {
    switch (this.phase) {
      case 'kickoff':
        if (this.phaseT < 0.05 && this.half === 1 && this.you.score + this.other(this.you).score === 0) this.emit({ kind: 'whistle', long: 1 });
        break;
      case 'out':
        // Let the ball roll away for a moment, then set up the restart.
        for (const p of this.players) if (p !== this.human) { p.mx *= 0.5; p.mz *= 0.5; }
        if (this.phaseT > this.outDelay && this.pendingRestart) {
          const r = this.pendingRestart;
          this.pendingRestart = null;
          this.outDelay = 1;
          this.setupRestart(r.kind, this.sides[r.sideIdx], r.x, r.z, r.indirect);
        }
        break;
      case 'restart': {
        const r = this.restart!;
        r.t += dt;
        const spot = this.takerSpot(r);
        const d = Math.hypot(r.taker.x - spot.x, r.taker.z - spot.z);
        if (!r.ready) {
          // Taker walks to the ball (and is moved there if it's taking too long).
          if (d < 0.35 || r.t > 3.5) {
            r.taker.teleport(spot.x, spot.z, spot.yaw);
            r.ready = true;
            r.t = 0;
            if (r.kind === 'throw') {
              this.ball.holder = r.taker;
              r.taker.setState('hold');
              r.taker.overhead = true;
            } else {
              this.ball.place(r.x, r.z);
              this.ball.owner = r.taker;
            }
            this.ball.lastTouch = r.taker;
            if (r.kind === 'free' || r.kind === 'penalty') this.clearSpace(r);
            if (r.side.index === 0 && !this.autopilot) this.setHuman(r.taker);
          }
        }
        break;
      }
      case 'goal':
        this.celebrate();
        if (this.phaseT > 6) {
          // The team that let it in kicks off.
          const kickSide = 1 - this.goalSide;
          this.kickoff(this.sides[kickSide].players.length ? kickSide : 0);
        }
        break;
      case 'halftime':
        for (const p of this.players) { p.mx = p.mz = 0; }
        if (this.phaseT > 3.5) {
          this.half = 2;
          this.clock = 0;
          for (const s of this.sides) s.dir = -s.dir;
          this.kickoff(1 - this.kickoffSide);
          this.emit({ kind: 'banner', text: 'SECOND HALF', time: 1.6 });
          this.emit({ kind: 'whistle', long: 1 });
        }
        break;
      case 'fulltime':
        for (const p of this.players) { p.mx = p.mz = 0; }
        break;
      case 'play':
        break;
    }
  }

  private startCelebration(side: Side) {
    if (!this.celebPack.length) {
      this.celebPack = CELEBRATIONS.filter((c) => c !== this.celebration);
      for (let i = this.celebPack.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.celebPack[i], this.celebPack[j]] = [this.celebPack[j], this.celebPack[i]];
      }
    }
    this.celebration = this.celebPack.pop()!;
    const team = side.players.filter((p) => p.role !== 'gk');
    const b = this.ball.pos;
    const near = (p: Player) => Math.hypot(p.x - b.x, p.z - b.z);
    this.leader = this.scorer && team.includes(this.scorer) ? this.scorer : [...team].sort((a, c) => near(a) - near(c))[0] ?? null;
    for (const p of team) { p.setState('celebrate'); p.celebPose = 'celebrate'; p.celebrateAs(this.celebration === 'airplane' ? 'airplane' : 'celebrate'); }
    for (const p of this.players) if (p.side !== side) p.glum = true;
    if (this.leader) this.emit({ kind: 'voice', who: this.leader, mood: 'happy' });
    this.celebCalls = [1.4, 2.6, 3.6];
    this.sadCall = 0.9;
  }
  private sadCall = 0;

  private celebrate() {
    const lead = this.leader;
    const side = lead ? (lead.side as Side) : null;
    const t = this.phaseT;
    // Most of them end up near the corner flag on the camera side.
    const ex = side ? this.goalX(side) * 0.75 : 0, ez = W - 2.5;
    const go = (p: Player, tx: number, tz: number, stop = 0.6, sprint = true) => {
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d > stop) { p.mx = (tx - p.x) / d; p.mz = (tz - p.z) / d; p.sprint = sprint; return false; }
      p.mx = p.mz = 0;
      return true;
    };
    const faceTo = (p: Player, x: number, z: number) => { p.faceYaw = Math.atan2(x - p.x, z - p.z); };
    const mates: Player[] = [];
    for (const p of this.players) {
      if (p === this.human) { p.mx = p.mz = 0; }
      if (side && p.side === side && p.role !== 'gk' && p.state === 'celebrate') { if (p !== lead) mates.push(p); continue; }
      // Everyone else trudges back to their places.
      const s = this.formationSpot(p, true);
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      p.sprint = false;
      if (d > 0.5) { p.mx = ((s.x - p.x) / d) * 0.45; p.mz = ((s.z - p.z) / d) * 0.45; } else p.mx = p.mz = 0;
    }
    if (!side || !lead) return;
    // Someone on the other team is gutted.
    const losers = this.other(side).players;
    if (this.sadCall && t > this.sadCall && losers.length) {
      this.sadCall = 0;
      this.emit({ kind: 'voice', who: losers[Math.floor(Math.random() * losers.length)], mood: 'sad' });
    }
    const dir = side.dir;
    // Whoops and calls from the team as they celebrate.
    if (this.celebCalls.length && t > this.celebCalls[0]) {
      this.celebCalls.shift();
      const who = Math.random() < 0.4 || !mates.length ? lead : mates[Math.floor(Math.random() * mates.length)];
      this.emit({ kind: 'voice', who, mood: 'happy' });
    }
    // A slide (knees or belly) once they're running at it and close enough.
    const slideAt = (p: Player, tx: number, tz: number, pose: 'kneeslide' | 'belly') => {
      if (p.celebPose === pose) { p.mx = p.mz = 0; return; }
      const d = Math.hypot(tx - p.x, tz - p.z);
      if ((d < 5 && p.speed > 3.5) || t > 2.8) { p.celebrateAs(pose); p.mx = p.mz = 0; } else go(p, tx, tz);
    };
    // Teammates arriving at a spot: off they go with the given move.
    const join = (p: Player, tx: number, tz: number, pose: Pose, sync = false) => {
      if (go(p, tx, tz, 0.5, Math.hypot(tx - p.x, tz - p.z) > 2.5) || p.celebPose === pose) {
        p.mx = p.mz = 0;
        p.celebrateAs(pose, sync);
        return true;
      }
      return false;
    };

    switch (this.celebration) {
      case 'pile': {
        // Run to the corner, team piles on, all jumping.
        if (go(lead, ex, ez) || t > 3.5) { lead.mx = lead.mz = 0; lead.faceYaw = 0; }
        mates.forEach((p) => {
          if (go(p, ex - dir * (1.2 + (p.slot % 3) * 0.9), ez - 1 - (p.slot % 2) * 1.1) || t > 3.5) { p.mx = p.mz = 0; p.faceYaw = 0; }
        });
        break;
      }
      case 'kneeslide': {
        // A long slide on the knees toward the fans; the others jump around them.
        slideAt(lead, ex, ez, 'kneeslide');
        if (lead.celebPose === 'kneeslide') lead.faceYaw = null;
        mates.forEach((p, i) => {
          const a = Math.PI * (0.15 + 0.7 * (i / Math.max(1, mates.length - 1)));
          if (join(p, lead.x - Math.cos(a) * 1.4 * dir, lead.z - Math.sin(a) * 1.4, 'celebrate')) faceTo(p, lead.x, lead.z);
        });
        break;
      }
      case 'airplane': {
        // Arms out, banking round in a big loop with the whole team flying behind in a line.
        const cx = ex - dir * 2, cz = W - 6, R = 3.2;
        const th = Math.atan2(lead.z - cz, lead.x - cx) + 0.75;
        go(lead, cx + Math.cos(th) * R, cz + Math.sin(th) * R, 0.1, Math.hypot(lead.x - cx, lead.z - cz) > R + 3);
        let prev = lead;
        for (const p of mates.sort((a, c) => a.slot - c.slot)) {
          go(p, prev.x, prev.z, 1.4, Math.hypot(prev.x - p.x, prev.z - p.z) > 3);
          prev = p;
        }
        break;
      }
      case 'flip': {
        // Run to the corner, stop, backflip (side-on to the camera), the others gather round and clap.
        if (lead.celebPose !== 'flip') {
          if (go(lead, ex, ez, 0.7) || t > 2.6) {
            lead.mx = lead.mz = 0;
            if (lead.speed < 1.5 || t > 3) {
              lead.faceNow(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
              lead.celebrateAs('flip');
              lead.jump(4.2);
            }
          }
        } else { lead.mx = lead.mz = 0; lead.faceYaw = null; }
        mates.forEach((p, i) => {
          const a = Math.PI * (0.1 + 0.8 * (i / Math.max(1, mates.length - 1)));
          if (join(p, lead.x - Math.cos(a) * 2.4, lead.z - Math.sin(a) * 2.2, 'clap')) faceTo(p, lead.x, lead.z);
        });
        break;
      }
      case 'dance': {
        // Line up facing the fans and dance in time.
        const row = [...mates.sort((a, c) => a.slot - c.slot)];
        row.splice(Math.floor(row.length / 2), 0, lead);
        const x0 = ex - dir * 1.5;
        row.forEach((p, i) => {
          if (join(p, x0 + (i - (row.length - 1) / 2) * 1.1, ez - 0.8, 'dance', true)) p.faceYaw = 0;
        });
        break;
      }
      case 'belly': {
        // Everyone dives and slides along the grass like penguins.
        slideAt(lead, ex, ez, 'belly');
        mates.forEach((p) => slideAt(p, ex - dir * (1.2 + (p.slot % 3) * 0.9), ez - 1 - (p.slot % 2) * 1.3, 'belly'));
        break;
      }
      case 'spin': {
        // A spin on the spot, the team running round and round them.
        if (lead.celebPose === 'spin' || go(lead, ex, ez - 1) || t > 3) { lead.mx = lead.mz = 0; lead.celebrateAs('spin'); }
        mates.forEach((p, i) => {
          const a = (i / mates.length) * Math.PI * 2 + t * 1.6;
          go(p, lead.x + Math.cos(a) * 2, lead.z + Math.sin(a) * 2, 0.2, true);
        });
        break;
      }
    }
  }

  /** Where the taker stands for a restart. */
  takerSpot(r: Restart) {
    const b = { x: r.x, z: r.z };
    switch (r.kind) {
      case 'throw': {
        const out = Math.sign(r.z);
        return { x: b.x, z: r.z + out * 0.25, yaw: out > 0 ? Math.PI : 0 };
      }
      case 'corner': {
        const dx = -Math.sign(r.x), dz = -Math.sign(r.z);
        return { x: b.x - dx * 0.45, z: b.z - dz * 0.45, yaw: Math.atan2(dx, dz * 0.5) };
      }
      case 'free':
      case 'penalty': {
        // Behind the ball, facing the goal if it's in range, otherwise up the pitch.
        const gx = this.goalX(r.side);
        const near = Math.hypot(gx - r.x, r.z) < 22;
        const fx = near ? gx - r.x : r.side.dir, fz = near ? -r.z : 0;
        const fl = Math.hypot(fx, fz) || 1;
        return { x: b.x - (fx / fl) * 0.45, z: b.z - (fz / fl) * 0.45, yaw: Math.atan2(fx, fz) };
      }
      default: {
        const dir = r.side.dir;
        return { x: b.x - dir * 0.45, z: b.z, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
      }
    }
  }

  private setupRestart(kind: RestartKind, side: Side, x: number, z: number, indirect = false) {
    let taker: Player | null;
    this.wall.clear();
    this.penalty = null;
    if (kind === 'goalkick') taker = side.players[0]?.role === 'gk' ? side.players[0] : side.players[0] ?? null;
    else if (kind === 'penalty') taker = side.players.find((p) => p.role === 'fwd') ?? side.players.filter((p) => p.role !== 'gk').at(-1) ?? null;
    else {
      taker = null;
      let bd = Infinity;
      for (const p of side.players) {
        if (p.role === 'gk') continue;
        const d = Math.hypot(p.x - x, p.z - z) + (kind === 'corner' && p.role === 'def' ? 8 : 0);
        if (d < bd) { bd = d; taker = p; }
      }
    }
    if (!taker) { this.kickoff(0); return; }
    this.ball.place(x, z);
    this.ball.dead = true;
    this.restart = { kind, side, x, z, taker, ready: false, t: 0, indirect };
    for (const p of this.players) if (p.state !== 'free' && !this.sentOff.includes(p)) p.setState('free');
    if (side.index === 0 && !this.autopilot) this.setHuman(taker);
    if (kind === 'penalty') this.setupPenalty(side, taker, x);
    if (kind === 'free' && !indirect) this.setupWall(side, x, z);
    this.setPhase('restart');
  }

  /** Penalty: everyone else out of the box and behind the ball, the keeper on the line. */
  private setupPenalty(side: Side, taker: Player, spotX: number) {
    const other = this.other(side);
    const keeper = other.players.find((p) => p.role === 'gk') ?? null;
    const gx = this.goalX(side), dir = side.dir;
    let i = 0;
    for (const p of this.players) {
      if (p === taker || p === keeper || this.sentOff.includes(p)) continue;
      if (p.side === side && p.role === 'gk') { const s = this.formationSpot(p); p.teleport(s.x, s.z, dir > 0 ? Math.PI / 2 : -Math.PI / 2); continue; }
      // Along the edge of the box, out to the sides (clear of the camera behind the taker).
      const row = gx - dir * (PITCH.boxDepth + 1 + (i % 2) * 1.2);
      const zz = (i % 2 ? -1 : 1) * (3.8 + (i >> 1) * 1.3);
      p.teleport(row, Math.max(-W + 1, Math.min(W - 1, zz)), dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      i++;
    }
    taker.teleport(spotX - dir * 1.6, 0.3, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (keeper) keeper.teleport(gx - dir * 0.15, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.penalty = { side, taker, keeper, kickedAt: 0 };
    this.keeperGuess = { z: 0, high: false };
    // Facing one: you're in goal.
    if (side.index === 1 && keeper && !this.autopilot) this.setHuman(keeper);
  }

  /** A free kick in shooting range: the defenders make a wall 4 m from the ball, between it and goal. */
  private setupWall(side: Side, x: number, z: number) {
    const gx = this.goalX(side);
    const d = Math.hypot(gx - x, z);
    if (d > 17 || Math.abs(z) > 11) return;
    const n = d < 12 && Math.abs(z) < 6 ? 3 : 2;
    const ux = (gx - x) / d, uz = -z / d;
    const cx = x + ux * 4, cz = z + uz * 4;
    const defenders = this.other(side).players.filter((p) => p.role !== 'gk').sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    for (let i = 0; i < Math.min(n, defenders.length); i++) {
      const off = (i - (n - 1) / 2) * 0.55;
      this.wall.set(defenders[i], { x: cx - uz * off, z: cz + ux * off });
    }
  }

  /** At a free kick or penalty: the wall in place, and nobody from the other team within 4 m. */
  private clearSpace(r: Restart) {
    const faceBall = (x: number, z: number) => Math.atan2(r.x - x, r.z - z);
    for (const [p, w] of this.wall) p.teleport(w.x, w.z, faceBall(w.x, w.z));
    for (const p of this.other(r.side).players) {
      if (this.wall.has(p) || (r.kind === 'penalty' && p.role === 'gk')) continue;
      const dx = p.x - r.x, dz = p.z - r.z, d = Math.hypot(dx, dz);
      if (d < 4) {
        const nx = r.x + (dx / (d || 1)) * 4.2, nz = Math.max(-W + 0.5, Math.min(W - 0.5, r.z + (dz / (d || 1)) * 4.2));
        p.teleport(nx, nz, faceBall(nx, nz));
      }
    }
  }

  /** The restart's taken: back to normal play. */
  private restartTaken() {
    const r = this.restart;
    if (r?.kind === 'free' && r.indirect) this.indirectBy = r.taker;
    // The wall jumps as it's struck.
    for (const p of this.wall.keys()) p.jump(2.7);
    this.wall.clear();
    this.restart = null;
    this.ball.dead = false;
    this.setPhase('play');
  }

  private endHalf() {
    this.orders.clear();
    this.ball.owner = null;
    this.restart = null;
    this.pendingRestart = null;
    if (this.half === 1) {
      this.emit({ kind: 'whistle', long: 2 });
      this.emit({ kind: 'banner', text: 'HALF TIME', sub: `${this.sides[0].team.short} ${this.sides[0].score} - ${this.sides[1].score} ${this.sides[1].team.short}`, time: 3.2 });
      this.emit({ kind: 'halftime' });
      this.setPhase('halftime');
    } else {
      this.emit({ kind: 'whistle', long: 3 });
      this.emit({ kind: 'banner', text: 'FULL TIME', sub: `${this.sides[0].team.short} ${this.sides[0].score} - ${this.sides[1].score} ${this.sides[1].team.short}`, time: 99 });
      this.emit({ kind: 'fulltime' });
      this.setPhase('fulltime');
    }
  }

  // ---------- drawing ----------

  render(dt: number) {
    for (const p of this.players) p.render(dt, this.ball.pos.x, this.ball.pos.z);
    if (!this.training) this.referee.render(dt, this.ball.pos.x, this.ball.pos.z);
    this.ball.render(dt);
  }

  /** Where the camera should look, and how close. */
  focus() {
    if (this.phase === 'goal' && this.leader && this.phaseT > 0.8) return { x: this.leader.x, z: this.leader.z, zoom: Math.min(1, (this.phaseT - 0.8) / 1.5) };
    const b = this.ball.pos;
    return { x: b.x + this.ball.vel.x * 0.35, z: b.z, zoom: 0 };
  }

  /** How exciting it is right now (for the crowd): ball near a goal, a shot flying... */
  excitement() {
    if (this.phase === 'goal') return 1;
    const b = this.ball.pos;
    const near = Math.max(0, 1 - (L - Math.abs(b.x)) / 12);
    return Math.min(1, near * 0.6 + (this.lastShot && this.time - this.lastShot.t < 1.5 ? 0.4 : 0));
  }

  dispose() {
    this.group.removeFromParent();
  }
}

