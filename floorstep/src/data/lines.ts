// What the hero mutters. {floor} and {name} get filled in.
import type { FurnitureKind } from './furniture';
import type { RoomType } from './rooms';

export const LINES = {
  arrive: ['Floor {floor}. Here we go.', 'Another floor, another key.', 'Youser, I\'m coming!', 'Floor {floor}... smells worse than the last one.', 'Right. Key. Where are you, key?'],
  empty: ['Nothing.', 'Nope.', 'Empty.', 'Dust. Lovely dust.', 'Not here...', 'Zilch.', 'Nada.', 'Just cobwebs.'],
  emptyMany: [
    'This key is playing hide and seek with me.',
    'Whoever hid this key: I hate you.',
    'Key... come out, come out...',
    'Maybe it\'s in another room. Maybe.',
    'I should have brought a map.',
    'Grr! Where IS it?!',
  ],
  key: ['THE KEY! Finally!', 'Got it!', 'Key! Key! Key!', 'Yes! Come to papa!', 'Ha! Found you!'],
  locked: ['Locked. Of course.', 'I need the key.', 'It won\'t budge.', 'Locked tight.'],
  unlock: ['Open sesame!', 'Upstairs we go!', 'Youser, hang on!'],
  idle: ['Hello? Anybody?', 'This house gives me the creeps.', '*whistles nervously*', 'I should\'ve stayed home.', 'Did something just move?', 'Brrr.'],
  bat: ['AAAAH! A BAT!', 'Get out of my hair!', 'Shoo! Shoo!'],
  mouse: ['Eek! A mouse!', 'Hi, little guy.', 'Squeak to you too.'],
  smashed: ['Oops.', 'That was an antique.', 'Nobody saw that.'],
} as const;

export const ROOM_LINES: Partial<Record<RoomType, string[]>> = {
  kitchen: ['Something smells... rotten.', 'I\'m hungry. But not THAT hungry.', 'Who cooks in this house? Ghosts?'],
  bathroom: ['Hope nobody\'s in here.', 'Ew. Just... ew.'],
  nursery: ['Creepy toys. Great.', 'Why is the cradle rocking?'],
  library: ['So many books, no time.', 'Shhh!'],
  living: ['Cozy. Too cozy.', 'Nice fire. Who lit it?'],
  dining: ['Dinner for nobody.', 'The plates are still warm...'],
  storage: ['Junk, junk, and more junk.', 'Smells like old socks.'],
  bedroom: ['I could use a nap.', 'Somebody sleeps here. Somebody BIG.'],
  study: ['Lots of papers. No key.'],
};

/** What the hero says on finding nothing in particular things. */
export const KIND_LINES: Partial<Record<FurnitureKind, string[]>> = {
  toilet: ['Eww. Who didn\'t flush?!', 'Nope. Nope nope nope.'],
  fridge: ['Something in here is still alive.', 'The cheese is looking at me.'],
  oven: ['Burnt cookies. Classic.', 'Smells like Tuesday.'],
  bathtub: ['A rubber duck. And hair. Lots of hair.', 'I am NOT putting my hand in there again.'],
  piano: ['♪ Plonk. ♪', 'Out of tune. Like everything here.'],
  clock: ['Cuckoo! ...Rude.', 'Tick tock. Hurry up, me.'],
  bed: ['Just dust bunnies. Not the right bunny.', 'Monsters under the bed? Just socks.'],
  laundry: ['Why is it damp?', 'Socks. Socks everywhere.'],
  cradle: ['A doll stared at me. I\'m leaving.'],
  painting: ['Just more wall back there.', 'Its eyes keep following me...'],
  trash: ['I need a bath now.'],
  fireplace: ['Hot hot hot!', 'Just ashes. And a sausage?'],
};

/** Odd things found while searching. They go in your pocket: some residents want them. */
export interface JunkItem {
  id: string;
  icon: string;
  name: string;
  line: string;
}

export const JUNK: JunkItem[] = [
  { id: 'sock', icon: '🧦', name: 'an old sock', line: 'An old sock. Smells like cheese. Pocket!' },
  { id: 'tooth', icon: '🦷', name: 'a false tooth', line: 'Somebody\'s tooth. Somebody might want it back.' },
  { id: 'duck', icon: '🦆', name: 'a rubber duck', line: 'A rubber duck! Squeak squeak.' },
  { id: 'bone', icon: '🦴', name: 'a bone', line: 'A bone. I hope it\'s a chicken bone.' },
  { id: 'sandwich', icon: '🥪', name: 'a mouldy sandwich', line: 'A sandwich! ...it\'s green. Keeping it anyway.' },
  { id: 'wig', icon: '💇', name: 'a wig', line: 'A wig?! Who wears a wig here?' },
  { id: 'spoon', icon: '🥄', name: 'a spoon', line: 'A spoon. Someone will want this.' },
  { id: 'letter', icon: '💌', name: 'a love letter', line: '"My dearest Gribbles..." Yuck.' },
  { id: 'eye', icon: '👁️', name: 'a glass eye', line: 'An eye! It\'s looking at me!' },
  { id: 'button', icon: '🔘', name: 'a button', line: 'A button. My collection grows.' },
  { id: 'spider', icon: '🕷️', name: 'a dead spider', line: 'A spider. A dead one. I hope.' },
  { id: 'crown', icon: '👑', name: 'a dusty crown', line: 'A crown! ...made of cardboard.' },
];

export const HEALS = [
  { name: 'a cookie', amount: 2, line: 'A cookie! Crunch crunch.' },
  { name: 'an apple', amount: 2, line: 'An apple. Only a little worm in it.' },
  { name: 'a potion', amount: 4, line: 'A red potion! Glug glug glug.' },
  { name: 'a cheese', amount: 3, line: 'Cheese! Smelly but tasty.' },
];

export const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
