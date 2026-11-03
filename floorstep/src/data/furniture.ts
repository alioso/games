// Furniture: size, how you search it, and what the hero does while searching.
// Sizes are [along the wall, depth out from the wall, height]. Models face +z (away from their wall).

export type SearchAction =
  | 'open' // doors, lids, drawers swing open
  | 'push' // slides aside to show what's behind
  | 'under' // hero crouches and looks underneath
  | 'smash' // breaks into pieces
  | 'dig' // rummage: things fly out
  | 'lift' // a lid or a rug comes up
  | 'pull' // a painting swings away from the wall
  | 'none';

export type FurnitureKind =
  | 'wardrobe' | 'bookcase' | 'chest' | 'dresser' | 'crate' | 'barrel' | 'vase' | 'laundry'
  | 'bed' | 'toilet' | 'bathtub' | 'sinkCab' | 'oven' | 'fridge' | 'counter' | 'table'
  | 'sofa' | 'armchair' | 'fireplace' | 'painting' | 'toybox' | 'cradle' | 'desk' | 'clock'
  | 'piano' | 'plant' | 'trash' | 'sack' | 'rug' | 'boxes'
  | 'coatrack' | 'lamp' | 'candles' | 'chair';

export interface FurnitureDef {
  size: readonly [number, number, number];
  search: SearchAction;
  /** Prompt text, e.g. "Open wardrobe". */
  verb: string;
  /** Seconds of searching. */
  time: number;
  /** Placement: against a wall (default), hung on a wall, or in the middle of the room. */
  place?: 'wall' | 'hung' | 'center';
  /** Walks-through: rugs don't block. */
  flat?: boolean;
  /** Something can fly out of it (bats live in tall dark things, mice in low ones). */
  critter?: 'bat' | 'mouse';
  /** Gives light in the room. */
  light?: { y: number; color: number; intensity: number; distance: number; flicker?: number };
}

export const FURNITURE: Record<FurnitureKind, FurnitureDef> = {
  wardrobe: { size: [1.3, 0.62, 2.0], search: 'open', verb: 'Open wardrobe', time: 0.9, critter: 'bat' },
  bookcase: { size: [1.4, 0.45, 2.1], search: 'push', verb: 'Push bookcase', time: 1.3 },
  chest: { size: [1.0, 0.62, 0.66], search: 'open', verb: 'Open chest', time: 0.9, critter: 'mouse' },
  dresser: { size: [1.2, 0.5, 1.0], search: 'open', verb: 'Open drawers', time: 1.0, critter: 'mouse' },
  crate: { size: [0.8, 0.8, 0.8], search: 'smash', verb: 'Smash crate', time: 0.7, critter: 'mouse' },
  barrel: { size: [0.72, 0.72, 0.95], search: 'open', verb: 'Open barrel', time: 0.8 },
  vase: { size: [0.46, 0.46, 0.85], search: 'smash', verb: 'Smash vase', time: 0.5 },
  laundry: { size: [0.95, 0.8, 0.45], search: 'dig', verb: 'Dig through laundry', time: 1.2, critter: 'mouse' },
  bed: { size: [1.45, 2.1, 0.72], search: 'under', verb: 'Look under bed', time: 1.1, critter: 'mouse' },
  toilet: { size: [0.56, 0.72, 0.8], search: 'lift', verb: 'Lift toilet lid', time: 0.8 },
  bathtub: { size: [1.75, 0.82, 0.6], search: 'dig', verb: 'Check the bathtub', time: 1.0 },
  sinkCab: { size: [0.9, 0.52, 0.9], search: 'open', verb: 'Open cabinet', time: 0.8, critter: 'mouse' },
  oven: { size: [0.9, 0.66, 0.95], search: 'open', verb: 'Open oven', time: 0.8 },
  fridge: { size: [0.82, 0.72, 1.9], search: 'open', verb: 'Open fridge', time: 0.8 },
  counter: { size: [1.0, 0.62, 0.92], search: 'open', verb: 'Open cupboard', time: 0.8, critter: 'mouse' },
  table: { size: [1.9, 1.05, 0.76], search: 'under', verb: 'Look under table', time: 0.9, place: 'center' },
  sofa: { size: [1.95, 0.88, 0.86], search: 'dig', verb: 'Check cushions', time: 1.0 },
  armchair: { size: [0.92, 0.86, 0.92], search: 'dig', verb: 'Check cushions', time: 0.8 },
  fireplace: {
    size: [1.6, 0.62, 1.45], search: 'dig', verb: 'Poke the ashes', time: 1.2,
    light: { y: 0.6, color: 0xff8a3a, intensity: 9, distance: 8, flicker: 0.35 },
  },
  painting: { size: [0.95, 0.08, 0.75], search: 'pull', verb: 'Peek behind painting', time: 0.8, place: 'hung' },
  toybox: { size: [0.9, 0.56, 0.6], search: 'open', verb: 'Open toy box', time: 0.9, critter: 'mouse' },
  cradle: { size: [0.85, 1.05, 0.85], search: 'dig', verb: 'Check the cradle', time: 1.0 },
  desk: { size: [1.3, 0.66, 0.8], search: 'open', verb: 'Open desk drawers', time: 1.0 },
  clock: { size: [0.6, 0.45, 2.1], search: 'open', verb: 'Open the clock', time: 0.9, critter: 'bat' },
  piano: { size: [1.55, 0.62, 1.2], search: 'open', verb: 'Lift piano lid', time: 1.0 },
  plant: { size: [0.56, 0.56, 1.15], search: 'dig', verb: 'Dig in the pot', time: 1.0 },
  trash: { size: [0.5, 0.5, 0.66], search: 'dig', verb: 'Rummage in trash', time: 0.9, critter: 'mouse' },
  sack: { size: [0.7, 0.6, 0.62], search: 'dig', verb: 'Rummage in sack', time: 0.9, critter: 'mouse' },
  rug: { size: [2.3, 1.5, 0.03], search: 'lift', verb: 'Lift the rug', time: 0.9, place: 'center', flat: true },
  boxes: { size: [0.95, 0.9, 1.25], search: 'smash', verb: 'Smash boxes', time: 0.8, critter: 'mouse' },
  coatrack: { size: [0.5, 0.5, 1.8], search: 'none', verb: '', time: 0 },
  lamp: {
    size: [0.5, 0.5, 1.65], search: 'none', verb: '', time: 0,
    light: { y: 1.45, color: 0xffc070, intensity: 7, distance: 7.5, flicker: 0.05 },
  },
  candles: {
    size: [0.5, 0.42, 1.3], search: 'none', verb: '', time: 0,
    light: { y: 1.25, color: 0xffa548, intensity: 5, distance: 6.5, flicker: 0.2 },
  },
  chair: { size: [0.5, 0.5, 0.95], search: 'none', verb: '', time: 0 },
};

/** Things a search can turn up besides the key. */
export type Find =
  | { kind: 'key' }
  | { kind: 'empty' }
  | { kind: 'heal'; amount: number; name: string; line: string }
  | { kind: 'junk'; id: string; icon: string; name: string; line: string }
  | { kind: 'critter'; critter: 'bat' | 'mouse' };
