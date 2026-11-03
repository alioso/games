// The odd people who live in the house. Three per floor, each doing their thing in a room that
// suits them. Talk to them the way they like (each has their own test) and they'll give you a clue
// about the key or warn you about the monster. Give them what they want and they'll say more.
import type { Animal } from './heroes';
import type { FurnitureKind } from './furniture';
import type { MonsterName } from './monsters';
import type { RoomType } from './rooms';
import type { Difficulty } from './tuning';

/** What they're doing (picks the pose and the prop in their hands). */
export type Activity = 'pipe' | 'stir' | 'read' | 'knit' | 'cards' | 'snore' | 'marbles' | 'bugs' | 'tea' | 'hide';

export interface Resident {
  id: string;
  name: string;
  animal: Animal;
  sex: 'm' | 'f';
  /** Kids are smaller. */
  kid?: boolean;
  /** Old folk go grey. */
  old?: boolean;
  costume: number;
  accent: number;
  hat?: 'chef' | 'bonnet' | 'cap' | 'nightcap' | 'turban' | 'none';
  glasses?: boolean;
  activity: Activity;
  /** Sits (in an armchair, at a table) rather than stands. */
  sits?: boolean;
  /** Rooms they like to be in, best first. */
  rooms: RoomType[];
  /** Voice pitch for the mumble blips. */
  voice: number;
  /** What they say to themselves when you walk by. */
  mutter: string[];
  /** First thing they say to you. */
  hello: string[];
  /** Their little test: a question, and three answers; only one pleases them. */
  test: { ask: string; answers: [string, boolean][]; good: string; bad: string };
  /** The junk they'd love to have, and what they say when they get it. */
  wants: string;
  thanks: string;
  /** How they put a clue: "{clue}" is replaced. */
  clue: string;
  /** How they warn about a monster: "{tip}" and "{where}" are replaced. */
  warn: string;
}

