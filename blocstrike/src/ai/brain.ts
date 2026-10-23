import type { Controls } from '@engine/input';
import { chance, clamp, rand, segmentCircle, type V2 } from '@engine/math';
import type { Bloc } from '../entities/bloc';
import type { Match } from '../match';
import type { AI_LEVELS } from '../data/tuning';
import { BAZOOKA, FLAMETHROWER, GRENADE, SPEAR, type WeaponId } from '../data/weapons';
import { inFlames } from '../weapons/flamethrower';

type Level = (typeof AI_LEVELS)['normal'];

/** How each weapon wants to be used: where to stand, when it can fire. */
const STYLE: Record<WeaponId, { ideal: number; max: number; min: number; speed: number }> = {
  spear: { ideal: 6, max: 10.5, min: 0, speed: SPEAR.speed },
  bazooka: { ideal: 7, max: 12, min: BAZOOKA.blastRadius + 1.2, speed: BAZOOKA.speed },
  grenade: { ideal: 7.5, max: GRENADE.maxDistance - 0.5, min: GRENADE.blastRadius + 1.2, speed: 12 },
  flamethrower: { ideal: FLAMETHROWER.range - 1.3, max: FLAMETHROWER.range - 0.3, min: 0, speed: Infinity },
};

const NO: Controls = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, hasAim: false,
  attack: false, attackPressed: false, attackReleased: false, dashPressed: false, pausePressed: false,
};

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
  /** Grenade: how long to hold the button for the current throw. */
  private chargeGoal = -1;

  constructor(private me: Bloc, private match: Match, private level: Level) {
    this.reactNeed = level.reaction * rand(0.7, 1.4);
  }

  think(dt: number): Controls {
    const c: Controls = { ...NO };
    this.repath -= dt;
    this.watchThreats(c);
    if (this.me.isBunny) this.bunny(dt, c);
    else this.fighter(dt, c);
    return c;
  }

  // ───────────── shared ─────────────

  private watchThreats(c: Controls) {
    const me = this.me;
    for (const s of this.match.threats()) {
      if (s.owner === me) continue;
      const rx = me.x - s.x, rz = me.z - s.z;
      const along = rx * s.dirX + rz * s.dirZ;
      if (along < 0 || along > s.speed * 0.8) continue;
      const side = rx * s.dirZ - rz * s.dirX;
      // Rockets explode, so give them a wider berth.
      if (Math.abs(side) > me.radius + 0.5 + (s.speed < 18 ? 1 : 0)) continue;
      if (me.seen.has(s.id)) continue;
      me.seen.add(s.id);
      if (!chance(me.isBunny ? Math.max(0.5, this.level.dodgeChance) : this.level.dodgeChance)) continue;
      // Step out sideways, away from the line it's flying along.
      const sign = side >= 0 ? 1 : -1;
      this.startDodge(s.dirZ * sign, -s.dirX * sign, c);
    }
    // Run from grenades about to go off (if we notice them).
    for (const d of this.match.dangers()) {
      const dx = me.x - d.x, dz = me.z - d.z, l = Math.hypot(dx, dz);
      if (l > d.r || me.seen.has(d.id)) continue;
      me.seen.add(d.id);
      if (!chance(me.isBunny ? Math.max(0.5, this.level.dodgeChance) : this.level.dodgeChance)) continue;
      this.startDodge(l > 0.01 ? dx / l : 1, l > 0.01 ? dz / l : 0, c);
      this.dodgeT = 0.7;
    }
  }

  private startDodge(x: number, z: number, c: Controls) {
    if (this.blockedAhead(x, z)) { x = -x; z = -z; }
    if (this.blockedAhead(x, z)) return;
    this.dodgeX = x;
    this.dodgeZ = z;
    this.dodgeT = 0.4;
    if (!this.me.isBunny && this.me.dashCooldown <= 0 && chance(0.6)) c.dashPressed = true;
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

  private dodging(dt: number, c: Controls) {
    if (this.dodgeT <= 0) return false;
    this.dodgeT -= dt;
    c.moveX = this.dodgeX;
    c.moveZ = this.dodgeZ;
    return true;
  }

  // ───────────── bunny ─────────────

  private bunny(dt: number, c: Controls) {
    const me = this.me;
    if (this.dodging(dt, c)) return;
    const { halfW, halfD } = this.match.arena.def;
    const nav = this.match.arena.nav;
    const threat = this.match.blocs.find((b) => b.alive && !b.isBunny && b.team !== me.team && Math.hypot(b.x - me.x, b.z - me.z) < 8);
    this.wanderT -= dt;
    // A fallen teammate: hop over and revive them, unless an enemy is right here.
    const body = me.revivesLeft > 0 ? this.match.blocs
      .filter((b) => b.state === 'dead' && b.team === me.team)
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0] : undefined;
    const closeThreat = threat && Math.hypot(threat.x - me.x, threat.z - me.z) < 4;
    if (body && !closeThreat) {
      this.goTo({ x: body.x, z: body.z }, c, true);
      return;
    }
    if (threat && this.wanderT < 2.5) {
      // Hop away from danger.
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
    const style = STYLE[me.weapon];
    const target = this.pickTarget(dt);
    const dist = target ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;
    const canSee = target ? this.clearShot(target) : false;

    this.attack(dt, c, target, dist, canSee);

    if (this.dodging(dt, c)) return;

    // 1. Spear: go get it back.
    if (me.weapon === 'spear' && !me.armed && me.spear) {
      const spear = me.spear;
      if (spear.state === 'grounded' || spear.state === 'stuck' || spear.state === 'falling') {
        this.goTo({ x: spear.x, z: spear.z }, c, true);
      } else if (spear.state === 'flying') {
        this.goTo({ x: spear.x + spear.dirX * 2, z: spear.z + spear.dirZ * 2 }, c);
      } else {
        this.guard(c);
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

    // 3. Out of grenades or fuel: walk up and punch.
    if (this.match.outOfAmmo(me)) {
      this.brawl(dt, c, target);
      return;
    }

    if (!target) return;

    // 4. Fight: close in until we have a clear shot, then strafe at the weapon's favourite range.
    if (!canSee || dist > style.max) {
      this.goTo({ x: target.x, z: target.z }, c);
    } else if (!(me.weapon === 'grenade' && this.chargeGoal >= 0)) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(0.8, 2.2); }
      const dx = (target.x - me.x) / dist, dz = (target.z - me.z) / dist;
      const approach = dist > style.ideal + 1 ? 0.7 : dist < style.ideal - 1.5 ? -0.6 : 0;
      const sideways = me.weapon === 'flamethrower' ? 0.3 : 0.8;
      let mx = -dz * this.strafe * sideways + dx * approach;
      let mz = dx * this.strafe * sideways + dz * approach;
      if (this.blockedAhead(mx, mz)) {
        this.strafe *= -1;
        mx = -dz * this.strafe * sideways + dx * approach;
        mz = dx * this.strafe * sideways + dz * approach;
        if (this.blockedAhead(mx, mz)) { mx = 0; mz = 0; }
      }
      c.moveX = mx;
      c.moveZ = mz;
    }
    this.separate(c);
  }

  /** Aim and fire, whatever we're walking towards. */
  private attack(dt: number, c: Controls, target: Bloc | null, dist: number, canSee: boolean) {
    const me = this.me;
    const style = STYLE[me.weapon];
    if (this.match.outOfAmmo(me)) return; // fists only: brawl() handles it

    // A grenade throw in progress: keep holding until it's charged enough, then let go.
    if (me.weapon === 'grenade' && this.chargeGoal >= 0) {
      if (target) this.aim(c, target, dist, style.speed);
      if (me.charge >= 0 && me.charge < this.chargeGoal) c.attack = true;
      else if (me.charge >= 0) { c.attackReleased = true; this.chargeGoal = -1; }
      else this.chargeGoal = -1;
      return;
    }

    if (me.weapon === 'flamethrower') {
      if (!target || me.fuel <= 0) return;
      this.aim(c, target, dist, style.speed);
      // Only flame when the target is in reach and no teammate is in the way.
      const friendInWay = this.match.blocs.some((b) => b !== me && b.alive && b.team === me.team && inFlames(this.match, me, b));
      if (dist < style.max && canSee && !friendInWay) {
        this.react += dt;
        if (this.react >= this.reactNeed * 0.4) c.attack = true;
      } else {
        this.react = 0;
      }
      return;
    }

    const ready = me.weapon === 'grenade' ? me.ammo > 0 : me.armed;
    if (!target || !ready || !canSee || dist > style.max || dist < style.min || this.friendNear(target, me.weapon)) {
      this.react = Math.max(0, this.react - dt);
      return;
    }
    this.react += dt;
    this.aim(c, target, dist, style.speed);
    if (this.react < this.reactNeed) return;
    this.react = 0;
    this.reactNeed = this.level.reaction * rand(0.7, 1.4) * (me.weapon === 'spear' ? 1 : 1.3);
    c.attackPressed = true;
    c.attack = true;
    if (me.weapon === 'grenade') {
      // Pick how long to hold for the distance (computer players misjudge it a little too).
      const want = clamp(dist + rand(-1, 1) * this.level.aimError * 0.06, GRENADE.minDistance, GRENADE.maxDistance);
      this.chargeGoal = ((want - GRENADE.minDistance) / (GRENADE.maxDistance - GRENADE.minDistance)) * GRENADE.fullChargeTime;
    }
  }

  /** Fists only: get next to the target, face it, and punch when it's in reach. */
  private brawl(dt: number, c: Controls, target: Bloc | null) {
    const me = this.me;
    const inReach = this.match.punchTarget(me);
    const t = inReach ?? target;
    if (!t) return;
    const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz) || 1;
    c.hasAim = true;
    c.aimX = dx / d;
    c.aimZ = dz / d;
    if (inReach) {
      // A short pause before each swing so computer players aren't punching machines.
      this.react += dt;
      if (this.react >= this.level.reaction * 0.35) { c.attack = true; this.react = 0; }
    } else {
      this.goTo({ x: t.x, z: t.z }, c, true);
      this.separate(c);
    }
  }

  /** Splash weapons: don't fire if a teammate is near the target. */
  private friendNear(target: Bloc, weapon: WeaponId) {
    if (weapon !== 'bazooka' && weapon !== 'grenade') return false;
    const r = (weapon === 'bazooka' ? BAZOOKA.blastRadius : GRENADE.blastRadius) + 0.6;
    return this.match.blocs.some((b) => b !== this.me && b.alive && b.team === this.me.team && Math.hypot(b.x - target.x, b.z - target.z) < r);
  }

  private aim(c: Controls, t: Bloc, dist: number, speed: number) {
    const me = this.me;
    const lead = speed === Infinity ? 0 : (dist / speed) * this.level.leadTarget;
    const px = t.x + t.vx * lead, pz = t.z + t.vz * lead;
    const err = ((rand(-1, 1) * this.level.aimError) * Math.PI) / 180;
    const a = Math.atan2(px - me.x, pz - me.z) + err;
    c.hasAim = true;
    c.aimX = Math.sin(a);
    c.aimZ = Math.cos(a);
  }

  private pickTarget(dt: number) {
    const me = this.me;
    this.targetT -= dt;
    if (this.target && this.target.alive && this.targetT > 0) return this.target;
    const myBunny = this.match.blocs.find((b) => b.isBunny && b.team === me.team);
    let best: Bloc | null = null, bestScore = Infinity;
    for (const b of this.match.blocs) {
      if (!b.alive || b.team === me.team) continue;
      let score = Math.hypot(b.x - me.x, b.z - me.z);
      // The bunny is the goal, but blocs shoot back: go for it when it's close or few defenders are left.
      if (b.isBunny) {
        const defenders = this.defenders(b);
        score = score * 2 - (score < 5 ? 8 : 0) - (defenders === 0 ? 20 : defenders === 1 ? 6 : 0);
        // Grenades are few but take 2 hearts: save them for the bunny.
        if (me.weapon === 'grenade') score -= 12;
      }
      if (myBunny?.alive && !b.isBunny && Math.hypot(b.x - myBunny.x, b.z - myBunny.z) < 7) score -= 8;
      score += rand(0, 3);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    this.target = best;
    this.targetT = rand(1.2, 2.5);
    return best;
  }

  private defenders(bunny: Bloc) {
    return this.match.blocs.filter((b) => b.alive && !b.isBunny && b.team === bunny.team).length;
  }

  /** No obstacle and no teammate between us and the target (grenades fly over things). */
  private clearShot(t: Bloc) {
    const me = this.me;
    if (me.weapon === 'grenade') return true;
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

  /** Stand between our bunny and the closest enemy. */
  private guard(c: Controls) {
    const me = this.me;
    const bunny = this.match.blocs.find((b) => b.isBunny && b.team === me.team && b.alive);
    if (!bunny) return;
    const enemy = this.match.blocs
      .filter((b) => b.alive && !b.isBunny && b.team !== me.team)
      .sort((a, b) => Math.hypot(a.x - bunny.x, a.z - bunny.z) - Math.hypot(b.x - bunny.x, b.z - bunny.z))[0];
    let gx = bunny.x, gz = bunny.z + 1.5;
    if (enemy) {
      const dx = enemy.x - bunny.x, dz = enemy.z - bunny.z, l = Math.hypot(dx, dz) || 1;
      gx = bunny.x + (dx / l) * 2;
      gz = bunny.z + (dz / l) * 2;
    }
    const goal = this.match.arena.nav.nearestFree(gx, gz);
    if (Math.hypot(goal.x - me.x, goal.z - me.z) > 0.6) this.goTo(goal, c);
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
