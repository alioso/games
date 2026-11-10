// One footballer: where they are, how they move (accelerate, brake, turn: slower with the ball),
// what they're doing (running, kicking, tackling, diving...). Decisions come from outside: the
// human's controls or the team's brain set the wanted movement and start actions.
import { PLAYER } from '../data/tuning';
import type { Kit, Team } from '../data/teams';
import { type KickStyle, type Pose, PlayerRig } from '../entities/playerModel';

export type Role = 'gk' | 'def' | 'mid' | 'fwd';
export type PState = 'free' | 'kick' | 'header' | 'tackle' | 'slide' | 'down' | 'stunned' | 'dive' | 'hold' | 'throw' | 'celebrate';

export interface SideRef {
  index: 0 | 1;
  /** +1: attacking the goal at +x. */
  dir: number;
}

export class Player {
  readonly rig: PlayerRig;
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** Facing: 0 = +z (toward the camera), π/2 = +x. */
  yaw = 0;
  state: PState = 'free';
  stateT = 0;
  /** Wanted movement (direction × 0..1), whether to sprint, and something to face when standing. */
  mx = 0;
  mz = 0;
  sprint = false;
  faceYaw: number | null = null;
  /** Can't touch the ball until this runs out (just kicked it, or got knocked off it). */
  noTouch = 0;
  /** Running speed multiplier (difficulty). */
  speedMul = 1;
  /** Dive: sideways direction (+1 their left), and velocity. */
  diveSide = 1;
  diveVx = 0;
  diveVz = 0;
  diveVy = 0;
  y = 0;
  /** Goal celebration: the move this player is doing now, and when (stateT) they started it. */
  celebPose: Pose = 'celebrate';
  private celebAt = 0;
  /** Just let a goal in: head down when standing around. */
  glum = false;
  /** Jumping (a wall going up for a free kick): upward speed. */
  private jumpV = 0;
  /** Holding the ball over their head (throw-in) rather than at the chest (keeper). */
  overhead = false;
  /** Show this pose instead of the usual one (the referee pointing or showing a card). */
  poseOverride: Pose | null = null;
  /** A kick being wound up: the ball leaves the foot at `contact` seconds into the kick. */
  kickContact = 0;
  kickPower = 0.5;
  kickStyle: KickStyle = 'shot';
  /** The kick waiting for the foot to arrive (the match fills this in; it's the match's Order). */
  windup: unknown = null;
  /** Seconds since the last dribbling touch, and which foot made it. */
  touchT = 9;
  touchFoot = -1;
  /** Run cycle (radians; one full turn = two steps). */
  stride = 0;
  /** Where in the dribbling cycle the last frame was (to spot the moment of each touch). */
  dribbleU = 0;
  /** Leaning into turns (sideways) and into speeding up / slowing down (forward), smoothed. */
  private leanSide = 0;
  private leanFwd = 0;
  private prevYaw = 0;
  private prevVx = 0;
  private prevVz = 0;

