// The odd people who live in the house. Three per floor, each doing their thing in a room that
// suits them. Talk to them the way they like (each has their own test) and they'll give you a clue
// about the key or warn you about the monster. Give them what they want and they'll say more.
import type { Animal } from './heroes';
import type { SearchAction } from './furniture';
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
  /**
   * Their quiz: five of these are asked, in any order, as [question, right answer, wrong, wrong].
   * The right answer is whatever pleases *them*, which isn't always the polite one.
   */
  quiz: [string, string, string, string][];
  /** What they say after a right answer, and after a wrong one they let slide. */
  nod: string[];
  frown: string[];
  /** When you pass the quiz, and when you fail it. */
  good: string;
  bad: string;
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
    quiz: [
      ['Did I ever tell you about the war of the toasters?', 'No! Tell me everything.', 'Yes. Twice. Today.', 'Can\'t talk, looking for a key.'],
      ['In my day we walked to school. How far, do you think?', 'Uphill. Both ways. In the snow.', 'Two streets?', 'Didn\'t you have a bus?'],
      ['Young people these days. What\'s wrong with them?', 'No manners. And no hats.', 'Nothing, we\'re great.', 'Old people always say that.'],
      ['Shall I tell you about my knee?', 'Please do. Which knee?', 'Is it a short story?', 'I\'d rather not.'],
      ['What\'s the best smell in the world?', 'Pipe smoke and old slippers.', 'Fresh air.', 'Flowers.'],
      ['What do you call a monster with good manners?', 'A gentleman, sir.', 'A mon-ster-er?', 'Dinner.'],
    ],
    nod: ['Good, good.', '*puff* Quite right.'], frown: ['Eh? Speak up, that was rubbish.', 'Hrmph. Never mind.'],
    good: '...and that\'s how I lost my eyebrows. Good listener, you are.',
    bad: 'Kids today. No patience. Off you go.',
    wants: 'tooth', thanks: 'My tooth! I was wondering where that went. *click*',
    clue: 'I saw something shiny... {clue}. Or was that 1953?', warn: 'Careful, youngster. {tip} It hangs about {where}.',
  },
  {
    id: 'granny', name: 'Granny Gristle', animal: 'cat', sex: 'f', old: true, costume: 0x6a3a4a, accent: 0xe8e0d0, hat: 'bonnet',
    activity: 'stir', rooms: ['kitchen', 'dining'], voice: 380,
    mutter: ['A pinch of toad... a dash of sock...', 'Mmm. Needs more eyeball.', '*stir stir stir*'],
    hello: ['Hungry, dearie? You look hungry.', 'Come in, come in! Mind the cauldron.'],
    quiz: [
      ['Taste my soup, dearie. How is it?', 'Delicious! What\'s in it?', 'It moved.', 'No thanks, I\'m not hungry.'],
      ['What does a soup need most?', 'A good long stir. And a toad.', 'Salt.', 'A recipe.'],
      ['Would you like seconds?', 'Yes please! A big bowl!', 'I haven\'t finished my firsts.', 'Is that an eyeball floating?'],
      ['Where do frogs go in winter, dearie?', 'Into your soup, Granny?', 'Into the pond.', 'To sleep in the mud.'],
      ['Which is the nicest spoon?', 'The wooden one with teeth marks.', 'The shiny silver one.', 'I don\'t care about spoons.'],
      ['Are you eating properly, dearie?', 'Not really. Feed me!', 'Yes, five fruits a day.', 'I only eat sweets.'],
    ],
    nod: ['Good child.', 'Ooh, you\'re sweet.'], frown: ['Tsk.', 'That\'s no way to talk to Granny.'],
    good: 'Oh, you charmer! It\'s mostly beetles.',
    bad: 'Hmph. NO soup for you, then.',
    wants: 'spoon', thanks: 'A SPOON! Finally I can stop stirring with my tail.',
    clue: 'Between you and me, dearie: {clue}.', warn: 'Listen, dearie. {tip} It sniffs about {where}, after my soup.',
  },
  {
    id: 'professor', name: 'Professor Mothball', animal: 'duck', sex: 'm', old: true, costume: 0x3a4a3a, accent: 0xc8a040, glasses: true,
    activity: 'read', sits: true, rooms: ['library', 'study'], voice: 300,
    mutter: ['Fascinating. Utterly fascinating.', 'Chapter 412...', 'Hmm. Footnotes.'],
    hello: ['Shh! This is a library. Well, it is now.', 'Ah. A student. Late, as usual.'],
    quiz: [
      ['What has keys but opens no doors?', 'A piano!', 'A locksmith with no friends.', 'Is this going to be on the test?'],
      ['What gets wetter the more it dries?', 'A towel!', 'A fish.', 'The bath.'],
      ['What has a neck but no head?', 'A bottle!', 'A ghost.', 'A giraffe in a hat.'],
      ['How many legs does a spider have? Precisely.', 'Eight.', 'Six.', 'Far too many.'],
      ['What has hands but cannot clap?', 'A clock!', 'A snake.', 'A sleepy monkey.'],
      ['What runs but never walks?', 'A river!', 'A hamster.', 'My nose.'],
      ['And what, pray, is a library for?', 'Reading. Silently.', 'Hiding from monsters.', 'Building forts out of books.'],
    ],
    nod: ['Correct.', 'Hm. Acceptable.'], frown: ['Wrong. Do pay attention.', 'Incorrect. Tsk.'],
    good: 'Correct! You may stay. Quietly.',
    bad: 'Wrong. Go and read something.',
    wants: 'eye', thanks: 'A spare eye! For reading the small print. Marvellous.',
    clue: 'According to my notes, {clue}.', warn: 'Scientific observation: {tip} Specimen last seen {where}.',
  },
  {
    id: 'auntie', name: 'Auntie Pickle', animal: 'lizard', sex: 'f', old: true, costume: 0x4a6a4a, accent: 0xd04a4a,
    activity: 'knit', sits: true, rooms: ['bedroom', 'nursery', 'living'], voice: 340,
    mutter: ['Knit one, purl one, bite one...', 'This scarf is for the monster. It\'s chilly.', '*click click click*'],
    hello: ['Well, well. Do you have manners, child?', 'Wipe your feet. Both of them.'],
    quiz: [
      ['And how do we greet a lady?', 'Good evening, madam. Lovely scarf!', 'Yo.', '*bow so low you fall over*'],
      ['What do we say when someone knits us a scarf?', 'Thank you, it\'s beautiful!', 'It\'s itchy.', 'I already have one.'],
      ['Elbows. Where do they go at dinner?', 'Off the table, Auntie.', 'On the table.', 'In the soup.'],
      ['What colour should my next scarf be?', 'Whatever you choose, Auntie. You have taste.', 'Purple with yellow spots!', 'Scarves are boring.'],
      ['Do you know how to knit?', 'No, but I\'d love to learn.', 'Knitting is for grannies.', 'Yes. Better than you.'],
      ['Someone burped. Was it you?', 'Pardon me, Auntie. It was.', 'Better out than in!', 'It was the cat.'],
    ],
    nod: ['Better.', 'Hm. Not bad.'], frown: ['Manners!', 'I beg your pardon?!'],
    good: 'Finally, someone raised properly.',
    bad: 'Dreadful. Simply dreadful. Go away.',
    wants: 'sock', thanks: 'A sock! Now I can knit its twin. How thoughtful.',
    clue: 'Since you asked nicely: {clue}.', warn: 'A word of warning, dear. {tip} It lurks {where}.',
  },
  {
    id: 'twins', name: 'Pip and Squeak', animal: 'rabbit', sex: 'm', kid: true, costume: 0x8a6a2a, accent: 0x5a8ad0, hat: 'cap',
    activity: 'marbles', rooms: ['nursery', 'landing', 'storage'], voice: 650,
    mutter: ['My eyeball! MY eyeball!', 'Cheater!', 'Hee hee hee.'],
    hello: ['Wanna play marbles? They\'re eyeballs.', 'You\'re not a grown-up, are you? You look funny.'],
    quiz: [
      ['Pick an eyeball. Blue or green?', 'Green. Obviously.', 'Eww, no.', 'I\'m too busy for games.'],
      ['What\'s the best thing to keep in your pocket?', 'A snail. A wet one.', 'Money.', 'A clean hanky.'],
      ['Do you want to be in our secret club?', 'Yes! What\'s the password?', 'Clubs are silly.', 'Only if I\'m the boss.'],
      ['Guess what we had for breakfast!', 'Worms on toast?', 'Cereal?', 'Was it eggs?'],
      ['Are grown-ups weird?', 'SO weird.', 'No, they\'re nice.', 'I\'m nearly a grown-up.'],
      ['Squeak can lick his own eyeball. Can you?', 'Not yet, but I\'m practising.', 'That\'s impossible.', 'Gross, stop it.'],
    ],
    nod: ['YAY!', 'Hee hee! Yes!'], frown: ['Boring!', 'Pip, that was a GROWN-UP answer.'],
    good: 'YAY! You win! You always win green.',
    bad: 'Boooring. You\'re a grown-up after all.',
    wants: 'eye', thanks: 'A NEW ONE! It\'s the shiniest eyeball EVER.',
    clue: 'We saw it! We saw it! {clue}!', warn: 'There\'s a monster! {tip} We saw it {where}! Don\'t tell!',
  },
  {
    id: 'dribble', name: 'Little Dribble', animal: 'pig', sex: 'm', kid: true, costume: 0x6a6a3a, accent: 0xb0a080,
    activity: 'bugs', rooms: ['storage', 'kitchen', 'bathroom'], voice: 560,
    mutter: ['This one\'s called Gerald.', '*sniff* ...*sniff*', 'Bugs are my best friends.'],
    hello: ['Wanna see my bugs?', 'Shh. You\'ll wake the beetles.'],
    quiz: [
      ['Which is the best bug? Be honest.', 'The slimy one. Definitely.', 'None of them. Gross.', 'Can I squash one?'],
      ['Do bugs need names?', 'Of course! That one\'s a Kevin.', 'Bugs don\'t have names.', 'Just call them all Bug.'],
      ['Want to hold Gerald?', 'Yes! Hello, Gerald!', 'Is he clean?', 'No way.'],
      ['What does Gerald have for pudding?', 'Mud pie!', 'Cake?', 'Bugs don\'t have pudding.'],
      ['Would you lick a slug for a sweet?', 'For TWO sweets.', 'Never ever.', 'Only a clean slug.'],
      ['Why are you holding your nose?', 'I\'m not! You smell lovely!', 'You smell a bit.', 'Something died in here.'],
    ],
    nod: ['Hee!', 'Gerald likes that.'], frown: ['*sniff* Mean.', 'Gerald didn\'t like that.'],
    good: 'That\'s Gerald! He likes you too!',
    bad: 'You\'re mean. Gerald\'s crying now.',
    wants: 'spider', thanks: 'A SPIDER! A dead one! Best. Day. Ever.',
    clue: 'Gerald says {clue}.', warn: 'Gerald\'s scared of the monster. {tip} It lives {where}.',
  },
  {
    id: 'agnes', name: 'Wee Agnes', animal: 'duck', sex: 'f', kid: true, costume: 0xc87090, accent: 0xf0e0f0, hat: 'bonnet',
    activity: 'tea', rooms: ['nursery', 'dining', 'bedroom'], voice: 700,
    mutter: ['More tea, Mister Button?', 'Mister Button is very rude today.', 'Pinkies UP.'],
    hello: ['You\'re late for tea. Mister Button is cross.', 'Sit! Tea party! Now!'],
    quiz: [
      ['Mister Button wants to know: one lump or two?', 'Three lumps, and pinkie up, please.', 'Your doll can\'t talk.', 'I don\'t drink tea.'],
      ['Do you like Mister Button\'s hat?', 'It\'s the finest hat I\'ve ever seen.', 'He isn\'t wearing a hat.', 'It\'s a bit small.'],
      ['What do we eat at a tea party?', 'Invisible cake. Yum!', 'There isn\'t any food.', 'Proper sandwiches.'],
      ['Mister Button just told a joke. Did you laugh?', 'HAHAHA! He\'s hilarious!', 'I didn\'t hear anything.', 'Dolls can\'t tell jokes.'],
      ['Who is the boss of this tea party?', 'Mister Button, of course.', 'You are!', 'Me!'],
      ['Would you like a biscuit? It\'s a pebble.', 'Crunchy! Thank you!', 'I\'ll break my teeth.', 'That\'s just a pebble.'],
    ],
    nod: ['Lovely.', 'Mister Button approves.'], frown: ['Mister Button is VERY disappointed.', 'Rude.'],
    good: 'Mister Button says you\'re ADORABLE.',
    bad: 'Mister Button says you can LEAVE.',
    wants: 'button', thanks: 'A button! Mister Button has a brother now!',
    clue: 'Mister Button whispered that {clue}.', warn: 'Mister Button is scared. {tip} He saw it {where}.',
  },
  {
    id: 'mortimer', name: 'Mortimer', animal: 'cat', sex: 'm', kid: true, costume: 0x3a3a4a, accent: 0xe8e8f0,
    activity: 'hide', rooms: ['bedroom', 'study', 'landing', 'library'], voice: 620,
    mutter: ['...97, 98, 99...', 'Nobody ever finds me.', 'I\'m not here. Shh.'],
    hello: ['You FOUND me! Nobody ever finds me!', 'Shh! I\'m hiding. From everyone. For years.'],
    quiz: [
      ['Will you play hide and seek with me?', 'Sure! You hide, I\'ll count.', 'Your parents must be worried.', 'Found you. Game over.'],
      ['Where\'s the best place to hide?', 'Somewhere nobody looks. Like you do.', 'Under the bed.', 'Behind a curtain.'],
      ['How long do you think I\'ve been hiding?', 'Since... last Christmas?', 'Five minutes?', 'That\'s sad. Since forever.'],
      ['Are you my friend?', 'Best friends forever.', 'We only just met.', 'Maybe later.'],
      ['Can you keep a secret?', 'I won\'t tell a soul.', 'Depends what it is.', 'No, I tell everyone everything.'],
      ['Shh! Did you hear that?', '*whispers* Hear what?', 'WHAT? I CAN\'T HEAR YOU!', 'It\'s just the house creaking.'],
    ],
    nod: ['Yes!', '*happy whisper*'], frown: ['Shh! Too loud.', '...oh.'],
    good: 'Really? You\'re my best friend now. Forever. FOREVER.',
    bad: 'Fine. I\'ll go back to hiding. For more years.',
    wants: 'duck', thanks: 'A duck! Now I have someone to hide with.',
    clue: 'I hide everywhere, so I know: {clue}.', warn: 'I hide from the monster too. {tip} It looks for me {where}.',
  },
  {
    id: 'ophelia', name: 'Madame Ophelia', animal: 'cat', sex: 'f', old: true, costume: 0x5a2a6a, accent: 0xe8c040, hat: 'turban',
    activity: 'cards', sits: true, rooms: ['dining', 'living', 'study'], voice: 330,
    mutter: ['The cards... they whisper...', 'Ooooh. The Moon. Not good.', 'I knew you\'d come.'],
    hello: ['I knew you would come. The cards told me.', 'Sit. Your future awaits. Five coins. Kidding.'],
    quiz: [
      ['Do you believe in the cards, child?', 'Of course. Read mine!', 'They\'re just bits of paper.', 'Can they find keys?'],
      ['Pick a card. But not with your hand.', '*pick it with your mind*', '*pick it with your foot*', '*pick it with your hand anyway*'],
      ['What is your star sign?', 'You tell me, Madame. You already know.', 'I don\'t know.', 'Stars aren\'t signs.'],
      ['The crystal ball is cloudy. What do we do?', 'Wait patiently and hum.', 'Wipe it with my sleeve.', 'Shake it!'],
      ['Do you know what I know?', 'Everything, Madame.', 'Nothing much.', 'Where the key is?'],
      ['The cards say you brought me a gift. Did you?', 'My visit is the gift, Madame.', 'No.', 'Do the cards ever lie?'],
    ],
    nod: ['The cards agree.', 'Mmm. As foreseen.'], frown: ['The cards frown.', 'The spirits groan.'],
    good: 'A believer! The cards smile upon you.',
    bad: 'The cards say: you are rude. And smelly.',
    wants: 'crown', thanks: 'A crown! The cards said a queen would come. It was me.',
    clue: 'The cards speak... {clue}.', warn: 'I see danger... {tip} The cards show it {where}.',
  },
  {
    id: 'colonel', name: 'Colonel Crumb', animal: 'bear', sex: 'm', old: true, costume: 0x4a5a3a, accent: 0xc8a040, hat: 'nightcap',
    activity: 'snore', sits: true, rooms: ['living', 'study', 'library'], voice: 130,
    mutter: ['ZZZzzz... charge... zzz...', '*snort* Who goes there?! ...zzz', 'Zzzz... more custard...'],
    hello: ['*SNORT* WHO GOES THERE?! State your business!', 'Hrrumph! At ease, at ease.'],
    quiz: [
      ['Are you a soldier, private?', '*salute* YES, SIR! Reporting for duty!', 'You were asleep.', 'Shh, go back to sleep.'],
      ['What\'s the password?', 'CUSTARD, SIR!', 'Please?', 'Password one two three?'],
      ['Was I sleeping on duty, private?', 'NEVER, SIR!', 'A little bit, sir.', 'You were snoring, sir.'],
      ['How does one answer a colonel?', 'LOUDLY, SIR!', 'Politely, sir.', '*whisper* Quietly, sir.'],
      ['Have you seen the enemy?', 'Not yet, sir! Eyes peeled, sir!', 'What enemy?', 'Is it you?'],
      ['Drop and give me ten!', '*do ten push-ups*', '*do one and lie down*', 'Ten what?'],
    ],
    nod: ['SPLENDID!', 'Good show!'], frown: ['WHAT?! ...hmm.', 'Sloppy, private. Sloppy.'],
    good: 'Splendid! Splendid! Here\'s the intelligence.',
    bad: 'Insubordination! Dismissed! ...zzz',
    wants: 'letter', thanks: 'A letter! From my sweetheart! In 1922! At last!',
    clue: 'Intelligence report: {clue}. Over.', warn: 'Enemy spotted! {tip} Last position: {where}. Over!',
  },
  {
    id: 'chef', name: 'Uncle Spatula', animal: 'pig', sex: 'm', old: true, costume: 0xe8e0d0, accent: 0xd04a4a, hat: 'chef',
    activity: 'stir', rooms: ['kitchen', 'dining', 'storage'], voice: 210,
    mutter: ['More salt! MORE SALT!', 'Mmm. Needs a sock.', 'Who ate my sandwich?!'],
    hello: ['You! Do you have a refined palate?', 'Out of my kitchen! ...unless you\'re hungry.'],
    quiz: [
      ['My famous stew. What does it need?', 'More salt. Always more salt.', 'A fire extinguisher.', 'Nothing, it\'s fine.'],
      ['What is the king of all ingredients?', 'Salt.', 'Cheese.', 'Chocolate.'],
      ['Who ate my sandwich?!', 'Not me, Chef! Never!', 'The cat?', 'Me. It was green.'],
      ['Taste this. Too salty?', 'There\'s no such thing as too salty!', 'Way too salty.', 'A little bit, yes.'],
      ['Is Granny Gristle a better cook than me?', 'Never! You\'re the best!', 'Her soup is lovely.', 'You\'re both a bit odd.'],
      ['Do you wash your hands before cooking?', 'Twice, Chef! With soap!', 'Sometimes.', 'Why would I?'],
    ],
    nod: ['Ha! Yes!', 'Magnifique!'], frown: ['Philistine!', 'NON!'],
    good: 'YES! A true chef! A kindred spirit!',
    bad: 'Philistine! OUT of my kitchen!',
    wants: 'sandwich', thanks: 'My sandwich! You found it! ...it\'s green. Perfect.',
    clue: 'Chef\'s secret: {clue}.', warn: 'That beast stole my roast! {tip} It eats {where}.',
  },
  {
    id: 'gran2', name: 'Great-Granny Wobble', animal: 'rabbit', sex: 'f', old: true, costume: 0x8a7a9a, accent: 0xf0e0f0, glasses: true,
    activity: 'read', sits: true, rooms: ['bedroom', 'living', 'nursery'], voice: 420,
    mutter: ['Ooh, he\'s going to kiss her...', 'Where did I put my teeth?', 'Chapter one. Again.'],
    hello: ['Is that you, Herbert? You\'ve shrunk.', 'Speak up, dearie, I\'m reading.'],
    quiz: [
      ['Is it a good book? Have you read it?', 'Read it? I LOVED it. The ending!', 'Books are boring.', 'Your book is upside down.'],
      ['Herbert, is that you?', 'Yes, Granny. It\'s Herbert.', 'I\'m not Herbert.', 'Who\'s Herbert?'],
      ['Do you think he\'ll kiss her?', 'Ooh, I hope so!', 'Yuck!', 'Who cares?'],
      ['Have you seen my teeth?', 'They\'re in the teacup again, Granny.', 'No, sorry.', 'You\'re wearing them.'],
      ['What did you say, dearie?', 'I SAID HELLO, GRANNY!', 'I said hello.', 'Nothing.'],
      ['Shall I read you a bit?', 'Oh yes please, Granny!', 'Can you skip to the end?', 'Is it a long bit?'],
    ],
    nod: ['Lovely, Herbert.', 'Ooh, you\'re a dear.'], frown: ['Hmph, Herbert.', 'What a thing to say!'],
    good: 'Don\'t spoil it! Oh, you\'re lovely.',
    bad: 'Hmph. Herbert never liked books either.',
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

const pickOf = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** How you'd have to search for it, without saying what it's in. */
const HOW: Record<SearchAction, string[]> = {
  open: ['it\'s shut away behind a door or a lid', 'it\'s locked up in something. Well, closed'],
  dig: ['you\'ll have to rummage for it', 'it\'s buried in something. Get your paws dirty'],
  push: ['it slipped behind something big and heavy', 'it\'s behind something you\'ll have to shove'],
  smash: ['it\'s inside something that breaks', 'you\'ll have to break something. Oops'],
  under: ['it\'s underneath something', 'it\'s hiding under something, low down'],
  lift: ['you\'ll have to lift something up', 'it\'s under a lid or a flap'],
  pull: ['it\'s behind something hanging on a wall', 'something on a wall is hiding it'],
  none: ['it\'s hidden in something'],
};

const SIDE: Record<'left' | 'right' | 'back' | 'front' | 'middle', string[]> = {
  left: ['it\'s over on the left side of the house', 'it\'s somewhere left. My left. Your left? Left'],
  right: ['it\'s over on the right side of the house', 'it\'s somewhere to the right'],
  back: ['it\'s at the back of the house, far from the front', 'it\'s up at the back somewhere'],
  front: ['it\'s near the front of the house', 'it\'s close to the front wall'],
  middle: ['it\'s right in the middle of the house', 'it\'s in the heart of the house'],
};

const FAR = {
  near: ['it\'s not far from the stairs you came up', 'it\'s a short walk from the stairs'],
  far: ['it\'s a long way from the stairs you came up', 'you\'ll walk a long way for it. Bring a snack'],
};

/** Everything about where the key is that a resident might let slip. */
export interface KeyFacts {
  room: RoomType;
  how: SearchAction;
  side: keyof typeof SIDE;
  /** Rooms with a door into the key's room. */
  next: RoomType[];
  /** How many rooms away from the start it is. */
  steps: number;
}

type Fact = 'room' | 'how' | 'side' | 'next' | 'far';

/**
 * One vague fact about the key (two if you gave them what they wanted), never where exactly it is.
 * Easy floors say which room; harder ones only hint (how you'd search, which side of the house,
 * what's next door, how far from the stairs). Facts already given on this floor are avoided, so
 * talking to everyone narrows it down.
 */
export function keyClue(d: Difficulty, k: KeyFacts, generous: boolean, given: Set<string>) {
  let kinds: Fact[];
  if (d === 'easy') kinds = generous ? ['room', 'how'] : ['room'];
  else {
    const pool: Fact[] = d === 'hard' && !generous ? ['how', 'side', 'far'] : ['how', 'side', 'next', 'far'];
    const usable = pool.filter((f) => f !== 'next' || k.next.length);
    const fresh = usable.filter((f) => !given.has(f)).sort(() => Math.random() - 0.5);
    const old = usable.filter((f) => given.has(f)).sort(() => Math.random() - 0.5);
    kinds = [...fresh, ...old].slice(0, generous ? 2 : 1);
  }
  for (const f of kinds) given.add(f);
  return kinds.map((f) => {
    switch (f) {
      case 'room': return `it's somewhere ${pickOf(ROOM_RIDDLES[k.room])}`;
      case 'how': return pickOf(HOW[k.how]);
      case 'side': return pickOf(SIDE[k.side]);
      case 'next': return `it's next door to ${pickOf(ROOM_RIDDLES[pickOf(k.next)]).replace(/^(near|among|right by|with) /, 'the place $1 ')}`;
      case 'far': return pickOf(k.steps >= 2 ? FAR.far : FAR.near);
    }
  }).join('. Also, ');
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
