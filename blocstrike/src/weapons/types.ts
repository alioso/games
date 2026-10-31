import type { Controls } from '@engine/input';
import type { Bloc } from '../entities/bloc';
import type { WeaponId } from '../data/weapons';

/** Something flying that a computer player may want to sidestep. */
export interface Threat {
  id: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  owner: Bloc;
}

/** A spot about to explode. */
export interface Danger {
  id: number;
  x: number;
  z: number;
  r: number;
}

export interface WeaponStatus {
  ready: number; // 0..1 for the HUD bar
  label: string;
}

/** One instance per weapon type in a round; it handles every bloc carrying that weapon. */
export interface Weapon {
  readonly id: WeaponId;
  attach(b: Bloc): void;
  control(b: Bloc, c: Controls, dt: number): void;
  update(dt: number): void;
  render(dt: number): void;
  onDeath(b: Bloc, dirX: number, dirZ: number): void;
  onEaten(b: Bloc): void;
  status(b: Bloc): WeaponStatus;
  threats(): Threat[];
  dangers(): Danger[];
  /** Light saber: send flying things near (x, z) back. Returns how many. */
  deflect?(by: Bloc, x: number, z: number, r: number): number;
  dispose(): void;
}
