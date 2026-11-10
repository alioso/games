// The eight teams. They all play exactly the same; only the animals and the kits differ.
// Names are placeholders: rename them here.

export type Animal = 'bunny' | 'pig' | 'dog' | 'cat' | 'duck' | 'raccoon' | 'bear' | 'mouse' | 'owl';

export interface Kit {
  shirt: number;
  /** Second shirt colour (stripes, sleeves, collar). */
  trim: number;
  shorts: number;
  socks: number;
  /** Shirt number colour. */
  number: number;
}

export interface Team {
  id: Animal;
  name: string;
  /** Three letters for the scoreboard. */
  short: string;
  /** Fur, and the lighter fur (muzzle, belly, inner ears). */
  fur: number;
  fur2: number;
  home: Kit;
  away: Kit;
  keeper: Kit;
}

const kit = (shirt: number, trim: number, shorts: number, socks: number, number: number): Kit => ({ shirt, trim, shorts, socks, number });

/** The referee: a wise old owl, all in black. */
const REF_KIT: Kit = { shirt: 0x1c1c22, trim: 0xf2d230, shorts: 0x1c1c22, socks: 0x1c1c22, number: 0xf2d230 };
export const REFEREE: Team = { id: 'owl', name: 'Referee', short: 'REF', fur: 0x8a6a48, fur2: 0xeadcc0, home: REF_KIT, away: REF_KIT, keeper: REF_KIT };

export const TEAMS: Team[] = [
  {
    id: 'bunny', name: 'Baby Bunnies', short: 'BUN', fur: 0xf2ece4, fur2: 0xf6b8c8,
    home: kit(0x7cc4f0, 0xffffff, 0xffffff, 0x7cc4f0, 0xffffff), away: kit(0xf08cb4, 0xffffff, 0xf08cb4, 0xffffff, 0xffffff),
    keeper: kit(0x3a3a48, 0xf0d040, 0x3a3a48, 0x3a3a48, 0xf0d040),
  },
  {
    id: 'pig', name: 'Mudbath United', short: 'MUD', fur: 0xf4a8b0, fur2: 0xe07888,
    home: kit(0x2e8a4e, 0xffffff, 0xffffff, 0x2e8a4e, 0xffffff), away: kit(0xf4f0e6, 0x2e8a4e, 0x2e8a4e, 0xf4f0e6, 0x2e8a4e),
    keeper: kit(0xf0a020, 0x222222, 0x222222, 0xf0a020, 0x222222),
  },
  {
    id: 'dog', name: 'Woof Wanderers', short: 'WOF', fur: 0xc8884a, fur2: 0xf0dcc0,
    home: kit(0xd8302c, 0xffffff, 0xffffff, 0xd8302c, 0xffffff), away: kit(0x1e2a5a, 0xf0c040, 0x1e2a5a, 0x1e2a5a, 0xf0c040),
    keeper: kit(0x40c060, 0x111111, 0x111111, 0x40c060, 0x111111),
  },
  {
    id: 'cat', name: 'Whisker City', short: 'WHI', fur: 0xf09040, fur2: 0xfbe8d0,
    home: kit(0xf4d030, 0x1a1a1a, 0x1a1a1a, 0xf4d030, 0x1a1a1a), away: kit(0x7a3cb4, 0xffffff, 0x7a3cb4, 0x7a3cb4, 0xffffff),
    keeper: kit(0x30b0d0, 0x111111, 0x111111, 0x30b0d0, 0x111111),
  },
  {
    id: 'duck', name: 'Puddle Rovers', short: 'PUD', fur: 0xfaf6ea, fur2: 0xf0a020,
    home: kit(0x2a5ad8, 0xffffff, 0xffffff, 0x2a5ad8, 0xffffff), away: kit(0xf07c1c, 0x1a1a1a, 0x1a1a1a, 0xf07c1c, 0x1a1a1a),
    keeper: kit(0xc8e040, 0x1a1a1a, 0x1a1a1a, 0xc8e040, 0x1a1a1a),
  },
  {
    id: 'raccoon', name: 'Dustbin Athletic', short: 'BIN', fur: 0x8a8a90, fur2: 0xe8e4dc,
    home: kit(0x5a2a8a, 0xa8e040, 0x1a1a1a, 0x5a2a8a, 0xa8e040), away: kit(0xa8e040, 0x1a1a1a, 0xa8e040, 0x1a1a1a, 0x1a1a1a),
    keeper: kit(0xe85030, 0x111111, 0x111111, 0xe85030, 0x111111),
  },
  {
    id: 'bear', name: 'Honeypot Grizzlies', short: 'HNY', fur: 0x8a5a34, fur2: 0xd8b088,
    home: kit(0xf08a1a, 0x1a1a1a, 0x1a1a1a, 0xf08a1a, 0x1a1a1a), away: kit(0x1a9a9a, 0xffffff, 0xffffff, 0x1a9a9a, 0xffffff),
    keeper: kit(0x9a40c0, 0xffffff, 0xffffff, 0x9a40c0, 0xffffff),
  },
  {
    id: 'mouse', name: 'Cheddar Town', short: 'CHZ', fur: 0xa8988c, fur2: 0xf4b8b8,
    home: kit(0xf6e05a, 0xd02a2a, 0xd02a2a, 0xf6e05a, 0xd02a2a), away: kit(0xd02a2a, 0xf6e05a, 0xd02a2a, 0xd02a2a, 0xf6e05a),
    keeper: kit(0x2a2a2a, 0x40c060, 0x2a2a2a, 0x2a2a2a, 0x40c060),
  },
];

export const teamById = (id: Animal) => TEAMS.find((t) => t.id === id)!;

/** Formation slots, by shirt number: keeper, two defenders, three midfielders, a striker. */
export const NUMBERS = [1, 2, 3, 4, 6, 8, 9];

/** Colours too close to tell apart on the pitch? */
export function clash(a: number, b: number) {
  const ra = (a >> 16) & 255, ga = (a >> 8) & 255, ba = a & 255;
  const rb = (b >> 16) & 255, gb = (b >> 8) & 255, bb = b & 255;
  return Math.hypot(ra - rb, ga - gb, ba - bb) < 120;
}

/** The away team changes to its away kit if the shirts look too alike (and the keepers never match either). */
export function kitsFor(home: Team, away: Team): [Kit, Kit] {
  const awayKit = clash(home.home.shirt, away.home.shirt) ? away.away : away.home;
  return [home.home, awayKit];
}
