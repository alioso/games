import type { Controls } from '@engine/input';
import { chance, rand, segmentCircle, type V2 } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import type { Match } from '../match';
import type { AI_LEVELS } from '../data/tuning';
import { SPEAR } from '../data/weapons';

type Level = (typeof AI_LEVELS)['normal'];

const IDEAL_RANGE = 6;
const THROW_RANGE = 10.5;

/** A computer player. It produces the same Controls a human would, so it plays by the same rules. */
export class Brain {
  private path: V2[] = [];
  private pathGoal: V2 | null = null;
  private repath = 0;
  private react = 0;
  private reactNeed: number;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeT = rand(1, 2.5);
  private dodgeT = 0;
  private dodgeX = 0;
  private dodgeZ = 0;
  private target: Bloc | null = null;
  private targetT = 0;
  private wander: V2 | null = null;
  private wanderT = 0;

  constructor(private me: Bloc, private match: Match, private level: Level) {
    this.reactNeed = level.reaction * rand(0.7, 1.4);
  }

  think(dt: number): Controls {
    const c: Controls = {
      moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, hasAim: false,
      attack: false, attackPressed: false, attackReleased: false, dashPressed: false, pausePressed: false,
    };
    this.repath -= dt;
    this.watchForSpears(c);
    if (this.me.isRobot) this.robot(dt, c);
    else this.fighter(dt, c);
    return c;
  }

  // ───────────── shared ─────────────

  private watchForSpears(c: Controls) {
    const me = this.me;
    for (const s of this.match.spears) {
      if (s.state !== 'flying' || s.owner === me) continue;
      const rx = me.x - s.x, rz = me.z - s.z;
      const along = rx * s.dirX + rz * s.dirZ;
      if (along < 0 || along > SPEAR.speed * 0.8) continue;
      const side = rx * s.dirZ - rz * s.dirX;
      if (Math.abs(side) > me.radius + 0.5) continue;
      if (me.seenSpears.has(s.id)) continue;
      me.seenSpears.add(s.id);
      if (!chance(me.isRobot ? Math.max(0.5, this.level.dodgeChance) : this.level.dodgeChance)) continue;
      // Step out sideways, away from the spear's line.
      const sign = side >= 0 ? 1 : -1;
      this.dodgeX = s.dirZ * sign;
      this.dodgeZ = -s.dirX * sign;
      if (this.blockedAhead(this.dodgeX, this.dodgeZ)) { this.dodgeX *= -1; this.dodgeZ *= -1; }
      this.dodgeT = 0.35;
      if (!me.isRobot && me.dashCooldown <= 0 && chance(0.6)) c.dashPressed = true;
    }
  }

  private blockedAhead(dx: number, dz: number, d = 1.1) {
    return this.match.arena.nav.isBlocked(this.me.x + dx * d, this.me.z + dz * d);
  }

  /** Walk towards goal along a path around water and obstacles. */
  private goTo(goal: V2, c: Controls, exact = false) {
    const me = this.me;
    const moved = !this.pathGoal || Math.hypot(this.pathGoal.x - goal.x, this.pathGoal.z - goal.z) > 1.2;
    if (moved || this.repath <= 0) {
      this.path = this.match.arena.nav.findPath(me.x, me.z, goal.x, goal.z) ?? [];
      if (exact && this.path.length) this.path[this.path.length - 1] = goal;
      this.pathGoal = { ...goal };
      this.repath = 0.5;
    }
    while (this.path.length && Math.hypot(this.path[0].x - me.x, this.path[0].z - me.z) < 0.3) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    const dx = next.x - me.x, dz = next.z - me.z, l = Math.hypot(dx, dz);
    const slow = this.path.length === 1 ? Math.min(1, l / 0.6) : 1;
    c.moveX = (dx / l) * slow;
    c.moveZ = (dz / l) * slow;
  }

  // ───────────── robot ─────────────

