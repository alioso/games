import { TUNING } from '../data/tuning';
import type { TeamDef } from '../data/teams';
import { FLAMETHROWER, GRENADE, MACHINEGUN, type WeaponId } from '../data/weapons';
import { BlocView, type ActorView, type BlocLook } from './blocView';
import { BunnyView } from './bunnyView';
import type { Spear } from './spear';

/** alive → dead (remains on the ground, can be revived) ; eaten/gone = out for good. */
export type LifeState = 'alive' | 'dead' | 'eaten' | 'gone';

let nextId = 1;

export class Bloc {
  readonly id = nextId++;
  readonly view: ActorView;
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  /** Push from explosions, added on top of walking. */
  kbX = 0;
  kbZ = 0;
  yaw: number;
  /** Unit direction the bloc aims/throws in. */
  aimX: number;
  aimZ: number;
  state: LifeState = 'alive';
  hp: number;
  readonly radius: number;
  readonly speed: number;

  // Weapon state. Only the fields for the team's weapon are used.
  spear: Spear | null = null;
  /** Spear in hand / rocket loaded / grenade in hand / flamethrower ready. */
  armed = true;
  reload = 0; // bazooka: seconds until the next rocket
  ammo: number = GRENADE.perPlayer; // grenades left
  charge = -1; // grenade: seconds the throw button has been held (-1 = not charging)
  fuel: number = FLAMETHROWER.fuel;
  firing = false; // flamethrower on
  /** Seconds spent in someone's flames. */
  burn = 0;
  /** Punches taken (blocs: knocked out at PUNCH.toKnockOut; bunnies: a heart every PUNCH.perBunnyHeart). */
  punches = 0;
  punchCooldown = 0;

  /** Jump (blocs) or dodge-hop (bunnies) cooldown. */
  jumpCooldown = 0;
  /** Seconds left bending the legs before a jump. */
  crouch = 0;
  /** Seconds left in the air. */
  air = 0;
  jumpX = 0;
  jumpZ = 0;
  /** Bunny dodge-hop: seconds left. */
  hop = 0;
  /** Machine gun: seconds of firing left before it must reload. */
  mag: number = MACHINEGUN.fireTime;
  /** Bullets a bunny has taken towards its next lost heart. */
  bulletHits = 0;
  revivesLeft: number = TUNING.revive.perPlayer;
  /** On a dead bloc: how far along a teammate is in reviving it. */
  reviveProgress = 0;
  /** Seconds of protection after being revived. */
  shield = 0;
  /** Projectile ids this AI already decided to dodge or not. */
  readonly seen = new Set<number>();

  constructor(
    readonly kind: 'bloc' | 'bunny',
    readonly team: TeamDef,
    x: number,
    z: number,
    readonly human: number | null,
    readonly weapon: WeaponId,
    look: BlocLook = { skin: 'beginner', hat: null },
  ) {
    this.x = x;
    this.z = z;
    const faceX = x < 0 ? 1 : -1;
    this.aimX = faceX;
    this.aimZ = 0;
    this.yaw = Math.atan2(faceX, 0);
    const bunny = kind === 'bunny';
    this.hp = bunny ? TUNING.bunny.hp : 1;
    this.radius = bunny ? TUNING.bunny.radius : TUNING.bloc.radius;
    this.speed = bunny ? TUNING.bunny.speed : TUNING.bloc.speed;
    this.view = bunny
      ? new BunnyView(team)
      : new BlocView(team, human !== null ? `P${human + 1}` : null, look, weapon);
    this.view.root.position.set(x, 0, z);
    this.view.snapYaw(this.yaw);
    if (bunny) this.view.setHearts(this.hp, this.hp);
  }

  get alive() {
    return this.state === 'alive';
  }

  get airborne() {
    return this.air > 0;
  }

  get isBunny() {
    return this.kind === 'bunny';
  }
}