  constructor(
    readonly team: Team,
    readonly side: SideRef,
    readonly role: Role,
    /** Formation slot (0 = keeper). */
    readonly slot: number,
    readonly number: number,
    kit: Kit,
  ) {
    this.rig = new PlayerRig(team, kit, number, role === 'gk');
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  /** Facing direction. */
  get fx() {
    return Math.sin(this.yaw);
  }
  get fz() {
    return Math.cos(this.yaw);
  }

  /** Can play the ball right now (not on the floor, not mid-dive...). */
  get active() {
    return (this.state === 'free' || this.state === 'kick' || this.state === 'header' || this.state === 'tackle' || this.state === 'slide') && this.noTouch <= 0;
  }

  setState(s: PState) {
    this.state = s;
    this.stateT = 0;
    if (s !== 'hold') this.overhead = false;
    if (s !== 'kick') this.windup = null;
  }

  /** Switch to a celebration move (restarts its timing if it's a new one; `inTime`: on the shared
   *  clock since the goal, so a team dance stays in step). */
  celebrateAs(pose: Pose, inTime = false) {
    if (this.celebPose !== pose) { this.celebPose = pose; this.celebAt = inTime ? 0 : this.stateT; }
  }
  get celebT() {
    return this.stateT - this.celebAt;
  }

  /** A little jump straight up. */
  jump(v: number) {
    this.jumpV = v;
    this.y = Math.max(this.y, 0.001);
  }

  /** Stand at a spot, facing somewhere, stopped. */
  teleport(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.yaw = yaw;
    this.y = 0;
    this.jumpV = 0;
    this.setState('free');
    this.mx = this.mz = 0;
    this.glum = false;
    this.celebPose = 'celebrate';
  }

  update(dt: number, withBall: boolean) {
    this.stateT += dt;
    this.noTouch = Math.max(0, this.noTouch - dt);
    this.touchT += dt;
    let maxSpeed = (this.sprint ? PLAYER.sprint : PLAYER.jog) * this.speedMul * (withBall ? PLAYER.withBall : 1);
    let wantX = this.mx * maxSpeed, wantZ = this.mz * maxSpeed;
    let accel: number = PLAYER.accel;

    switch (this.state) {
      case 'kick':
        // Plant and strike: slow right down; done once the leg's come back after the contact.
        wantX *= 0.25; wantZ *= 0.25;
        if (this.stateT > this.kickContact + 0.32 && !this.windup) this.setState('free');
        break;
      case 'header':
        wantX *= 0.25; wantZ *= 0.25;
        if (this.stateT > 0.38) this.setState('free');
        break;
      case 'tackle':
        // A short lunge.
        if (this.stateT < 0.22) { wantX = this.fx * 6.5; wantZ = this.fz * 6.5; accel = 60; } else { wantX = wantZ = 0; accel = 30; }
        if (this.stateT > 0.5) this.setState('free');
        break;
      case 'slide': {
        // Slide along the grass, slowing down, then get up.
        const s = Math.max(0, 8.5 - this.stateT * 11);
        wantX = this.fx * s; wantZ = this.fz * s; accel = this.stateT < 0.05 ? 200 : 40;
        if (this.stateT > 1.0) this.setState('free');
        break;
      }
      case 'down':
        wantX = wantZ = 0; accel = 25;
        if (this.stateT > 1.3) this.setState('free');
        break;
      case 'stunned':
        wantX *= 0.2; wantZ *= 0.2;
        if (this.stateT > 0.45) this.setState('free');
        break;
      case 'dive': {
        // Keepers fly sideways and fall.
        this.x += this.diveVx * dt;
        this.z += this.diveVz * dt;
        this.y = Math.max(0, this.y + this.diveVy * dt);
        this.diveVy -= 9.81 * dt;
        this.diveVx *= Math.exp(-dt * 1.5);
        this.diveVz *= Math.exp(-dt * 1.5);
        this.vx = this.vz = 0;
        if (this.stateT > 1.1) { this.y = 0; this.setState('free'); }
        return;
      }
      case 'hold':
      case 'throw':
        maxSpeed = this.state === 'throw' ? 0 : maxSpeed * 0.6;
        wantX = this.mx * maxSpeed; wantZ = this.mz * maxSpeed;
        if (this.state === 'throw' && this.stateT > 0.6) this.setState('free');
        break;
      case 'celebrate':
        // Sliding on knees or belly: no running, just the grass slowing them down.
        if (this.celebPose === 'kneeslide' || this.celebPose === 'belly') { wantX = wantZ = 0; accel = this.celebPose === 'belly' ? 4.5 : 3.6; }
        if (this.celebPose === 'flip') { wantX = wantZ = 0; accel = 6; }
        break;
    }

    // Accelerate toward the wanted velocity (braking is quicker than speeding up).
    const dx = wantX - this.vx, dz = wantZ - this.vz;
    const dl = Math.hypot(dx, dz);
    const braking = wantX * this.vx + wantZ * this.vz < this.vx * this.vx + this.vz * this.vz - 0.01;
    // Quick off the mark, harder to find the last bit of speed.
    const sp0 = Math.hypot(this.vx, this.vz);
    const fade = accel === PLAYER.accel ? 1.15 - 0.6 * Math.min(1, sp0 / PLAYER.sprint) : 1;
    const a = (braking ? Math.max(accel, PLAYER.brake) : accel * fade) * dt;
    if (dl > a) { this.vx += (dx / dl) * a; this.vz += (dz / dl) * a; } else { this.vx = wantX; this.vz = wantZ; }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y > 0 || this.jumpV > 0) {
      this.y += this.jumpV * dt;
      this.jumpV -= 9.81 * dt;
      if (this.y <= 0) { this.y = 0; this.jumpV = 0; }
    }

    // Turn toward where we're going (or what we're told to face).
    const sp = this.speed;
    let target: number | null = null;
    if (this.state === 'free' || this.state === 'hold') {
      if (sp > 0.5 && (this.mx || this.mz)) target = Math.atan2(this.vx, this.vz);
      else if (this.faceYaw !== null) target = this.faceYaw;
    } else if (this.state === 'celebrate') {
      const sliding = this.celebPose === 'kneeslide' || this.celebPose === 'belly' || this.celebPose === 'flip';
      if (!sliding && sp > 0.8 && (this.mx || this.mz)) target = Math.atan2(this.vx, this.vz);
      else if (!sliding && this.faceYaw !== null) target = this.faceYaw;
    }
    if (this.state === 'celebrate' && this.celebPose === 'spin') { this.yaw += dt * 11; target = null; }
    if (target !== null) {
      const rate = withBall ? (this.sprint ? PLAYER.turnSprintBall : PLAYER.turnWithBall) : PLAYER.turn;
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = rate * dt;
      this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
    }
    // Steps per second rise with speed (short legs: quick little steps, so the feet don't skate).
    if (sp > 0.3) this.stride += dt * Math.PI * 2 * (1.2 + 0.55 * sp);
    // Lean into turns and into changes of speed.
    if (dt > 0) {
      let dy = this.yaw - this.prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turnRate = dy / dt;
      const acc = ((this.vx - this.prevVx) * this.fx + (this.vz - this.prevVz) * this.fz) / dt;
      const k = 1 - Math.exp(-dt * 10);
      this.leanSide += (Math.max(-0.32, Math.min(0.32, -turnRate * 0.07 * Math.min(1, sp / 4))) - this.leanSide) * k;
      this.leanFwd += (Math.max(-0.28, Math.min(0.22, acc * 0.014)) - this.leanFwd) * k;
    }
    this.prevYaw = this.yaw;
    this.prevVx = this.vx;
    this.prevVz = this.vz;
  }

