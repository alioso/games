// 🌋 ARENAS. Each team starts on its own side, but everyone can go everywhere.
// Shapes are described in world/shapes.ts. The left half's props are copied onto the right
// (mirrored, or turned around for 'rotate180') so both teams get a fair map.

import type { Shape } from '../world/shapes';

export type Theme = 'meadow' | 'volcano' | 'jungle' | 'beach' | 'ruins' | 'clouds';
/**
 * The deadly stuff: ponds (piranhas), lava, rivers (crocodiles), sea (sharks),
 * quicksand (swallows you slowly) and sky (the drop around the cloud islands).
 */
export type LiquidKind = 'pond' | 'lava' | 'river' | 'sea' | 'quicksand' | 'sky';

export type PropKind = 'tree' | 'jungleTree' | 'palm' | 'deadTree' | 'rock' | 'crate' | 'pillar' | 'sandcastle' | 'ruinWall' | 'cactus' | 'cloudBush';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  r?: number;
}

export interface LiquidDef {
  kind: LiquidKind;
  shape: Shape;
}

export interface BridgeDef {
  x: number;
  z: number;
  /** Bridges run along `angle` (radians, 0 = along x). */
  angle: number;
  length: number;
  width: number;
  style: 'wood' | 'stone' | 'log' | 'rainbow';
  /** Slides in and out over time (seconds per full cycle). */
  moving?: { period: number; offset: number };
}

/** A stone gate that rises out of the ground, blocks the way for a while, then sinks again. */
export interface GateDef {
  x: number;
  z: number;
  angle: number;
  length: number;
  period: number;
  offset: number;
}

/** A cloud you can stand on that drifts back and forth, carrying whoever is on it. */
export interface PlatformDef {
  /** The cloud's shape where it starts. */
  shape: Shape;
  /** How far it drifts (there and back). */
  dx: number;
  dz: number;
  period: number;
  offset: number;
}

/** A boulder rolling back and forth between two points. Anyone it runs over is knocked out (jump over it!). */
export interface BoulderDef {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  period: number;
  offset: number;
}

