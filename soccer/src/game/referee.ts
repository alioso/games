// The referee: an owl in black who follows play from a few metres away (on the far side, so they
// don't block the camera), runs over to fouls, points to the spot, and holds up cards.
// The rules themselves (what's a foul, offside...) are judged by the match; this is the character.
import { PITCH } from '../data/tuning';
import { REFEREE } from '../data/teams';
import { Player } from './player';

const L = PITCH.length / 2, W = PITCH.width / 2;

export class Referee {
  readonly p: Player;
  /** Showing a card (until), pointing (until), and where to go meanwhile. */
  private cardUntil = 0;
  private pointUntil = 0;
  private goTo: { x: number; z: number } | null = null;
  private faceAt: { x: number; z: number } | null = null;

  constructor() {
    this.p = new Player(REFEREE, { index: 0, dir: 1 }, 'mid', 0, 0, REFEREE.home);
    this.p.speedMul = 0.95;
  }

  get root() {
    return this.p.rig.root;
  }

  place(x: number, z: number) {
    this.p.teleport(x, z, 0);
    this.cardUntil = this.pointUntil = 0;
    this.p.poseOverride = null;
    this.p.rig.setCard(null);
    this.goTo = null;
  }

  /** Run to a player and show them a card (yellow or red) for a couple of seconds. */
  card(at: Player, color: number, now: number) {
    this.goTo = { x: at.x + 1.1, z: at.z - 0.8 };
    this.faceAt = { x: at.x, z: at.z };
    this.cardUntil = now + 2.6;
    this.pendingCard = color;
  }
  private pendingCard = 0;

  /** Point at somewhere (the penalty spot, the free kick) for a moment. */
  point(x: number, z: number, now: number) {
    this.faceAt = { x, z };
    this.pointUntil = now + 1.4;
  }

  /** Follow play: a few metres from the ball, toward the far side, never in the goalmouth. */
  update(dt: number, now: number, ballX: number, ballZ: number) {
    const p = this.p;
    let tx: number, tz: number;
    if (this.goTo && now < this.cardUntil) {
      tx = this.goTo.x; tz = this.goTo.z;
    } else {
      this.goTo = null;
      tx = Math.max(-L + 7, Math.min(L - 7, ballX - Math.sign(ballX || 1) * 4));
      tz = Math.max(-W + 2, Math.min(W - 3, ballZ - 4.5));
    }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      const k = Math.min(1, d / 3);
      p.mx = (dx / d) * k;
      p.mz = (dz / d) * k;
      p.sprint = d > 6 || !!this.goTo;
    } else { p.mx = p.mz = 0; p.sprint = false; }
    const look = this.faceAt && (now < this.cardUntil || now < this.pointUntil) ? this.faceAt : { x: ballX, z: ballZ };
    p.faceYaw = Math.atan2(look.x - p.x, look.z - p.z);
    // Card up once they've got there (or after a moment), pointing, or nothing.
    const showing = now < this.cardUntil && (d < 0.8 || now > this.cardUntil - 1.6);
    if (showing) { p.poseOverride = 'card'; p.rig.setCard(this.pendingCard); p.mx = p.mz = 0; }
    else if (now < this.pointUntil) { p.poseOverride = 'point'; p.rig.setCard(null); }
    else { p.poseOverride = null; p.rig.setCard(null); }
    if (p.poseOverride) p.faceNow(p.faceYaw, 8 * dt);
    p.update(dt, false);
  }

  render(dt: number, ballX: number, ballZ: number) {
    this.p.render(dt, ballX, ballZ);
  }
}
