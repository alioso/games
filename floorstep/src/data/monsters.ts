// The five monsters, when they show up, and what they can do at each appearance.
import type { FurnitureKind } from './furniture';
import type { RoomType } from './rooms';
import type { Difficulty } from './tuning';

export type MonsterName = 'Gribbles' | 'Claught' | 'Zegron' | 'Sieger' | 'Slashner';
export const ORDER: MonsterName[] = ['Gribbles', 'Claught', 'Zegron', 'Sieger', 'Slashner'];

export interface MonsterAttack {
  /** Name of the move (also picks the animation). */
  id: string;
  /**
   * melee: blows land at `hits` · dash: rushes at you · leap: jumps onto a marked spot ·
   * throw: lobs things · burrow: tunnels under the floor and bursts up ·
   * vanish: turns invisible, sneaks up, then does `follow` · teleport: poofs behind you, then `follow`.
   */
  kind: 'melee' | 'dash' | 'leap' | 'throw' | 'burrow' | 'vanish' | 'teleport';
  /** Wind-up you can see coming, then the blow(s), then a window where it's open. */
  tell: number;
  hits: number[];
  recover: number;
  damage: number;
  reach: number;
  arc: number;
  /** Use it from this far away. */
  range: [number, number];
  /** From which appearance on (1 = always, 2 = when it comes back, 3 = the third time). */
  from: number;
  /** Dashes: speed and how long; crashing into a wall leaves it dizzy this long. */
  speed?: number;
  duration?: number;
  wallStun?: number;
  /** Shoves you back this far when it hits. */
  push?: number;
  /** Spins round while striking (hits all around). */
  spin?: boolean;
  /** Leaps: how high. */
  height?: number;
  /** Throws: what, how many, how spread out. */
  projectile?: { kind: 'crate' | 'acid' | 'blade'; count: number; speed: number; spread: number };
  /** Vanish: seconds invisible. */
  hide?: number;
  /** The attack that comes after a vanish, teleport or burrow. */
  follow?: string;
  /** How often it's picked when several fit (default 1). */
  weight?: number;
}

export interface MonsterDef {
  name: MonsterName;
  maxHp: number;
  radius: number;
  walk: number;
  run: number;
  attacks: MonsterAttack[];
  /** Damage taken from the front while it's not off balance (armoured monsters). */
  armor?: number;
  /** Third appearance: calls little helpers. */
  minions?: { count: number; every: number };
  lines: { spot: string[]; hurt: string[]; flee: string[]; die: string[]; taunt: string[] };
}

const melee = (id: string, tell: number, hits: number[], recover: number, damage: number, reach: number, arc: number, range: [number, number], from = 1, extra: Partial<MonsterAttack> = {}): MonsterAttack =>
  ({ id, kind: 'melee', tell, hits, recover, damage, reach, arc, range, from, ...extra });

