// 🗡️ WEAPONS. Each team picks one weapon for the whole match.

export type WeaponId = 'spear' | 'bazooka' | 'grenade' | 'flamethrower';

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
