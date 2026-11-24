// The riddle keepers and their riddles. A keeper stands in a gap that's a shortcut; answer their
// riddle and they let you through, get it wrong and they stay put (no second go this time round: it's
// the long way for you). Riddles are for kids: one right answer and two silly wrong ones.
import type { Resident } from '../entities/keeperModel';

export interface Riddle {
  q: string;
  right: string;
  wrong: [string, string];
}

export const RIDDLES: Riddle[] = [
  { q: 'What has keys but can\'t open a single door?', right: 'A piano', wrong: ['A jailer', 'A sleepy janitor'] },
  { q: 'What gets wetter the more it dries?', right: 'A towel', wrong: ['A fish', 'The sea'] },
  { q: 'What has hands but can\'t clap?', right: 'A clock', wrong: ['A shy octopus', 'A scarecrow'] },
  { q: 'What has a neck but no head?', right: 'A bottle', wrong: ['A giraffe on holiday', 'A scarf'] },
  { q: 'What can you catch but never throw?', right: 'A cold', wrong: ['A ball', 'A bus'] },
  { q: 'What goes up and never comes down?', right: 'Your age', wrong: ['A balloon', 'A rocket'] },
  { q: 'What has an eye but cannot see?', right: 'A needle', wrong: ['A sleeping cat', 'A potato'] },
  { q: 'What must be broken before you can use it?', right: 'An egg', wrong: ['A promise', 'A window'] },
  { q: 'I\'m tall when I\'m young and short when I\'m old. What am I?', right: 'A candle', wrong: ['A grandpa', 'A tree'] },
  { q: 'What has lots of teeth but never bites?', right: 'A comb', wrong: ['A crocodile', 'A shark\'s cousin'] },
  { q: 'What runs but never walks?', right: 'A river', wrong: ['A snail', 'A clock'] },
  { q: 'What has four legs but never walks anywhere?', right: 'A table', wrong: ['A lazy dog', 'A caterpillar'] },
  { q: 'What belongs to you, but other people use it more than you do?', right: 'Your name', wrong: ['Your toothbrush', 'Your socks'] },
  { q: 'What can fill a whole room but takes up no space?', right: 'Light', wrong: ['A balloon', 'An elephant'] },
  { q: 'What has a thumb and four fingers but isn\'t alive?', right: 'A glove', wrong: ['A sock', 'A robot'] },
  { q: 'The more of them you take, the more you leave behind. What are they?', right: 'Footsteps', wrong: ['Cookies', 'Photos'] },
  { q: 'Which month has twenty-eight days?', right: 'All of them', wrong: ['February', 'None of them'] },
  { q: 'What is full of holes but still holds water?', right: 'A sponge', wrong: ['A sieve', 'A fishing net'] },
  { q: 'What can go all round the world while staying in a corner?', right: 'A stamp', wrong: ['A spider', 'A snail'] },
  { q: 'What has one head, one foot and four legs?', right: 'A bed', wrong: ['A monster', 'A chair'] },
  { q: 'What gets bigger the more you take away from it?', right: 'A hole', wrong: ['A cake', 'A pile of sand'] },
  { q: 'What has words but never speaks?', right: 'A book', wrong: ['A parrot', 'A mime'] },
  { q: 'What goes up when the rain comes down?', right: 'An umbrella', wrong: ['A frog', 'A kite'] },
  { q: 'What has a head and a tail but no body?', right: 'A coin', wrong: ['A worm', 'A comet'] },
];

/** A keeper: who they are, and what they say. */
export interface Keeper {
  look: Resident;
  voice: number;
  hello: string;
  yes: string;
  no: string;
}

export const KEEPERS: Keeper[] = [
  {
    look: { name: 'Grandpa Fumble', animal: 'dog', sex: 'm', old: true, costume: 0x5a4a3a, accent: 0xb0a080, glasses: true, activity: 'pipe' },
    voice: 260, hello: 'Hrmph. Nobody passes without answering my riddle.', yes: 'Well I never! Off you go, then.', no: 'Wrong! Hah. The long way round for you.',
  },
  {
    look: { name: 'Granny Gristle', animal: 'cat', sex: 'f', old: true, costume: 0x6a3a4a, accent: 0xe8e0d0, hat: 'bonnet', activity: 'knit' },
    voice: 420, hello: 'A shortcut, dearie? Answer me this first...', yes: 'Clever little thing! Through you go.', no: 'Oh dear, oh dear. No. Off the long way, dearie.',
  },
  {
    look: { name: 'Professor Mothball', animal: 'duck', sex: 'm', old: true, costume: 0x3a4a3a, accent: 0xc8a040, glasses: true, activity: 'read' },
    voice: 480, hello: 'Ah! A student. Riddle me this, and the way is yours.', yes: 'Correct! Top marks. Proceed!', no: 'Incorrect! See me after class. And go round.',
  },
  {
    look: { name: 'Wee Agnes', animal: 'duck', sex: 'f', kid: true, costume: 0xc87090, accent: 0xf0e0f0, hat: 'bonnet', activity: 'bugs' },
    voice: 640, hello: 'You can only come through if you know my riddle!', yes: 'Awww, you got it! Okay, you can pass.', no: 'Nope nope nope! Go the long way!',
  },
  {
    look: { name: 'Colonel Crumb', animal: 'bear', sex: 'm', old: true, costume: 0x4a5a3a, accent: 0xc8a040, hat: 'nightcap', activity: 'tea' },
    voice: 200, hello: 'HALT! Password? No? Then a riddle, soldier!', yes: 'Splendid! Carry on, soldier!', no: 'WRONG! About turn! Quick march, the long way!',
  },
  {
    look: { name: 'Madame Ophelia', animal: 'cat', sex: 'f', old: true, costume: 0x5a2a6a, accent: 0xe8c040, hat: 'turban', activity: 'cards' },
    voice: 380, hello: 'I see... a riddle in your future. Answer it, and the way opens.', yes: 'The cards were right about you. Pass!', no: 'The cards say... no. Go round, little one.',
  },
];
