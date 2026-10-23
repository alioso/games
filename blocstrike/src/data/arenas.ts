// 🌳 ARENAS. Each team starts in its own half (or corner with 4 teams), but everyone can go everywhere.
// Water is deadly: the piranhas eat anyone who falls in.

export interface WaterDef {
  x: number;
  z: number;
  rx: number; // half-width
  rz: number; // half-depth
  seed: number; // changes the wobbly shoreline
}

export interface ObstacleDef {
  kind: 'tree' | 'rock';
  x: number;
  z: number;
  r: number; // size of the solid part
}

export interface ArenaDef {
  id: string;
  name: string;
  price: number; // bloccoins to unlock, 0 = free
  halfW: number;
  halfD: number;
  water: WaterDef[];
  /** Obstacles on the left half; they're mirrored onto the right so both teams get a fair map. */
  obstaclesLeft: ObstacleDef[];
  /** Obstacles placed exactly as written (on the middle line). */
  obstaclesCenter: ObstacleDef[];
  decoSeed: number;
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'grassy-pond',
    name: 'Grassy Pond',
    price: 0,
    halfW: 17,
    halfD: 10,
    water: [{ x: 0, z: 0, rx: 4.6, rz: 3.2, seed: 1.7 }],
    obstaclesLeft: [
      { kind: 'tree', x: -7.8, z: -6.2, r: 0.75 },
      { kind: 'tree', x: -11, z: 5.8, r: 0.75 },
      { kind: 'tree', x: -5, z: 7.4, r: 0.7 },
      { kind: 'tree', x: -14.4, z: -7.3, r: 0.7 },
      { kind: 'rock', x: -6.6, z: 2.2, r: 1.0 },
      { kind: 'rock', x: -9.8, z: -2, r: 0.8 },
      { kind: 'rock', x: -3.2, z: -7, r: 0.85 },
      { kind: 'rock', x: -13.8, z: 4.2, r: 0.7 },
    ],
    obstaclesCenter: [
      { kind: 'tree', x: 0, z: -7.8, r: 0.8 },
      { kind: 'rock', x: 0, z: 7.2, r: 1.0 },
    ],
    decoSeed: 42,
  },
];

export function allObstacles(a: ArenaDef): ObstacleDef[] {
  return [
    ...a.obstaclesLeft,
    ...a.obstaclesLeft.map((o) => ({ ...o, x: -o.x })),
    ...a.obstaclesCenter,
  ];
}

/** Shoreline radius multiplier for a pond at a given angle (1 = plain ellipse). */
export function shoreAt(w: WaterDef, angle: number) {
  return 1 + 0.07 * Math.sin(3 * angle + w.seed) + 0.045 * Math.sin(5 * angle + w.seed * 2.3);
}

/**
 * How far inside a pond a point is: < 1 means in the water.
 * Uses the wobbly shoreline so the deadly zone matches what you see.
 */
export function waterDepthFactor(w: WaterDef, x: number, z: number) {
  const dx = (x - w.x) / w.rx, dz = (z - w.z) / w.rz;
  return Math.hypot(dx, dz) / shoreAt(w, Math.atan2(dz, dx));
}

export function inWater(a: ArenaDef, x: number, z: number, margin = 0) {
  return a.water.some((w) => waterDepthFactor(w, x, z) < 1 - margin);
}