export const RESIDENTS: Resident[] = [
  {
    id: 'grandpa', name: 'Grandpa Fumble', animal: 'dog', sex: 'm', old: true, costume: 0x5a4a3a, accent: 0xb0a080, glasses: true,
    activity: 'pipe', sits: true, rooms: ['living', 'study', 'library'], voice: 150,
    mutter: ['*puff* ...*puff*', 'In my day, monsters had manners.', 'Hrmph.'],
    hello: ['Eh? Who\'s there? Speak up!', 'A visitor! Sit, sit. Not there. That\'s my spot.'],
    test: {
      ask: 'Did I ever tell you about the war of the toasters?',
      answers: [['No! Tell me everything.', true], ['Yes. Twice. Today.', false], ['Can\'t talk, looking for a key.', false]],
      good: '...and that\'s how I lost my eyebrows. Good listener, you are.',
      bad: 'Kids today. No patience. Off you go.',
    },
    wants: 'tooth', thanks: 'My tooth! I was wondering where that went. *click*',
    clue: 'I saw something shiny... {clue}. Or was that 1953?', warn: 'Careful, youngster. {tip} It hangs about {where}.',
  },
  {
    id: 'granny', name: 'Granny Gristle', animal: 'cat', sex: 'f', old: true, costume: 0x6a3a4a, accent: 0xe8e0d0, hat: 'bonnet',
    activity: 'stir', rooms: ['kitchen', 'dining'], voice: 380,
    mutter: ['A pinch of toad... a dash of sock...', 'Mmm. Needs more eyeball.', '*stir stir stir*'],
    hello: ['Hungry, dearie? You look hungry.', 'Come in, come in! Mind the cauldron.'],
    test: {
      ask: 'Taste my soup, dearie. Go on. How is it?',
      answers: [['Delicious! What\'s in it?', true], ['It moved.', false], ['No thanks, I\'m not hungry.', false]],
      good: 'Oh, you charmer! It\'s mostly beetles.',
      bad: 'Hmph. NO soup for you, then.',
    },
    wants: 'spoon', thanks: 'A SPOON! Finally I can stop stirring with my tail.',
    clue: 'Between you and me, dearie: {clue}.', warn: 'Listen, dearie. {tip} It sniffs about {where}, after my soup.',
  },
  {
    id: 'professor', name: 'Professor Mothball', animal: 'duck', sex: 'm', old: true, costume: 0x3a4a3a, accent: 0xc8a040, glasses: true,
    activity: 'read', sits: true, rooms: ['library', 'study'], voice: 300,
    mutter: ['Fascinating. Utterly fascinating.', 'Chapter 412...', 'Hmm. Footnotes.'],
    hello: ['Shh! This is a library. Well, it is now.', 'Ah. A student. Late, as usual.'],
    test: {
      ask: 'Quick question. What has keys but opens no doors?',
      answers: [['A piano!', true], ['A locksmith with no friends.', false], ['Is this going to be on the test?', false]],
      good: 'Correct! You may stay. Quietly.',
      bad: 'Wrong. Go and read something.',
    },
    wants: 'eye', thanks: 'A spare eye! For reading the small print. Marvellous.',
    clue: 'According to my notes, {clue}.', warn: 'Scientific observation: {tip} Specimen last seen {where}.',
  },
  {
    id: 'auntie', name: 'Auntie Pickle', animal: 'lizard', sex: 'f', old: true, costume: 0x4a6a4a, accent: 0xd04a4a,
    activity: 'knit', sits: true, rooms: ['bedroom', 'nursery', 'living'], voice: 340,
    mutter: ['Knit one, purl one, bite one...', 'This scarf is for the monster. It\'s chilly.', '*click click click*'],
    hello: ['Well, well. Do you have manners, child?', 'Wipe your feet. Both of them.'],
    test: {
      ask: 'And how do we greet a lady?',
      answers: [['Good evening, madam. Lovely scarf!', true], ['Yo.', false], ['*bows so low you fall over*', false]],
      good: 'Finally, someone raised properly.',
      bad: 'Dreadful. Simply dreadful. Go away.',
    },
    wants: 'sock', thanks: 'A sock! Now I can knit its twin. How thoughtful.',
    clue: 'Since you asked nicely: {clue}.', warn: 'A word of warning, dear. {tip} It lurks {where}.',
  },
  {
    id: 'twins', name: 'Pip and Squeak', animal: 'rabbit', sex: 'm', kid: true, costume: 0x8a6a2a, accent: 0x5a8ad0, hat: 'cap',
    activity: 'marbles', rooms: ['nursery', 'landing', 'storage'], voice: 650,
    mutter: ['My eyeball! MY eyeball!', 'Cheater!', 'Hee hee hee.'],
    hello: ['Wanna play marbles? They\'re eyeballs.', 'You\'re not a grown-up, are you? You look funny.'],
    test: {
      ask: 'Play with us! Pick an eyeball. Blue or green?',
      answers: [['Green. Obviously.', true], ['Eww, no.', false], ['I\'m too busy for games.', false]],
      good: 'YAY! You win! You always win green.',
      bad: 'Boooring. You\'re a grown-up after all.',
    },
    wants: 'eye', thanks: 'A NEW ONE! It\'s the shiniest eyeball EVER.',
    clue: 'We saw it! We saw it! {clue}!', warn: 'There\'s a monster! {tip} We saw it {where}! Don\'t tell!',
  },
  {
    id: 'dribble', name: 'Little Dribble', animal: 'pig', sex: 'm', kid: true, costume: 0x6a6a3a, accent: 0xb0a080,
    activity: 'bugs', rooms: ['storage', 'kitchen', 'bathroom'], voice: 560,
    mutter: ['This one\'s called Gerald.', '*sniff* ...*sniff*', 'Bugs are my best friends.'],
    hello: ['Wanna see my bugs?', 'Shh. You\'ll wake the beetles.'],
    test: {
      ask: 'Which is the best bug? Be honest.',
      answers: [['The slimy one. Definitely.', true], ['None of them. Gross.', false], ['Can I squash one?', false]],
      good: 'That\'s Gerald! He likes you too!',
      bad: 'You\'re mean. Gerald\'s crying now.',
    },
    wants: 'spider', thanks: 'A SPIDER! A dead one! Best. Day. Ever.',
    clue: 'Gerald says {clue}.', warn: 'Gerald\'s scared of the monster. {tip} It lives {where}.',
  },
  {
    id: 'agnes', name: 'Wee Agnes', animal: 'duck', sex: 'f', kid: true, costume: 0xc87090, accent: 0xf0e0f0, hat: 'bonnet',
    activity: 'tea', rooms: ['nursery', 'dining', 'bedroom'], voice: 700,
    mutter: ['More tea, Mister Button?', 'Mister Button is very rude today.', 'Pinkies UP.'],
    hello: ['You\'re late for tea. Mister Button is cross.', 'Sit! Tea party! Now!'],
    test: {
      ask: 'Mister Button wants to know: one lump or two?',
      answers: [['Three lumps, and pinkie up, please.', true], ['Your doll can\'t talk.', false], ['I don\'t drink tea.', false]],
      good: 'Mister Button says you\'re ADORABLE.',
      bad: 'Mister Button says you can LEAVE.',
    },
    wants: 'button', thanks: 'A button! Mister Button has a brother now!',
    clue: 'Mister Button whispered that {clue}.', warn: 'Mister Button is scared. {tip} He saw it {where}.',
  },
  {
    id: 'mortimer', name: 'Mortimer', animal: 'cat', sex: 'm', kid: true, costume: 0x3a3a4a, accent: 0xe8e8f0,
    activity: 'hide', rooms: ['bedroom', 'study', 'landing', 'library'], voice: 620,
    mutter: ['...97, 98, 99...', 'Nobody ever finds me.', 'I\'m not here. Shh.'],
    hello: ['You FOUND me! Nobody ever finds me!', 'Shh! I\'m hiding. From everyone. For years.'],
    test: {
      ask: 'Will you play hide and seek with me?',
      answers: [['Sure! You hide, I\'ll count.', true], ['Your parents must be worried.', false], ['Found you. Game over.', false]],
      good: 'Really? You\'re my best friend now. Forever. FOREVER.',
      bad: 'Fine. I\'ll go back to hiding. For more years.',
    },
    wants: 'duck', thanks: 'A duck! Now I have someone to hide with.',
    clue: 'I hide everywhere, so I know: {clue}.', warn: 'I hide from the monster too. {tip} It looks for me {where}.',
  },
  {
    id: 'ophelia', name: 'Madame Ophelia', animal: 'cat', sex: 'f', old: true, costume: 0x5a2a6a, accent: 0xe8c040, hat: 'turban',
    activity: 'cards', sits: true, rooms: ['dining', 'living', 'study'], voice: 330,
    mutter: ['The cards... they whisper...', 'Ooooh. The Moon. Not good.', 'I knew you\'d come.'],
    hello: ['I knew you would come. The cards told me.', 'Sit. Your future awaits. Five coins. Kidding.'],
    test: {
      ask: 'Do you believe in the cards, child?',
      answers: [['Of course. Read mine!', true], ['They\'re just bits of paper.', false], ['Can they find keys?', false]],
      good: 'A believer! The cards smile upon you.',
      bad: 'The cards say: you are rude. And smelly.',
    },
    wants: 'crown', thanks: 'A crown! The cards said a queen would come. It was me.',
    clue: 'The cards speak... {clue}.', warn: 'I see danger... {tip} The cards show it {where}.',
  },
  {
    id: 'colonel', name: 'Colonel Crumb', animal: 'bear', sex: 'm', old: true, costume: 0x4a5a3a, accent: 0xc8a040, hat: 'nightcap',
    activity: 'snore', sits: true, rooms: ['living', 'study', 'library'], voice: 130,
    mutter: ['ZZZzzz... charge... zzz...', '*snort* Who goes there?! ...zzz', 'Zzzz... more custard...'],
    hello: ['*SNORT* WHO GOES THERE?! State your business!', 'Hrrumph! At ease, at ease.'],
    test: {
      ask: 'Are you a soldier, private?',
      answers: [['*salutes* Yes, sir! Reporting for duty!', true], ['You were asleep.', false], ['Shh, go back to sleep.', false]],
      good: 'Splendid! Splendid! Here\'s the intelligence.',
      bad: 'Insubordination! Dismissed! ...zzz',
    },
    wants: 'letter', thanks: 'A letter! From my sweetheart! In 1922! At last!',
    clue: 'Intelligence report: {clue}. Over.', warn: 'Enemy spotted! {tip} Last position: {where}. Over!',
  },
  {
    id: 'chef', name: 'Uncle Spatula', animal: 'pig', sex: 'm', old: true, costume: 0xe8e0d0, accent: 0xd04a4a, hat: 'chef',
    activity: 'stir', rooms: ['kitchen', 'dining', 'storage'], voice: 210,
    mutter: ['More salt! MORE SALT!', 'Mmm. Needs a sock.', 'Who ate my sandwich?!'],
    hello: ['You! Do you have a refined palate?', 'Out of my kitchen! ...unless you\'re hungry.'],
    test: {
      ask: 'My famous stew. What does it need?',
      answers: [['More salt. Always more salt.', true], ['A fire extinguisher.', false], ['Nothing, it\'s fine.', false]],
      good: 'YES! A true chef! A kindred spirit!',
      bad: 'Philistine! OUT of my kitchen!',
    },
    wants: 'sandwich', thanks: 'My sandwich! You found it! ...it\'s green. Perfect.',
    clue: 'Chef\'s secret: {clue}.', warn: 'That beast stole my roast! {tip} It eats {where}.',
  },
  {
    id: 'gran2', name: 'Great-Granny Wobble', animal: 'rabbit', sex: 'f', old: true, costume: 0x8a7a9a, accent: 0xf0e0f0, glasses: true,
    activity: 'read', sits: true, rooms: ['bedroom', 'living', 'nursery'], voice: 420,
    mutter: ['Ooh, he\'s going to kiss her...', 'Where did I put my teeth?', 'Chapter one. Again.'],
    hello: ['Is that you, Herbert? You\'ve shrunk.', 'Speak up, dearie, I\'m reading.'],
    test: {
      ask: 'Is it a good book? Have you read it?',
      answers: [['Read it? I LOVED it. The ending!', true], ['Books are boring.', false], ['Your book is upside down.', false]],
      good: 'Don\'t spoil it! Oh, you\'re lovely.',
      bad: 'Hmph. Herbert never liked books either.',
    },
    wants: 'wig', thanks: 'My Sunday hair! I look twenty again.',
    clue: 'I may be old, but I know {clue}.', warn: 'Be careful, Herbert. {tip} It lurks {where}.',
  },
];

