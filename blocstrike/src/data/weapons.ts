// 🗡️ WEAPONS. Each team picks one weapon for the whole match.
// Only the spear is playable so far; the others are listed so the shop can show them.

export type WeaponId = 'spear' | 'bazooka' | 'grenade' | 'flamethrower';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  price: number; // bloccoins, 0 = free
  ready: boolean; // false = not built yet
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  spear: {
    id: 'spear',
    name: 'Spear',
    price: 0,
    ready: true,
    description: 'Throw it, then go get it back. Pierces up to two blocs!',
  },
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    price: 50,
    ready: false,
    description: 'Rocket with a small blast. 10 seconds to reload.',
  },
  grenade: {
    id: 'grenade',
    name: 'Big Grenade',
    price: 50,
    ready: false,
    description: 'Big blast, only 3 per player. Hold longer to throw further.',
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    price: 50,
    ready: false,
    description: 'Short range, burns everyone in front (teammates too!). 20 seconds of fuel.',
  },
};

export const SPEAR = {
  speed: 20, // units per second
  range: 12, // how far it flies before dropping
  maxKills: 2, // pierces this many blocs, then drops
  pickupRadius: 1.05,
  /** If it lands in water, it washes back to its owner after this many seconds. */
  waterReturn: 3,
};
