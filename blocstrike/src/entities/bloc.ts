import { TUNING } from '../data/tuning';
import type { TeamDef } from '../data/teams';
import { BlocView } from './blocView';
import type { Spear } from './spear';

/** alive → dead (remains on the ground, can be revived) ; eaten/gone = out for good. */
export type LifeState = 'alive' | 'dead' | 'eaten' | 'gone';

let nextId = 1;

export class Bloc {
  readonly id = nextId++;
  readonly view: BlocView;
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  yaw: number;
  /** Unit direction the bloc aims/throws in. */
  aimX: number;
  aimZ: number;
  state: LifeState = 'alive';
  hp: number;
  readonly radius: number;
  readonly speed: number;
  spear: Spear | null = null;
  holdingSpear = false;
  dashCooldown = 0;
  dashTime = 0;
  dashX = 0;
  dashZ = 0;
  revivesLeft: number = TUNING.revive.perPlayer;
  /** On a dead bloc: how far along a teammate is in reviving it. */
  reviveProgress = 0;
  /** Seconds of protection after being revived. */
  shield = 0;
  /** Spear ids this AI already decided to dodge or not. */
  readonly seenSpears = new Set<number>();

  constructor(
    readonly kind: 'bloc' | 'robot',
    readonly team: TeamDef,
    x: number,
    z: number,
    readonly human: number | null,
  ) {
    this.x = x;
    this.z = z;
    const faceX = x < 0 ? 1 : -1;
    this.aimX = faceX;
    this.aimZ = 0;
    this.yaw = Math.atan2(faceX, 0);
    const robot = kind === 'robot';
    this.hp = robot ? TUNING.robot.hp : 1;
    this.radius = robot ? TUNING.robot.radius : TUNING.bloc.radius;
    this.speed = robot ? TUNING.robot.speed : TUNING.bloc.speed;
    this.view = new BlocView(kind, team, human !== null ? `P${human + 1}` : null);
    this.view.root.position.set(x, 0, z);
    this.view.snapYaw(this.yaw);
    if (robot) this.view.setHearts(this.hp, this.hp);
  }

  get alive() {
    return this.state === 'alive';
  }

  get isRobot() {
    return this.kind === 'robot';
  }
}