export interface ArenaDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  price: number;
  theme: Theme;
  /** Camera framing (and where flying things stop). */
  halfW: number;
  halfD: number;
  /** The ground you can walk on (several shapes for islands). */
  land: Shape | Shape[];
  /** What's past the edge of the land: a wall (bushes, jungle, dunes, rocks), or a deadly drop (lava, sky). */
  edge: 'hedge' | 'jungle' | 'dunes' | 'rocks' | 'lava' | 'sky';
  liquids: LiquidDef[];
  /** Sea along the bottom edge, with a tide that comes in and out. */
  shore?: { z: number; amp: number; seed: number; tide: number; period: number };
  bridges: BridgeDef[];
  gates: GateDef[];
  platforms?: PlatformDef[];
  boulders?: BoulderDef[];
  /** Left-half props, copied to the right half by `symmetry`. */
  props: PropDef[];
  /** Props exactly on the middle line (not copied). */
  centerProps: PropDef[];
  symmetry: 'mirrorX' | 'rotate180';
  /** Team Blue's start (Red's is the symmetric copy). */
  spawn: { blocs: [number, number][]; bunny: [number, number] };
  decoSeed: number;
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'grassy-pond',
    name: 'Grassy Pond',
    icon: '🌳',
    description: 'Green grass, a pond full of piranhas.',
    price: 0,
    theme: 'meadow',
    halfW: 17,
    halfD: 10,
    land: { type: 'rect', x: 0, z: 0, hw: 17, hd: 10 },
    edge: 'hedge',
    liquids: [{ kind: 'pond', shape: { type: 'blob', x: 0, z: 0, rx: 4.6, rz: 3.2, seed: 1.7 } }],
    bridges: [],
    gates: [],
    props: [
      { kind: 'tree', x: -7.8, z: -6.2, r: 0.75 },
      { kind: 'tree', x: -11, z: 5.8, r: 0.75 },
      { kind: 'tree', x: -5, z: 7.4, r: 0.7 },
      { kind: 'tree', x: -14.4, z: -7.3, r: 0.7 },
      { kind: 'rock', x: -6.6, z: 2.2, r: 1.0 },
      { kind: 'rock', x: -9.8, z: -2, r: 0.8 },
      { kind: 'rock', x: -3.2, z: -7, r: 0.85 },
      { kind: 'rock', x: -13.8, z: 4.2, r: 0.7 },
    ],
    centerProps: [
      { kind: 'tree', x: 0, z: -7.8, r: 0.8 },
      { kind: 'rock', x: 0, z: 7.2, r: 1.0 },
    ],
    symmetry: 'mirrorX',
    spawn: { blocs: [[-12, -4.5], [-12, 0], [-12, 4.5]], bunny: [-14.2, 0] },
    decoSeed: 42,
  },
  {
    id: 'volcano',
    name: 'Volcano',
    icon: '🌋',
    description: 'An island in a sea of lava. Watch the sliding bridge!',
    price: 100,
    theme: 'volcano',
    halfW: 17.5,
    halfD: 10.5,
    land: { type: 'blob', x: 0, z: 0, rx: 17.3, rz: 10.3, seed: 4, wobble: 1 },
    edge: 'lava',
    liquids: [
      { kind: 'lava', shape: { type: 'path', points: [[0, -12], [0, 12]], width: 3, seed: 2 } },
      { kind: 'lava', shape: { type: 'blob', x: -8, z: 6, rx: 1.6, rz: 1.2, seed: 5 } },
      { kind: 'lava', shape: { type: 'blob', x: 8, z: 6, rx: 1.6, rz: 1.2, seed: 5 } },
    ],
    bridges: [
      { x: 0, z: -6, angle: 0, length: 5.4, width: 2.2, style: 'stone' },
      { x: 0, z: 6, angle: 0, length: 5.4, width: 2.2, style: 'stone' },
      { x: 0, z: 0, angle: 0, length: 5.4, width: 1.8, style: 'stone', moving: { period: 12, offset: 0 } },
    ],
    gates: [],
    props: [
      { kind: 'deadTree', x: -11, z: -5.5, r: 0.55 },
      { kind: 'deadTree', x: -11.5, z: 5.2, r: 0.55 },
      { kind: 'rock', x: -8.5, z: -1.8, r: 1.0 },
      { kind: 'rock', x: -5.5, z: -8, r: 0.9 },
      { kind: 'rock', x: -13, z: 3.6, r: 0.8 },
      { kind: 'rock', x: -4.8, z: 3.4, r: 0.8 },
      { kind: 'crate', x: -6, z: -3.8, r: 0.55 },
    ],
    centerProps: [],
    symmetry: 'mirrorX',
    spawn: { blocs: [[-12, -3.5], [-12.5, 0], [-12, 3.5]], bunny: [-14, 0] },
    decoSeed: 7,
  },
  {
    id: 'jungle',
    name: 'Jungle',
    icon: '🌴',
    description: 'A winding river full of crocodiles. Stone gates rise and fall.',
    price: 100,
    theme: 'jungle',
    halfW: 17.5,
    halfD: 10.5,
    land: { type: 'blob', x: 0, z: 0, rx: 17.6, rz: 10.6, seed: 9, wobble: 0.7 },
    edge: 'jungle',
    liquids: [
      { kind: 'river', shape: { type: 'path', points: [[-3, -12], [-2, -6], [1.5, -2.5], [-1.5, 2.5], [2, 6], [3, 12]], width: 3.4, seed: 3 } },
    ],
    bridges: [
      { x: -2, z: -6, angle: 0.2, length: 6, width: 1.7, style: 'log' },
      { x: 2, z: 6, angle: 0.2, length: 6, width: 1.7, style: 'log' },
      { x: 0, z: 0, angle: 0.54, length: 6.4, width: 2.2, style: 'stone' },
    ],
    gates: [
      { x: -2, z: -6, angle: 0.2 + Math.PI / 2, length: 1.9, period: 10, offset: 0 },
      { x: 2, z: 6, angle: 0.2 + Math.PI / 2, length: 1.9, period: 10, offset: 5 },
    ],
    props: [
      { kind: 'jungleTree', x: -11, z: -6, r: 0.8 },
      { kind: 'jungleTree', x: -7, z: 7, r: 0.8 },
      { kind: 'jungleTree', x: -14.5, z: 4.5, r: 0.7 },
      { kind: 'pillar', x: -8, z: -1.2, r: 0.6 },
      { kind: 'pillar', x: -8.5, z: 2.6, r: 0.6 },
      { kind: 'rock', x: -7, z: -8.3, r: 0.85 },
      { kind: 'crate', x: -11.5, z: -1.8, r: 0.55 },
    ],
    centerProps: [],
    symmetry: 'rotate180',
    spawn: { blocs: [[-12.5, -4], [-13, 0.5], [-12, 4.5]], bunny: [-15, 0] },
    decoSeed: 11,
  },
  {
    id: 'beach',
    name: 'Beach',
    icon: '🏖️',
    description: 'Sharks in the sea and the lagoon. The tide comes in and out!',
    price: 100,
    theme: 'beach',
    halfW: 17,
    halfD: 10,
    land: { type: 'rect', x: 0, z: 0, hw: 17, hd: 10 },
    edge: 'dunes',
    liquids: [{ kind: 'sea', shape: { type: 'blob', x: 0, z: -2.2, rx: 3, rz: 2.3, seed: 8 } }],
    shore: { z: 6.5, amp: 0.9, seed: 1, tide: 1.6, period: 18 },
    bridges: [
      { x: 0, z: -2.2, angle: 0, length: 7.4, width: 1.6, style: 'wood' },
      { x: 0, z: 7.5, angle: Math.PI / 2, length: 6, width: 1.6, style: 'wood' },
    ],
    gates: [],
    props: [
      { kind: 'palm', x: -10, z: -6.5, r: 0.45 },
      { kind: 'palm', x: -5.5, z: -7.8, r: 0.45 },
      { kind: 'palm', x: -14.2, z: -2.5, r: 0.45 },
      { kind: 'sandcastle', x: -7, z: 1, r: 0.7 },
      { kind: 'crate', x: -11, z: 2.4, r: 0.55 },
      { kind: 'rock', x: -4.2, z: -5.2, r: 0.8 },
    ],
    centerProps: [{ kind: 'rock', x: 0, z: -8, r: 0.9 }],
    symmetry: 'mirrorX',
    spawn: { blocs: [[-12.5, -5.5], [-13, -2], [-12, 1.5]], bunny: [-15, -2] },
    decoSeed: 23,
  },
  {
    id: 'ruins',
    name: 'Rocky Ruins',
    icon: '🏛️',
    description: 'Crumbling walls to hide behind, quicksand pits, and boulders that roll by. Jump over them!',
    price: 100,
    theme: 'ruins',
    halfW: 17.5,
    halfD: 10.5,
    land: { type: 'blob', x: 0, z: 0, rx: 17.6, rz: 10.6, seed: 3, wobble: 0.6 },
    edge: 'rocks',
    liquids: [
      { kind: 'quicksand', shape: { type: 'blob', x: 0, z: 0, rx: 3.2, rz: 2.3, seed: 6 } },
      { kind: 'quicksand', shape: { type: 'blob', x: -8, z: 5.2, rx: 1.6, rz: 1.2, seed: 2 } },
      { kind: 'quicksand', shape: { type: 'blob', x: 8, z: 5.2, rx: 1.6, rz: 1.2, seed: 2 } },
    ],
    bridges: [],
    gates: [],
    boulders: [
      { ax: -11, az: -7.6, bx: 11, bz: -7.6, r: 0.95, period: 14, offset: 0 },
      { ax: 11, az: 7.8, bx: -11, bz: 7.8, r: 0.95, period: 14, offset: 3.5 },
    ],
    props: [
      // A crumbling wall in front of each base, and a broken corner further forward.
      { kind: 'ruinWall', x: -10, z: -3, r: 0.5 },
      { kind: 'ruinWall', x: -10, z: -2, r: 0.5 },
      { kind: 'ruinWall', x: -10, z: 2, r: 0.5 },
      { kind: 'ruinWall', x: -10, z: 3, r: 0.5 },
      { kind: 'ruinWall', x: -5.5, z: -3.8, r: 0.5 },
      { kind: 'ruinWall', x: -4.5, z: -3.8, r: 0.5 },
      { kind: 'ruinWall', x: -5.5, z: -2.8, r: 0.5 },
      { kind: 'pillar', x: -6.5, z: 2.4, r: 0.55 },
      { kind: 'pillar', x: -13.5, z: -5.5, r: 0.55 },
      { kind: 'cactus', x: -14.5, z: 4.4, r: 0.4 },
      { kind: 'cactus', x: -3.2, z: 4.6, r: 0.4 },
      { kind: 'rock', x: -12.5, z: 5.8, r: 0.8 },
    ],
    centerProps: [],
    symmetry: 'mirrorX',
    spawn: { blocs: [[-12.5, -3.8], [-13, 0], [-12.5, 3.8]], bunny: [-15, 0] },
    decoSeed: 31,
  },
  {
    id: 'clouds',
    name: 'Cloud Heaven',
    icon: '☁️',
    description: 'Floating islands joined by rainbow bridges. Clouds drift by. Don\'t fall off!',
    price: 100,
    theme: 'clouds',
    halfW: 17.5,
    halfD: 10,
    land: [
      { type: 'blob', x: -11, z: 0, rx: 5.6, rz: 6.6, seed: 2, wobble: 0.8 },
      { type: 'blob', x: 11, z: 0, rx: 5.6, rz: 6.6, seed: 2, wobble: 0.8 },
      { type: 'blob', x: 0, z: 0, rx: 3.6, rz: 3.0, seed: 5, wobble: 0.8 },
      { type: 'blob', x: 0, z: -7.6, rx: 2.8, rz: 1.8, seed: 8, wobble: 0.6 },
      { type: 'blob', x: 0, z: 7.6, rx: 2.8, rz: 1.8, seed: 8, wobble: 0.6 },
    ],
    edge: 'sky',
    liquids: [],
    bridges: [
      { x: -4.6, z: 0, angle: 0, length: 4.2, width: 1.7, style: 'rainbow' },
      { x: 4.6, z: 0, angle: 0, length: 4.2, width: 1.7, style: 'rainbow' },
      { x: -5.35, z: -6.15, angle: -0.35, length: 7.2, width: 1.6, style: 'rainbow' },
      { x: 5.35, z: -6.15, angle: 0.35, length: 7.2, width: 1.6, style: 'rainbow' },
      { x: -5.35, z: 6.15, angle: 0.35, length: 7.2, width: 1.6, style: 'rainbow' },
      { x: 5.35, z: 6.15, angle: -0.35, length: 7.2, width: 1.6, style: 'rainbow' },
    ],
    gates: [],
    platforms: [
      // Drifting clouds between the middle island and the small ones.
      { shape: { type: 'blob', x: -2.6, z: -4.4, rx: 1.5, rz: 1.35, seed: 4 }, dx: 5.2, dz: 0, period: 10, offset: 0 },
      { shape: { type: 'blob', x: 2.6, z: 4.4, rx: 1.5, rz: 1.35, seed: 4 }, dx: -5.2, dz: 0, period: 10, offset: 0 },
    ],
    props: [
      { kind: 'cloudBush', x: -13.5, z: -3.8, r: 0.6 },
      { kind: 'cloudBush', x: -8, z: 3.6, r: 0.6 },
      { kind: 'pillar', x: -9, z: -3.2, r: 0.5 },
      { kind: 'pillar', x: -12.8, z: 4.2, r: 0.5 },
    ],
    centerProps: [
      { kind: 'cloudBush', x: 0, z: -1.6, r: 0.6 },
      { kind: 'cloudBush', x: 0, z: 1.6, r: 0.6 },
    ],
    symmetry: 'mirrorX',
    spawn: { blocs: [[-11.5, -3.6], [-12.5, 0], [-11.5, 3.6]], bunny: [-14.6, 0] },
    decoSeed: 17,
  },
];

export const arenaById = (id: string) => ARENAS.find((a) => a.id === id) ?? ARENAS[0];

/** The symmetric copy of a left-side point for the other team. */
export function mirror(a: ArenaDef, x: number, z: number): [number, number] {
  return a.symmetry === 'mirrorX' ? [-x, z] : [-x, -z];
}

export function allProps(a: ArenaDef): PropDef[] {
  return [
    ...a.props,
    ...a.props.map((p) => {
      const [x, z] = mirror(a, p.x, p.z);
      return { ...p, x, z };
    }),
    ...a.centerProps,
  ];
}
