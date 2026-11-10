// Goal replays. Every frame the match is drawn, we note down how everything looked (each player's
// pose as numbers, the ball's place and spin) and the ball's sounds, keeping the last few seconds.
// After a goal the build-up plays back from those notes in slow motion: nothing is simulated
// again, so the replay is exactly what happened.
import * as THREE from 'three';
import type { PlayerRig } from '../entities/playerModel';
import type { Ball } from './ball';

interface Frame {
  t: number;
  rigs: PlayerRig[];
  poses: Float32Array[];
  ball: THREE.Vector3;
  spin: THREE.Quaternion;
  glow: number;
}

/** A sound to play again at the same moment of the replay. */
export interface ReplaySound {
  t: number;
  play: () => void;
}

const KEEP = 9;

export class Replay {
  private frames: Frame[] = [];
  private sounds: ReplaySound[] = [];
  private clip: { frames: Frame[]; sounds: ReplaySound[]; t: number; end: number; speed: number; next: number } | null = null;
  /** Where the goal was scored (+1 / -1 end), for the camera. */
  end = 1;

  get playing() {
    return !!this.clip;
  }

  /** Note down how everything looks right now (match time t). */
  capture(t: number, rigs: PlayerRig[], ball: Ball) {
    if (this.clip) return;
    this.frames.push({ t, rigs: [...rigs], poses: rigs.map((r) => r.snapshot()), ball: ball.mesh.position.clone(), spin: ball.mesh.quaternion.clone(), glow: ball.glow });
    while (this.frames.length && this.frames[0].t < t - KEEP) this.frames.shift();
  }

  /** Note a sound (a kick, the net...) so the replay can play it too. */
  sound(t: number, play: () => void) {
    if (this.clip) return;
    this.sounds.push({ t, play });
    while (this.sounds.length && this.sounds[0].t < t - KEEP) this.sounds.shift();
  }

  /** Start playing back match time from..to, at this speed. */
  start(from: number, to: number, end: number, speed = 0.55) {
    const frames = this.frames.filter((f) => f.t >= from && f.t <= to);
    if (frames.length < 2) return false;
    this.end = end;
    const t = frames[0].t;
    this.clip = { frames, sounds: this.sounds.filter((s) => s.t >= t && s.t <= to), t, end: frames[frames.length - 1].t, speed, next: 0 };
    return true;
  }

  /** Seconds of replay left (in real time). */
  get left() {
    const c = this.clip;
    return c ? (c.end - c.t) / c.speed : 0;
  }

  stop() {
    this.clip = null;
    this.frames.length = 0;
    this.sounds.length = 0;
  }

  /** Move the replay on and pose everything; returns the ball's position (for the camera), or null when done. */
  update(dt: number, ball: Ball) {
    const c = this.clip;
    if (!c) return null;
    c.t = Math.min(c.end, c.t + dt * c.speed);
    while (c.next < c.sounds.length && c.sounds[c.next].t <= c.t) c.sounds[c.next++].play();
    // The two frames either side of now.
    let i = c.frames.findIndex((f) => f.t > c.t);
    if (i < 1) i = i === 0 ? 1 : c.frames.length - 1;
    const a = c.frames[i - 1], b = c.frames[i];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (c.t - a.t) / (b.t - a.t))) : 1;
    a.rigs.forEach((rig, j) => {
      const jb = b.rigs.indexOf(rig);
      rig.restore(a.poses[j], jb >= 0 ? b.poses[jb] : a.poses[j], k, dt);
    });
    const pos = a.ball.clone().lerp(b.ball, k);
    ball.showAt(pos, a.spin.clone().slerp(b.spin, k), a.glow + (b.glow - a.glow) * k);
    return pos;
  }

  /** Finished playing? */
  get done() {
    return !!this.clip && this.clip.t >= this.clip.end;
  }
}
