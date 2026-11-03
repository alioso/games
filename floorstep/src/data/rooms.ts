import type { FurnitureKind } from './furniture';

export type RoomType =
  | 'landing' | 'kitchen' | 'bedroom' | 'bathroom' | 'library' | 'living'
  | 'dining' | 'nursery' | 'study' | 'storage';

export type FloorStyle =
  | { kind: 'planks'; a: string; b: string }
  | { kind: 'tiles'; a: string; b: string }
  | { kind: 'boards'; a: string; b: string };

export type WallPattern = 'stripes' | 'dots' | 'diamonds' | 'fleur' | 'plain' | 'tiles' | 'bricks';

export interface WallStyle {
  paper: string;
  accent: string;
  pattern: WallPattern;
  /** Wood panelling on the lower part of the wall. */
  panel: string;
}

export interface RoomStyle {
  name: string;
  floor: FloorStyle;
  walls: WallStyle[];
  /** Always placed (in this order, first ones get the best spots). */
  must: FurnitureKind[];
  /** A few of these are added at random. */
  maybe: FurnitureKind[];
  center?: FurnitureKind[];
  /** Big rooms suit these types when two cells merge. */
  big?: boolean;
}

const PLANKS = { kind: 'planks', a: '#8a5a36', b: '#76492a' } as const;

export const ROOMS: Record<RoomType, RoomStyle> = {
  landing: {
    name: 'Landing',
    floor: { kind: 'planks', a: '#6e4428', b: '#5e3820' },
    walls: [{ paper: '#4f6b4a', accent: '#5f7d58', pattern: 'stripes', panel: '#4a2e1c' }],
    must: ['coatrack'],
    maybe: ['chest', 'painting', 'plant', 'clock', 'lamp', 'vase'],
  },
  kitchen: {
    name: 'Kitchen',
    floor: { kind: 'tiles', a: '#e8dcc0', b: '#3b3433' },
    walls: [{ paper: '#d9c27a', accent: '#c9ad5e', pattern: 'tiles', panel: '#7c5532' }],
    must: ['oven', 'fridge', 'counter', 'counter', 'sinkCab'],
    maybe: ['barrel', 'trash', 'sack', 'crate', 'candles'],
    center: ['table'],
  },
  bedroom: {
    name: 'Bedroom',
    floor: PLANKS,
    walls: [
      { paper: '#5a6f9a', accent: '#6f85b2', pattern: 'fleur', panel: '#5a3820' },
      { paper: '#8f5c6e', accent: '#a56f82', pattern: 'dots', panel: '#5a3820' },
    ],
    must: ['bed', 'wardrobe'],
    maybe: ['dresser', 'chest', 'laundry', 'painting', 'lamp', 'plant'],
    center: ['rug'],
  },
  bathroom: {
    name: 'Bathroom',
    floor: { kind: 'tiles', a: '#cfe3df', b: '#7fa8a3' },
    walls: [{ paper: '#9cc3be', accent: '#b6d6d1', pattern: 'tiles', panel: '#e8e2d2' }],
    must: ['toilet', 'bathtub', 'sinkCab'],
    maybe: ['laundry', 'trash', 'painting', 'candles'],
  },
  library: {
    name: 'Library',
    floor: { kind: 'planks', a: '#6b3d26', b: '#5a311d' },
    walls: [{ paper: '#7a2f2f', accent: '#8f3d3a', pattern: 'diamonds', panel: '#3e2414' }],
    must: ['bookcase', 'bookcase', 'bookcase', 'armchair'],
    maybe: ['desk', 'clock', 'lamp', 'bookcase', 'plant'],
    center: ['rug'],
    big: true,
  },
  living: {
    name: 'Living room',
    floor: PLANKS,
    walls: [
      { paper: '#6b6a3c', accent: '#7d7c4a', pattern: 'stripes', panel: '#4a2e1c' },
      { paper: '#476c6c', accent: '#578080', pattern: 'fleur', panel: '#4a2e1c' },
    ],
    must: ['fireplace', 'sofa', 'armchair'],
    maybe: ['painting', 'clock', 'piano', 'plant', 'lamp', 'vase'],
    center: ['rug'],
    big: true,
  },
  dining: {
    name: 'Dining room',
    floor: { kind: 'planks', a: '#7a4c2e', b: '#683f25' },
    walls: [{ paper: '#6e2a3a', accent: '#82394b', pattern: 'stripes', panel: '#3e2414' }],
    must: ['dresser', 'candles'],
    maybe: ['clock', 'painting', 'plant', 'vase', 'counter'],
    center: ['table'],
    big: true,
  },
  nursery: {
    name: 'Nursery',
    floor: { kind: 'planks', a: '#b08a64', b: '#9c7854' },
    walls: [{ paper: '#c99aa6', accent: '#e0b8c2', pattern: 'dots', panel: '#f0e6d8' }],
    must: ['cradle', 'toybox'],
    maybe: ['wardrobe', 'chest', 'laundry', 'painting', 'lamp'],
    center: ['rug'],
  },
  study: {
    name: 'Study',
    floor: { kind: 'planks', a: '#6e4428', b: '#5e3820' },
    walls: [{ paper: '#6b5a3e', accent: '#7c6a4c', pattern: 'diamonds', panel: '#3e2414' }],
    must: ['desk', 'bookcase'],
    maybe: ['chest', 'clock', 'armchair', 'lamp', 'painting', 'plant'],
  },
  storage: {
    name: 'Storage room',
    floor: { kind: 'boards', a: '#7d6a55', b: '#6a5844' },
    walls: [{ paper: '#6d6660', accent: '#5e5752', pattern: 'bricks', panel: '#4d4238' }],
    must: ['crate', 'crate', 'barrel', 'boxes'],
    maybe: ['sack', 'chest', 'boxes', 'barrel', 'crate', 'vase'],
  },
};

/** Room types picked for ordinary rooms (the landing is only for where you arrive). */
export const ROOM_POOL: RoomType[] = ['kitchen', 'bedroom', 'bathroom', 'library', 'living', 'dining', 'nursery', 'study', 'storage', 'bedroom'];
