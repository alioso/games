// Who can play: the eight Floor Step heroes (each class in both its animals) and Youser, the baby bunny.
import { ANIMALS, CLASSES, type HeroClass, type HeroLook, defaultLook } from './heroes';

export type Character =
  | { id: string; kind: 'hero'; name: string; look: HeroLook; voice: number }
  | { id: 'youser'; kind: 'youser'; name: string; voice: number };

export const CHARACTERS: Character[] = [
  ...(Object.keys(CLASSES) as HeroClass[]).flatMap((cls) =>
    CLASSES[cls].animals.map((animal): Character => {
      const look = { ...defaultLook(cls), animal };
      return { id: `${cls}-${animal}`, kind: 'hero', name: `${CLASSES[cls].name}`, look, voice: ANIMALS[animal].voice };
    }),
  ),
  { id: 'youser', kind: 'youser', name: 'Youser', voice: 760 },
];

/** A longer name for the picker ("Guzzard the duck"). */
export function fullName(c: Character) {
  return c.kind === 'hero' ? `${c.name} the ${c.look.animal}` : 'Youser the baby bunny';
}

/** Ball colours, one per player. */
export const BALL_COLORS = [0xffffff, 0xff7a3a, 0x4ab0ff, 0xf4d040];