export const MONSTERS: Record<MonsterName, MonsterDef> = {
  Gribbles: {
    name: 'Gribbles',
    maxHp: 14,
    radius: 0.32,
    walk: 1.6,
    run: 3.1,
    attacks: [
      melee('swipe', 0.55, [0.55], 0.75, 1, 1.15, 70, [0, 1.3]),
      melee('bite', 0.4, [0.4, 0.7], 0.85, 1, 0.95, 50, [0, 1.1]),
      { id: 'lunge', kind: 'dash', tell: 0.65, hits: [0.65], recover: 1.1, damage: 2, reach: 0.9, arc: 60, range: [2.4, 4.2], from: 1, speed: 6.5, duration: 0.35 },
      { id: 'pounce', kind: 'leap', tell: 0.9, hits: [1.45], recover: 1.0, damage: 2, reach: 1.1, arc: 360, range: [3, 6.5], from: 2, height: 1.6, weight: 1.5 },
    ],
    minions: { count: 3, every: 14 },
    lines: {
      spot: ['Fresh meat!', 'Hee hee! A visitor!', 'Mine! All mine!', 'Grib grib grib!'],
      hurt: ['Ow!', 'Yeep!', 'Not the face!', 'Rude!'],
      flee: ['You\'ll pay for that! Upstairs!', 'Mommy! ...I mean: see you upstairs!', 'This isn\'t over!'],
      die: ['Gribbles... is... done...', 'Tell my rats... I loved them...'],
      taunt: ['Nya nya!', 'Too slow!', 'Tickles!'],
    },
  },
  Claught: {
    // A huge, slow crab-bear. Hits like a falling wardrobe, but takes ages to get going.
    name: 'Claught',
    maxHp: 24,
    radius: 0.55,
    walk: 1.0,
    run: 2.2,
    attacks: [
      melee('slam', 0.85, [0.85], 1.3, 2.5, 1.6, 65, [0, 1.8], 1, { push: 1.2 }),
      melee('pinch', 0.5, [0.5, 0.85], 1.0, 1.5, 1.45, 55, [0, 1.6]),
      { id: 'throw', kind: 'throw', tell: 0.8, hits: [0.8], recover: 0.9, damage: 2, reach: 1.0, arc: 360, range: [3, 9], from: 2, projectile: { kind: 'crate', count: 1, speed: 7, spread: 0 }, weight: 1.4 },
      { id: 'burrow', kind: 'burrow', tell: 0.7, hits: [0], recover: 1.4, damage: 2.5, reach: 1.3, arc: 360, range: [2.5, 10], from: 3, speed: 3.2, duration: 2.6, weight: 1.3 },
    ],
    lines: {
      spot: ['CLAUGHT HUNGRY.', 'Little snack walks in...', 'Snip snip.'],
      hurt: ['Grrrumph.', 'That tickled. A bit.', 'OW. Big ow.'],
      flee: ['CLAUGHT GO UPSTAIRS. CLAUGHT BACK SOON.', 'You made Claught grumpy!'],
      die: ['Claught... sleepy... now...', 'Tell mama crab... sorry...'],
      taunt: ['SNIP!', 'Squish!', 'Too small!'],
    },
  },
  Zegron: {
    // A sneaky chameleon: long tongue, whippy tail, goes invisible, then spits acid.
    name: 'Zegron',
    maxHp: 18,
    radius: 0.35,
    walk: 1.8,
    run: 3.4,
    attacks: [
      melee('tongue', 0.45, [0.45], 0.8, 1, 2.6, 18, [1.0, 2.7]),
      melee('tail', 0.5, [0.5], 0.85, 1.5, 1.4, 360, [0, 1.4], 1, { spin: true }),
      melee('swipe', 0.4, [0.4], 0.7, 1, 1.1, 70, [0, 1.2]),
      { id: 'vanish', kind: 'vanish', tell: 0.5, hits: [0], recover: 0, damage: 0, reach: 0, arc: 0, range: [1.5, 8], from: 2, hide: 3.2, follow: 'swipe', weight: 1.4 },
      { id: 'spit', kind: 'throw', tell: 0.6, hits: [0.6, 0.85, 1.1], recover: 0.9, damage: 1, reach: 0.7, arc: 360, range: [3, 8], from: 3, projectile: { kind: 'acid', count: 1, speed: 8, spread: 0.6 }, weight: 1.3 },
    ],
    lines: {
      spot: ['I see you... do you see ME?', 'Sssslurp.', 'Fresh flies!'],
      hurt: ['Hsss!', 'My scales!', 'Rude reptile-ist!'],
      flee: ['Now you see me... now you don\'t!', 'Sssee you upstairs!'],
      die: ['Zegron... fading... for real this time...', 'Ssssso unfair...'],
      taunt: ['Over here!', 'Peekaboo!', 'Sssslow!'],
    },
  },
  Sieger: {
    // An armoured beetle-knight: hits from the front just bounce off. Get round the back!
    name: 'Sieger',
    maxHp: 20,
    radius: 0.42,
    walk: 1.4,
    run: 2.8,
    armor: 0.2,
    attacks: [
      melee('jab', 0.5, [0.5], 0.8, 1.5, 1.9, 25, [0, 2.0]),
      melee('shove', 0.4, [0.4], 0.9, 1, 1.15, 70, [0, 1.2], 1, { push: 1.6 }),
      { id: 'charge', kind: 'dash', tell: 0.85, hits: [0.85], recover: 1.0, damage: 2.5, reach: 0.9, arc: 70, range: [3, 9], from: 2, speed: 8, duration: 1.1, wallStun: 2.2, push: 1.5, weight: 1.5 },
      { id: 'dive', kind: 'leap', tell: 1.0, hits: [1.8], recover: 1.2, damage: 2.5, reach: 1.3, arc: 360, range: [3, 8], from: 3, height: 3, weight: 1.3 },
    ],
    lines: {
      spot: ['HALT! In the name of... me!', 'A challenger approaches!', 'En garde!'],
      hurt: ['Not the back!', 'Unchivalrous!', 'Ow, my shell!'],
      flee: ['A tactical retreat! Upstairs!', 'Sieger never runs! ...Sieger strolls quickly!'],
      die: ['A worthy... foe...', 'Polish... my shell... at my funeral...'],
      taunt: ['Clang! Ha!', 'My armour laughs at you!', 'Is that all?'],
    },
  },
  Slashner: {
    // The scarecrow with blades for hands: fast combos, teleports behind you, throws spinning blades.
    name: 'Slashner',
    maxHp: 22,
    radius: 0.36,
    walk: 1.7,
    run: 3.3,
    attacks: [
      melee('slash', 0.45, [0.45, 0.7, 0.95], 0.95, 1, 1.4, 80, [0, 1.5]),
      melee('spin', 0.65, [0.65, 0.9, 1.15], 1.1, 1, 1.5, 360, [0, 1.5], 1, { spin: true }),
      { id: 'teleport', kind: 'teleport', tell: 0.5, hits: [0], recover: 0, damage: 0, reach: 0, arc: 0, range: [2, 12], from: 2, follow: 'slash', weight: 1.4 },
      { id: 'blades', kind: 'throw', tell: 0.65, hits: [0.65], recover: 1.0, damage: 1.5, reach: 0.5, arc: 360, range: [3, 10], from: 3, projectile: { kind: 'blade', count: 3, speed: 7, spread: 0.5 }, weight: 1.3 },
    ],
    lines: {
      spot: ['Snip... snip... SNIP.', 'Stay for dinner. Forever.', 'Hello, little crow.'],
      hurt: ['My straw!', 'You\'ll stitch for that!', 'Hrrk!'],
      flee: ['The crows will tell me where you go...', 'Upstairs. I\'ll be waiting.'],
      die: ['Just... straw... after all...', 'Someone... re-stuff me...'],
      taunt: ['Snip!', 'Too slow, crow!', 'Shhhk!'],
    },
  },
};

