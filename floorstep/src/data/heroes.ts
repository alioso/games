// The four heroes. Each class comes in two animals; looks are chosen before the game.

export type HeroClass = 'wizard' | 'knight' | 'barbarian' | 'thief';
export type Animal = 'duck' | 'cat' | 'dog' | 'dragon' | 'bear' | 'pig' | 'lizard' | 'rabbit';
export type Sex = 'm' | 'f';

export interface ClassDef {
  name: string;
  title: string;
  animals: [Animal, Animal];
  costume: number;
  accent: number;
  blurb: string;
}

export const CLASSES: Record<HeroClass, ClassDef> = {
  wizard: { name: 'Guzzard', title: 'Wizard', animals: ['duck', 'cat'], costume: 0x3a4a9a, accent: 0xe8c040, blurb: 'Sword and magic blasts. Strong from afar, fragile up close.' },
  knight: { name: 'MightyMac', title: 'Knight', animals: ['dog', 'dragon'], costume: 0x9a2a2a, accent: 0xc8c8d0, blurb: 'Halberd and shield. Long reach, best block, a bit slow.' },
  barbarian: { name: 'Gronkers', title: 'Barbarian', animals: ['bear', 'pig'], costume: 0x6a4a2a, accent: 0xb0a080, blurb: 'Spiked club. Huge hits, smashes everything, no shield.' },
  thief: { name: 'Shifumi', title: 'Thief', animals: ['lizard', 'rabbit'], costume: 0x2a4a3a, accent: 0x8a6a4a, blurb: 'Crossbow, then knife. Fast, sneaky, searches quicker.' },
};

export interface AnimalDef {
  skin: number;
  /** Second colour: belly, muzzle, beak. */
  muzzle: number;
  /** Voice blip pitch in Hz. */
  voice: number;
}

export const ANIMALS: Record<Animal, AnimalDef> = {
  duck: { skin: 0xf4f0e0, muzzle: 0xf0a030, voice: 520 },
  cat: { skin: 0xd8903a, muzzle: 0xf4e4c8, voice: 470 },
  dog: { skin: 0xb88850, muzzle: 0xe8d0a8, voice: 330 },
  dragon: { skin: 0x6aa04a, muzzle: 0xd8d090, voice: 260 },
  bear: { skin: 0x7a5232, muzzle: 0xc8a070, voice: 200 },
  pig: { skin: 0xf0a8a8, muzzle: 0xf8c0c0, voice: 300 },
  lizard: { skin: 0x5aa08a, muzzle: 0xd0e0a0, voice: 400 },
  rabbit: { skin: 0xe8e0d8, muzzle: 0xf8f0ea, voice: 560 },
};

export interface HeroLook {
  cls: HeroClass;
  animal: Animal;
  sex: Sex;
  costume: number;
  accent: number;
  name: string;
  /** Weapon variant id (see WEAPONS). */
  weapon: string;
}

export interface WeaponVariant {
  id: string;
  name: string;
  blurb: string;
  /** Multipliers on the class's moves. */
  damage: number;
  speed: number;
  reach: number;
}

export const WEAPONS: Record<HeroClass, WeaponVariant[]> = {
  wizard: [
    { id: 'sword', name: 'Old sword', blurb: 'Does the job.', damage: 1, speed: 1, reach: 1 },
    { id: 'sabre', name: 'Bent sabre', blurb: 'Quicker, a bit weaker.', damage: 0.85, speed: 1.2, reach: 0.95 },
    { id: 'flame', name: 'Smoking sword', blurb: 'Slower, hurts more.', damage: 1.2, speed: 0.88, reach: 1 },
  ],
  knight: [
    { id: 'halberd', name: 'Halberd', blurb: 'Long and pointy.', damage: 1, speed: 1, reach: 1 },
    { id: 'spear', name: 'Boar spear', blurb: 'Even longer, a bit weaker.', damage: 0.85, speed: 1.1, reach: 1.15 },
    { id: 'poleaxe', name: 'Poleaxe', blurb: 'Heavy, slow, ouch.', damage: 1.25, speed: 0.85, reach: 0.95 },
  ],
  barbarian: [
    { id: 'club', name: 'Spiked club', blurb: 'Bonk.', damage: 1, speed: 1, reach: 1 },
    { id: 'axe', name: 'Rusty axe', blurb: 'A bit longer, a bit nastier.', damage: 1.12, speed: 0.95, reach: 1.05 },
    { id: 'hammer', name: 'Smithy hammer', blurb: 'Very slow, very hard.', damage: 1.35, speed: 0.8, reach: 0.95 },
  ],
  thief: [
    { id: 'crossbow', name: 'Crossbow & knife', blurb: 'Bolts first, knife after.', damage: 1, speed: 1, reach: 1 },
    { id: 'dagger', name: 'Crossbow & dagger', blurb: 'Faster knife, shorter.', damage: 0.9, speed: 1.2, reach: 0.9 },
  ],
};

export function weaponOf(look: HeroLook): WeaponVariant {
  const list = WEAPONS[look.cls];
  return list.find((w) => w.id === look.weapon) ?? list[0];
}

/** Costume colours: the first ones are always there, the last ones are won by finishing the game. */
export const COSTUMES: { color: number; unlock?: 'easy' | 'medium' | 'hard' }[] = [
  { color: 0x3a4a9a }, { color: 0x9a2a2a }, { color: 0x6a4a2a }, { color: 0x2a4a3a }, { color: 0x6a3a6a }, { color: 0x8a7a3a },
  { color: 0x3a3a3a }, { color: 0xd8c8a8 },
  { color: 0xd4a62a, unlock: 'easy' }, { color: 0x1a1a24, unlock: 'medium' }, { color: 0xe8e8f0, unlock: 'hard' },
];

export const ACCENTS = [0xe8c040, 0xc8c8d0, 0xb0a080, 0x8a6a4a, 0xd04a4a, 0x4a8ad0, 0x5aa05a, 0xe07ab0];

/** Names the creator offers when you don't want to type one. */
export const NAME_IDEAS: Record<HeroClass, string[]> = {
  wizard: ['Guzzard', 'Mumbleflap', 'Old Spatula', 'Wizbert', 'Fizzwick'],
  knight: ['MightyMac', 'Sir Dented', 'Lady Clank', 'Grumbold', 'Rustbucket'],
  barbarian: ['Gronkers', 'Bonkula', 'Big Ugg', 'Smashy', 'Grunhilda'],
  thief: ['Shifumi', 'Sneakle', 'Fingers', 'Whisk', 'Pockets'],
};

export function defaultLook(cls: HeroClass = 'wizard'): HeroLook {
  const c = CLASSES[cls];
  return { cls, animal: c.animals[0], sex: 'm', costume: c.costume, accent: c.accent, name: c.name, weapon: WEAPONS[cls][0].id };
}