  private robot(dt: number, c: Controls) {
    const me = this.me;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      c.moveX = this.dodgeX;
      c.moveZ = this.dodgeZ;
      return;
    }
    const { halfW, halfD } = this.match.arena.def;
    const nav = this.match.arena.nav;
    const threat = this.match.blocs.find((b) => b.alive && !b.isRobot && b.team !== me.team && Math.hypot(b.x - me.x, b.z - me.z) < 8);
    this.wanderT -= dt;
    if (threat && this.wanderT < 2.5) {
      // Shuffle away from danger.
      const dx = me.x - threat.x, dz = me.z - threat.z, l = Math.hypot(dx, dz) || 1;
      this.wander = nav.nearestFree(me.x + (dx / l) * 4, me.z + (dz / l) * 4);
      this.wanderT = 3;
    }
    if (!this.wander || this.wanderT <= 0 || Math.hypot(this.wander.x - me.x, this.wander.z - me.z) < 0.5) {
      // Wander around the back of its own side of the arena.
      const four = this.match.teams.length > 2;
      const sx = four ? (me.team.id % 2 === 0 ? -1 : 1) : me.team.id === 0 ? -1 : 1;
      const x = sx * rand(halfW * 0.55, halfW - 1.5);
      const z = four ? (me.team.id < 2 ? -1 : 1) * rand(1.5, halfD - 1.5) : rand(-halfD + 1.5, halfD - 1.5);
      this.wander = nav.nearestFree(x, z);
      this.wanderT = rand(4, 7);
    }
    this.goTo(this.wander, c);
  }

  // ───────────── fighter ─────────────

  private fighter(dt: number, c: Controls) {
    const me = this.me;
    const target = this.pickTarget(dt);
    const canSee = target ? this.clearShot(target) : false;
    const dist = target ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;

    // Throwing, whatever we're walking towards.
    if (target && me.holdingSpear && canSee && dist < THROW_RANGE) {
      this.react += dt;
      const [ax, az] = this.aimAt(target, dist);
      c.hasAim = true;
      c.aimX = ax;
      c.aimZ = az;
      if (this.react >= this.reactNeed) {
        c.attackPressed = true;
        this.react = 0;
        this.reactNeed = this.level.reaction * rand(0.7, 1.4);
      }
    } else {
      this.react = Math.max(0, this.react - dt);
    }

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      c.moveX = this.dodgeX;
      c.moveZ = this.dodgeZ;
      return;
    }

    // 1. Go get our spear back.
    const spear = me.spear;
    if (!me.holdingSpear && spear) {
      if (spear.state === 'grounded' || spear.state === 'stuck' || spear.state === 'falling') {
        this.goTo({ x: spear.x, z: spear.z }, c, true);
      } else if (spear.state === 'flying') {
        this.goTo({ x: spear.x + spear.dirX * 2, z: spear.z + spear.dirZ * 2 }, c);
      } else {
        this.retreat(c);
      }
      this.separate(c);
      return;
    }

    // 2. Revive a fallen teammate.
    if (me.revivesLeft > 0) {
      const body = this.match.blocs
        .filter((b) => b.state === 'dead' && b.team === me.team)
        .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (body && Math.hypot(body.x - me.x, body.z - me.z) < 18 && !(canSee && dist < 4)) {
        this.goTo({ x: body.x, z: body.z }, c, true);
        return;
      }
    }

    if (!target) return;

    // 3. Fight: close in until we have a clear shot, then strafe at a comfortable range.
    if (!canSee || dist > IDEAL_RANGE + 3.5) {
      this.goTo({ x: target.x, z: target.z }, c);
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(0.8, 2.2); }
      const dx = (target.x - me.x) / dist, dz = (target.z - me.z) / dist;
      const approach = dist > IDEAL_RANGE + 1 ? 0.6 : dist < IDEAL_RANGE - 2 ? -0.6 : 0;
      let mx = -dz * this.strafe * 0.8 + dx * approach;
      let mz = dx * this.strafe * 0.8 + dz * approach;
      if (this.blockedAhead(mx, mz)) {
        this.strafe *= -1;
        mx = -dz * this.strafe * 0.8 + dx * approach;
        mz = dx * this.strafe * 0.8 + dz * approach;
        if (this.blockedAhead(mx, mz)) { mx = 0; mz = 0; }
      }
      c.moveX = mx;
      c.moveZ = mz;
    }
    this.separate(c);
  }

  private pickTarget(dt: number) {
    const me = this.me;
    this.targetT -= dt;
    if (this.target && this.target.alive && this.targetT > 0) return this.target;
    const myRobot = this.match.blocs.find((b) => b.isRobot && b.team === me.team);
    let best: Bloc | null = null, bestScore = Infinity;
    for (const b of this.match.blocs) {
      if (!b.alive || b.team === me.team) continue;
      let score = Math.hypot(b.x - me.x, b.z - me.z);
      // Robots are the goal, but blocs shoot back: go for the robot when it's close or few defenders are left.
      if (b.isRobot) {
        const defenders = this.defenders(b);
        score = score * 2 - (score < 5 ? 8 : 0) - (defenders === 0 ? 20 : defenders === 1 ? 6 : 0);
      }
      if (myRobot?.alive && !b.isRobot && Math.hypot(b.x - myRobot.x, b.z - myRobot.z) < 7) score -= 8;
      score += rand(0, 3);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    this.target = best;
    this.targetT = rand(1.2, 2.5);
    return best;
  }

  private defenders(robot: Bloc) {
    return this.match.blocs.filter((b) => b.alive && !b.isRobot && b.team === robot.team).length;
  }

  /** No obstacle and no teammate between us and the target. */
  private clearShot(t: Bloc) {
    const me = this.me;
    for (const o of this.match.arena.obstacles) {
      if (segmentCircle(me.x, me.z, t.x, t.z, o.x, o.z, o.r + 0.1) !== null) return false;
    }
    const dist = Math.hypot(t.x - me.x, t.z - me.z);
    for (const b of this.match.blocs) {
      if (b === me || !b.alive || b.team !== me.team) continue;
      const hit = segmentCircle(me.x, me.z, t.x, t.z, b.x, b.z, b.radius + 0.3);
      if (hit !== null && hit * dist < dist - 0.5) return false;
    }
    return true;
  }

  private aimAt(t: Bloc, dist: number): [number, number] {
    const me = this.me;
    const lead = (dist / SPEAR.speed) * this.level.leadTarget;
    const px = t.x + t.vx * lead, pz = t.z + t.vz * lead;
    const err = ((rand(-1, 1) * this.level.aimError) * Math.PI) / 180;
    const a = Math.atan2(px - me.x, pz - me.z) + err;
    return [Math.sin(a), Math.cos(a)];
  }

  /** Without a spear: back off towards our own robot. */
  private retreat(c: Controls) {
    const robot = this.match.blocs.find((b) => b.isRobot && b.team === this.me.team);
    if (robot) this.goTo({ x: robot.x, z: robot.z + 2 }, c);
  }

  /** Don't bunch up with teammates. */
  private separate(c: Controls) {
    const me = this.me;
    for (const b of this.match.blocs) {
      if (b === me || !b.alive || b.team !== me.team) continue;
      const dx = me.x - b.x, dz = me.z - b.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < 1.6) {
        c.moveX += (dx / d) * (1.6 - d) * 0.6;
        c.moveZ += (dz / d) * (1.6 - d) * 0.6;
      }
    }
    const m = Math.hypot(c.moveX, c.moveZ);
    if (m > 1) { c.moveX /= m; c.moveZ /= m; }
  }
}