// ---------- the clues they give ----------

/** How residents describe each room, without naming it. */
const ROOM_RIDDLES: Record<RoomType, string[]> = {
  landing: ['right by the stairs', 'where everyone comes in'],
  kitchen: ['where the pots bang', 'where it smells of old soup'],
  bedroom: ['where somebody snores', 'where the beds creak'],
  bathroom: ['where things get washed. Or not', 'where it drips all night'],
  library: ['among the dusty stories', 'where the books whisper'],
  living: ['near a warm fire', 'where the sofas sag'],
  dining: ['where dinner is never served', 'where the plates are always laid'],
  nursery: ['where babies used to cry', 'where the toys stare'],
  study: ['where someone writes and writes', 'among the ink and papers'],
  storage: ['with all the old junk', 'among the crates and cobwebs'],
};

const ROOM_PLAIN: Record<RoomType, string> = {
  landing: 'the landing', kitchen: 'the kitchen', bedroom: 'a bedroom', bathroom: 'the bathroom', library: 'the library',
  living: 'the living room', dining: 'the dining room', nursery: 'the nursery', study: 'the study', storage: 'the storage room',
};

const THING_NAMES: Partial<Record<FurnitureKind, string>> = {
  wardrobe: 'a wardrobe', bookcase: 'a bookcase', chest: 'a chest', dresser: 'some drawers', crate: 'a crate', barrel: 'a barrel',
  vase: 'a vase', laundry: 'the laundry', bed: 'a bed', toilet: 'the toilet', bathtub: 'the bathtub', sinkCab: 'the sink',
  oven: 'the oven', fridge: 'the fridge', counter: 'a cupboard', table: 'a table', sofa: 'the sofa', armchair: 'an armchair',
  fireplace: 'the fireplace', painting: 'a painting', toybox: 'the toy box', cradle: 'the cradle', desk: 'a desk', clock: 'the clock',
  piano: 'the piano', plant: 'a plant pot', trash: 'the bin', sack: 'a sack', rug: 'a rug', boxes: 'some boxes',
};