  /** Turn straight to face a direction (kicks snap round a little). */
  faceNow(yaw: number, max = Math.PI) {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.max(-max, Math.min(max, d));
  }

  /** Place and pose the model. */
  render(dt: number, ballX: number, ballZ: number) {
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.yaw;
    const sp = this.speed;
    let pose: Pose;
    if (this.poseOverride) pose = this.poseOverride;
    else switch (this.state) {
      case 'free': pose = sp > 0.45 ? 'run' : this.glum ? 'sad' : 'idle'; break;
      case 'celebrate': {
        const c = this.celebPose;
        pose = c === 'airplane' || c === 'kneeslide' || c === 'belly' || c === 'flip' || c === 'spin' ? c : sp > 1.5 ? 'run' : c;
        break;
      }
      case 'hold': pose = this.overhead ? 'throw' : 'hold'; break;
      default: pose = this.state;
    }
    // Look at the ball (within reason).
    let look = Math.atan2(ballX - this.x, ballZ - this.z) - this.yaw;
    look = Math.atan2(Math.sin(look), Math.cos(look));
    r.animate({
      pose, t: this.state === 'hold' ? 0 : this.state === 'celebrate' ? this.celebT : this.stateT, speed: sp, phase: this.stride, side: this.diveSide, look: Math.max(-0.9, Math.min(0.9, look)),
      kick: { contact: this.kickContact, power: this.kickPower, kind: this.kickStyle },
      touch: this.touchT < 0.22 ? 1 - this.touchT / 0.22 : 0, touchFoot: this.touchFoot,
      lean: this.state === 'free' || this.state === 'hold' || pose === 'run' || pose === 'airplane' ? { side: this.leanSide, fwd: this.leanFwd } : undefined,
    }, dt);
  }
}
