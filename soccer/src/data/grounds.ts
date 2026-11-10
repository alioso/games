// Where matches are played: each team's home ground (the home team's ground is used), the time of
// day, and the weather. The weather changes the ball a little (see CONDITIONS in tuning.ts).
import type { Animal } from './teams';

export type PitchPattern = 'stripes' | 'wide' | 'checks' | 'diagonal' | 'rings';

export interface Ground {
  name: string;
  /** Rows in each stand (bigger clubs, bigger stands). */
  rows: number;
  /** Seat colours (alternating rows) and the roof (null: no roof). */
  seats: [number, number];
  roof: number | null;
  /** Grass: two mowing shades, the pattern, and wear (mud, bare patches). */
  grass: [number, number];
  pattern: PitchPattern;
  wear?: 'mud' | 'bare';
}

export const GROUNDS: Record<Exclude<Animal, 'owl'>, Ground> = {
  bunny: { name: 'The Burrow', rows: 5, seats: [0x9ad0a0, 0xf4f0e4], roof: null, grass: [0x52a43e, 0x489834], pattern: 'checks' },
  pig: { name: 'The Mud Bowl', rows: 6, seats: [0xe88a98, 0x8a5a3a], roof: 0x6a4a34, grass: [0x4f9a3a, 0x468e32], pattern: 'stripes', wear: 'mud' },
  dog: { name: 'Kennel Park', rows: 7, seats: [0xd83a30, 0x9a968e], roof: 0xb02a22, grass: [0x4c9c3c, 0x40902e], pattern: 'wide' },
  cat: { name: 'Scratching Post Stadium', rows: 7, seats: [0xf09030, 0x3a3a44], roof: 0x2a2a34, grass: [0x4a9a3c, 0x3f8c30], pattern: 'diagonal' },
  duck: { name: 'The Pond', rows: 6, seats: [0x2a6ad8, 0xf4f4ee], roof: 0x1a4aa0, grass: [0x50a040, 0x45922f], pattern: 'rings' },
  raccoon: { name: 'The Tip', rows: 4, seats: [0x6a7a5a, 0x8a8a90], roof: null, grass: [0x5a9a40, 0x52903a], pattern: 'stripes', wear: 'bare' },
  bear: { name: 'The Honey Pot', rows: 8, seats: [0xf0b020, 0x8a5a34], roof: 0x5a3a20, grass: [0x4a9a38, 0x3e8c2c], pattern: 'stripes' },
  mouse: { name: 'Cheddar Park', rows: 5, seats: [0xf4d040, 0xe8a020], roof: 0xd89a20, grass: [0x50a03e, 0x479434], pattern: 'checks' },
};

export type TimeOfDay = 'day' | 'evening' | 'night';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'windy';

export const TIME_NAMES: Record<TimeOfDay, string> = { day: 'Afternoon', evening: 'Sunset', night: 'Under the lights' };
export const WEATHER_NAMES: Record<Weather, string> = { sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', windy: 'Windy' };

/** Draw a time and weather for a match (mostly fair weather; snow is a treat). */
export function drawConditions(): { time: TimeOfDay; weather: Weather } {
  const r = Math.random();
  const time: TimeOfDay = r < 0.5 ? 'day' : r < 0.75 ? 'evening' : 'night';
  const w = Math.random();
  const weather: Weather = w < 0.38 ? 'sunny' : w < 0.58 ? 'cloudy' : w < 0.76 ? 'rain' : w < 0.88 ? 'windy' : 'snow';
  return { time, weather };
}

/** "Sunny" at night is a clear sky. */
export function weatherName(time: TimeOfDay, w: Weather) {
  return time === 'night' && w === 'sunny' ? 'Clear skies' : WEATHER_NAMES[w];
}

/** How the weather changes the ball: rolling friction and bounce (×), skid off a bounce, wind (m/s²). */
export function conditionsFor(w: Weather) {
  const angle = Math.random() * Math.PI * 2;
  switch (w) {
    case 'rain': return { roll: 0.75, bounce: 0.85, grip: 1.08, windX: 0, windZ: 0 };
    case 'snow': return { roll: 1.5, bounce: 0.7, grip: 0.92, windX: 0, windZ: 0 };
    case 'windy': return { roll: 1, bounce: 1, grip: 1, windX: Math.cos(angle) * 1.4, windZ: Math.sin(angle) * 0.7 };
    default: return { roll: 1, bounce: 1, grip: 1, windX: 0, windZ: 0 };
  }
}