/** How many times each monster shows up (and so how many floors it covers). */
export const APPEARANCES: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Which monster haunts a floor, and which of its appearances this is (1-based). */
export function monsterFor(d: Difficulty, floor: number): { name: MonsterName; appearance: number } {
  const n = APPEARANCES[d];
  return { name: ORDER[Math.floor((floor - 1) / n) % ORDER.length], appearance: ((floor - 1) % n) + 1 };
}

/** Where the health bar breaks: it flees at each mark, and dies at 0 on its last appearance. */
export function fleeAt(def: MonsterDef, d: Difficulty, appearance: number) {
  const n = APPEARANCES[d];
  return appearance >= n ? 0 : (def.maxHp * (n - appearance)) / n;
}

// ---------- hints about where the key is ----------

const ROOM_NAMES: Record<RoomType, string> = {
  landing: 'landing', kitchen: 'kitchen', bedroom: 'bedroom', bathroom: 'bathroom', library: 'library',
  living: 'living room', dining: 'dining room', nursery: 'nursery', study: 'study', storage: 'storage room',
};

const THINGS: Partial<Record<FurnitureKind, [string, string]>> = {
  // [plain name, riddle]
  wardrobe: ['wardrobe', 'Where coats hang out in the dark...'],
  bookcase: ['bookcase', 'Behind a wall of stories...'],
  chest: ['chest', 'In a box with a lid and a lock...'],
  dresser: ['drawers', 'Where socks sleep in rows...'],
  crate: ['crate', 'In wood that wants to be broken...'],
  barrel: ['barrel', 'Round and wooden, with a hat on top...'],
  vase: ['vase', 'Where flowers would drink, if there were flowers...'],
  laundry: ['laundry', 'Under the stinkiest pile...'],
  bed: ['bed', 'Where the monsters usually hide... underneath!'],
  toilet: ['toilet', 'Where nobody wants to look... lift it!'],
  bathtub: ['bathtub', 'In water nobody has drained...'],
  sinkCab: ['sink cabinet', 'Under the tap that drips...'],
  oven: ['oven', 'Somewhere warm, where pies go...'],
  fridge: ['fridge', 'Somewhere cold, next to old cheese...'],
  counter: ['kitchen cupboard', 'Behind a door with pots and pans...'],
  table: ['table', 'Under where dinner is served...'],
  sofa: ['sofa', 'Between soft cushions...'],
  armchair: ['armchair', 'In a comfy chair\'s pocket...'],
  fireplace: ['fireplace', 'Where it\'s hot and ashy...'],
  painting: ['painting', 'Behind a face that watches you...'],
  toybox: ['toy box', 'Among things children forgot...'],
  cradle: ['cradle', 'Where babies are rocked...'],
  desk: ['desk', 'In the drawers of someone who writes...'],
  clock: ['clock', 'Where time ticks and tocks...'],
  piano: ['piano', 'Under the lid that sings...'],
  plant: ['plant pot', 'In the dirt where something green grows...'],
  trash: ['trash can', 'In the bin. Yes, the bin.'],
  sack: ['sack', 'In a bag tied with string...'],
  rug: ['rug', 'Under your feet, under the carpet...'],
  boxes: ['boxes', 'In a pile of boxes...'],
};

/** What a beaten monster blurts out about the key, depending on difficulty. */
export function keyHint(d: Difficulty, room: RoomType, thing: FurnitureKind) {
  const t = THINGS[thing] ?? [thing, 'Somewhere... somewhere...'];
  if (d === 'easy') return `The key? It's in the ${ROOM_NAMES[room]}! In the ${t[0]}!`;
  if (d === 'medium') return `Fine! Look in the ${ROOM_NAMES[room]}...`;
  return t[1];
}