const pickOf = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * A clue about the key: plainer on easy, a riddle about the room on harder levels; a happy
 * resident (you gave them what they wanted) also says what it's in.
 */
export function keyClue(d: Difficulty, room: RoomType, thing: FurnitureKind, generous: boolean) {
  const where = d === 'easy' ? `it's in ${ROOM_PLAIN[room]}` : `a key went somewhere ${pickOf(ROOM_RIDDLES[room])}`;
  return generous || d === 'easy' ? `${where}, in ${THING_NAMES[thing] ?? 'something'}` : where;
}

/** How each monster is beaten, as a resident would put it. */
export const FIGHT_TIPS: Record<MonsterName, string[]> = {
  Gribbles: ['When Gribbles wiggles his bottom, he\'s about to jump: roll away!', 'Gribbles bites high. Duck, and he snaps at air.'],
  Claught: ['When the floor cracks under you, MOVE. That\'s Claught coming up.', 'Claught is slow. Hit him after his big slam.'],
  Zegron: ['Duck under Zegron\'s tongue, and jump his tail.', 'If you can\'t see Zegron, look for the shimmer.'],
  Sieger: ['Sieger\'s armour is all at the front. Get round the back!', 'Make Sieger charge into a wall. He gets dizzy.'],
  Slashner: ['Slashner\'s spinning blades fly at your head: duck!', 'When Slashner vanishes in smoke, turn round. He comes from behind.'],
};

export function where(room: RoomType | null) {
  return room ? pickOf(ROOM_RIDDLES[room]) : 'somewhere in the dark';
}
