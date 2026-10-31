// 🗡️ WEAPONS. You pick yours in Play; computer players get random ones.

export type WeaponId = 'spear' | 'sword' | 'lightsaber' | 'hammer' | 'crossbow' | 'bazooka' | 'grenade' | 'flamethrower' | 'machinegun';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  price: number; // bloccoins, 0 = free
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  spear: {
    id: 'spear',
    name: 'Spear',
    icon: '🗡️',
    price: 0,
    description: 'Throw it, then go get it back. Pierces up to two blocs!',
  },
  sword: {
    id: 'sword',
    name: 'Sword',
    icon: '⚔️',
    price: 50,
    description: 'Always in your hand, never reloads. You have to get close!',
  },
  lightsaber: {
    id: 'lightsaber',
    name: 'Light Saber',
    icon: '✨',
    price: 80,
    description: 'Longer reach and faster than the sword. Slash at spears, bolts and bullets to send them back!',
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    icon: '🔨',
    price: 60,
    description: 'Slow but mighty: SMASH! Knocks everyone around flying (into the water?) and breaks trees and rocks.',
  },
  crossbow: {
    id: 'crossbow',
    name: 'Crossbow',
    icon: '🏹',
    price: 60,
    description: 'Fast bolts that fly really far and pierce two blocs. Reloads by itself.',
  },
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    icon: '🚀',
    price: 50,
    description: 'Rocket with a small blast. 3 seconds to reload.',
  },
  grenade: {
    id: 'grenade',
    name: 'Big Grenade',
    icon: '💣',
    price: 50,
    description: 'Big blast, 5 per player. Hold longer to throw further.',
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    icon: '🔥',
    price: 50,
    description: 'Short range, burns everyone in front (teammates too!). 20 seconds of fuel.',
  },
  machinegun: {
    id: 'machinegun',
    name: 'Machine Gun',
    icon: '🔫',
    price: 50,
    description: 'Hold to spray bullets for 2 seconds, then 2 seconds to reload. 2 bullets knock out a bloc.',
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const SPEAR = {
  speed: 20, // units per second
  range: 12, // how far it flies before dropping
  maxKills: 2, // pierces this many blocs, then drops
  pickupRadius: 1.05,
  /** If it lands in water, it washes back to its owner after this many seconds. */
  waterReturn: 3,
};

export const BAZOOKA = {
  speed: 15,
  range: 15,
  reload: 3, // seconds
  blastRadius: 1.5, // "damage around but not too much"
  pushRadius: 3.2, // blocs in here get pushed (maybe into the pond!)
  push: 9,
  bunnyDamage: 1, // hearts
};

export const GRENADE = {
  perPlayer: 5, // per round
  minDistance: 3,
  maxDistance: 12,
  fullChargeTime: 1.1, // seconds of holding for the longest throw
  flightTime: 0.75,
  fuse: 1.2, // seconds from throw to boom
  blastRadius: 2.6, // more than the bazooka
  pushRadius: 4.6,
  push: 12,
  bunnyDamage: 2, // hearts: "more damage than the bazooka"
};

export const FLAMETHROWER = {
  fuel: 20, // seconds of flames per round
  range: 3.8,
  coneDeg: 28, // half-angle of the flame cone
  burnTime: 0.15, // seconds in the flames before a bloc is out
  bunnyBurnTime: 0.8, // seconds in the flames per bunny heart
};

/** When grenades or fuel run out, the attack button punches instead. Punches only hurt the other team. */
export const PUNCH = {
  reach: 0.45, // gap between the two bodies
  coneDeg: 70, // how far off to the side still counts as "in front"
  cooldown: 0.3, // seconds between punches
  toKnockOut: 5, // punches to knock out a bloc
  perBunnyHeart: 2, // punches per bunny heart
  push: 5,
};

/** Melee weapons: how far they reach (gap between bodies), how wide the swing is, and how often you can swing. */
export interface MeleeDef {
  reach: number;
  arcDeg: number; // half-angle of the swing in front of you
  cooldown: number; // seconds between swings
}

export const SWORD: MeleeDef = { reach: 0.95, arcDeg: 65, cooldown: 0.45 };

export const LIGHTSABER: MeleeDef & { deflectRadius: number } = {
  reach: 1.3,
  arcDeg: 70,
  cooldown: 0.3,
  deflectRadius: 2.2, // flying things this close in front get sent back
};

export const HAMMER: MeleeDef & { smashRadius: number; pushRadius: number; push: number } = {
  reach: 1.0,
  arcDeg: 50,
  cooldown: 1.0, // slow
  smashRadius: 1.4, // everyone this close to where it lands is knocked out
  pushRadius: 3.4, // everyone this close is knocked back
  push: 16,
};

export const MELEE: Partial<Record<WeaponId, MeleeDef>> = { sword: SWORD, lightsaber: LIGHTSABER, hammer: HAMMER };

export const CROSSBOW = {
  speed: 34,
  range: 22, // much further than the spear
  reload: 1.8, // seconds, by itself
  maxKills: 2,
};

export const MACHINEGUN = {
  fireTime: 2, // seconds of shooting...
  reload: 2, // ...then seconds of reloading
  rate: 6, // bullets per second
  speed: 15, // slow enough to see them coming and step aside
  range: 9,
  spreadDeg: 12, // sprays: less accurate the further away you are
  bulletsToKnockOut: 2, // bullets to knock out a bloc
  bulletsPerHeart: 6, // bullets to take one bunny heart
  bunnyTarget: 0.5, // bunnies are small: bullets only hit the middle half of them
};
