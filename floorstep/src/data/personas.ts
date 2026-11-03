// Each hero talks (and thinks) in their own way:
//   Guzzard, the wizard: pompous, grumpy, a bit of a coward, complains in long words.
//   MightyMac, the knight: earnest, chivalrous, not very bright; everything is duty and honour (and sniffing).
//   Gronkers, the barbarian: loud, simple, always hungry, talks about himself in the third person.
//   Shifumi, the thief: sly, twitchy, greedy for shiny things; "borrows", whispers, sarcastic.
// Anything a hero has no line for falls back to the shared lines in lines.ts.
// {item} is what was found, {floor} the floor number.
import type { FurnitureKind } from './furniture';
import type { HeroClass } from './heroes';
import type { RoomType } from './rooms';

export type LineKey =
  | 'arrive' | 'empty' | 'emptyMany' | 'key' | 'locked' | 'unlock' | 'idle' | 'bat' | 'mouse' | 'spider' | 'smashed'
  | 'catStartle' | 'catPet' | 'die' | 'reunionCall' | 'reunion' | 'bolts' | 'pant' | 'whoa' | 'battleCry' | 'noMagic'
  | 'notNow' | 'fightStart' | 'fightWin' | 'fightFled' | 'hurt' | 'parry' | 'junk' | 'heal';

export interface Persona {
  lines: Partial<Record<LineKey, string[]>>;
  rooms: Partial<Record<RoomType, string[]>>;
  kinds: Partial<Record<FurnitureKind, string[]>>;
}

export const PERSONAS: Record<HeroClass, Persona> = {
  wizard: {
    lines: {
      arrive: ['Floor {floor}. Marvellous. More stairs.', 'Floor {floor}. I was promised a quiet retirement.', 'Another floor of filth and peril. Splendid.', 'Youser, I hope you appreciate my knees.'],
      empty: ['Empty. As predicted.', 'Nothing. How utterly typical.', 'Dust. I am allergic to dust.', 'Not here. Obviously.', 'A waste of a perfectly good wizard.'],
      emptyMany: ['I have a doctorate in magic, and I am rummaging through SOCK DRAWERS.', 'If I were a key, where would I... no, I refuse to think like a key.', 'This is beneath me. Literally, sometimes.', 'Somebody hid this key out of pure spite.'],
      key: ['Aha! Elementary.', 'The key! I knew it all along. Mostly.', 'Behold! My superior intellect.'],
      locked: ['Locked. A simple spell would... no. I forgot the spell.', 'Locked. How unsporting.'],
      unlock: ['Onwards and, regrettably, upwards.', 'Open! Youser, Uncle Guzzard is coming.'],
      idle: ['I am too old for this.', 'In my day, houses had fewer monsters.', '*mutters a minor curse*', 'Why is it always a haunted house? Why never a nice library?'],
      bat: ['AAAH! Unhand me, foul rodent of the air!', 'A BAT! In my HAT!'],
      mouse: ['A mouse. Shoo. I have a sword.', 'Vermin. How very unhygienic.'],
      spider: ['EEEK! Eight legs is SEVEN TOO MANY!', 'A spider! Nobody saw me scream.'],
      smashed: ['Oops. That was probably priceless.', 'Science requires sacrifices.'],
      catStartle: ['GAH! Wretched feline!', 'I am NOT scared of a cat. That was a sneeze.'],
      catPet: ['Fine. Good cat. Now go away.', 'Hm. Soft. Tolerable.'],
      die: ['I knew I should have stayed home...', 'Tell them... I was brave... ish...'],
      reunionCall: ['YOUSER! Uncle Guzzard is here!'],
      reunion: ['There you are! I was not worried. At all. Not one bit.', 'Youser! Never wander off again. My heart can\'t take it.'],
      pant: ['*wheeze* ...my lungs...', '*pant* ...too old...'],
      whoa: ['Whoa! My dignity!'],
      noMagic: ['Out of magic! Typical.', 'My magic needs a nap.'],
      notNow: ['I shall save my magic for something worthier.', 'I am not wasting a spell on furniture.'],
      fightStart: ['Oh dear. Oh dear oh dear.', 'Stand back! I am... a very dangerous wizard!', 'Must we? Very well.'],
      fightWin: ['Ha! Brains over brawn!', 'And THAT is why one reads books.'],
      fightFled: ['Yes, run! Run from the mighty Guzzard!', 'Coward! ...thank goodness.'],
      parry: ['Ha! Predictable.', 'I read about that move.'],
      junk: ['{item}. Fascinating. Useless, but fascinating.', '{item}? I shall keep it for... research.', 'Hm. {item}. I have seen better.'],
      heal: ['{item}. Hardly a balanced diet.', 'Ah, {item}. Restorative. Mildly.', '{item}! I feel twenty years younger. Well, fifteen.'],
    },
    rooms: {
      library: ['A library! Finally, civilisation!', 'Books! Mostly about monsters. Wonderful.'],
      kitchen: ['Who cooks in this filth?', 'It smells like a troll\'s armpit.'],
      bathroom: ['I am not touching anything.', 'Disgusting. Utterly.'],
      nursery: ['Children\'s toys. Creepy ones. Of course.'],
      bedroom: ['I could nap. Just five minutes. No? No.'],
      study: ['Ah, a fellow scholar lived here. A messy one.'],
    },
    kinds: {
      toilet: ['I am a WIZARD. I do not look in toilets.', 'The things I do for that bunny.'],
      bookcase: ['First editions! ...no time. Sigh.'],
      fridge: ['Something in there is evolving.'],
      piano: ['Hm. Out of tune. Like my life.'],
      cradle: ['A doll. Staring. I hate this house.'],
      fireplace: ['Hot! HOT! My beard!'],
    },
  },
  knight: {
    lines: {
      arrive: ['Floor {floor}! For honour!', 'MightyMac reporting for duty, floor {floor}!', 'Fear not, Youser! A knight is coming!', 'Floor {floor}. *sniff sniff* Smells like adventure.'],
      empty: ['Nothing! But I searched with honour.', 'Empty. A setback, not a defeat!', '*sniff* Nope.', 'Not here! Onward!'],
      emptyMany: ['A true knight never gives up! ...but this is a LOT of drawers.', 'Key, I command you to show yourself!', 'My nose has failed me. For now.'],
      key: ['The key! Duty fulfilled!', 'HUZZAH! The key!', 'Found it! Good boy, me.'],
      locked: ['Locked! A knight needs the key.', 'The door resists. I respect that.'],
      unlock: ['Onward and upward!', 'For Youser! CHARGE! ...up the stairs.'],
      idle: ['*sniffs the air*', 'I could do with a nice stick right now.', 'Stand tall, MightyMac. Stand tall.', 'Is that... a squirrel? No. Focus.'],
      bat: ['Fly away, foul beast! ...please.', 'A BAT! En garde!'],
      mouse: ['A mouse! *tail wags* NO. Focus.', 'Good day, small sir!'],
      spider: ['A spider! I shall... let it live. Mercy is a virtue.', 'EEP! Ahem. I mean: HALT, spider!'],
      smashed: ['For the good of the quest!', 'I will pay for that. Someday.'],
      catStartle: ['A CAT! *growls* ...sorry. Instinct.', 'Woof! I mean... pardon me, madam cat.'],
      catPet: ['Friends? Friends!', 'A noble cat. I salute you.'],
      die: ['I have... failed my duty...', 'Tell Youser... I tried...'],
      reunionCall: ['YOUSER! Your knight is here!'],
      reunion: ['Youser! Duty complete! Best day EVER!', 'I found you! Good boy, me! GOOD BOY!'],
      pant: ['*pant pant* ...tongue out...', '*pant* Heavy armour...'],
      whoa: ['Whoa! Steady, MightyMac!'],
      notNow: ['My shield is for monsters, not furniture.', 'A knight saves his strength!'],
      battleCry: ['FOR HONOUR!'],
      fightStart: ['Have at thee, fiend!', 'En garde! For Youser!', 'I am MightyMac, and I fear nothing! Mostly.'],
      fightWin: ['Victory! For honour!', 'Justice is served! ...can I have a biscuit?'],
      fightFled: ['Run, coward! A knight does not chase. Much.', 'Flee, foul beast!'],
      parry: ['Blocked!', 'My shield is my friend!'],
      junk: ['{item}! For the quest!', '{item}. *sniff* Interesting.', 'A knight finds {item}! I shall keep it safe.'],
      heal: ['Rations! {item}! Thank you, kind house!', '{item}! *wags tail*', 'Mmm, {item}! A knight must keep his strength.'],
    },
    rooms: {
      kitchen: ['*sniff sniff* Sausages! Somewhere! Focus...'],
      bedroom: ['A bed. A knight sleeps on the floor. ...usually.'],
      dining: ['A feast table! Without a feast. Sad.'],
      storage: ['*sniff* Bones in here. I can smell them.'],
      bathroom: ['A bath. I hate baths.'],
    },
    kinds: {
      bathtub: ['A BATH. No. No no no.', 'Water. I shall search it... bravely.'],
      sofa: ['I am not allowed on the sofa. I shall search it anyway.'],
      trash: ['*sniff* ...must... not... eat...'],
      bed: ['Nothing under here but dust and fear.'],
      painting: ['A noble portrait! I salute you, sir.'],
    },
  },
  barbarian: {
    lines: {
      arrive: ['GRONKERS HERE. FLOOR {floor}.', 'More stairs. Gronkers hungry.', 'Floor {floor}! Gronkers smash floor {floor}!', 'Where food? Oh. Key. Right.'],
      empty: ['Nothing. Gronkers sad.', 'No key. No snack. Bad box.', 'Empty! GRR.', 'Gronkers find... air.'],
      emptyMany: ['Gronkers smash whole house soon.', 'KEY. COME OUT. NOW.', 'Gronkers bored. Gronkers hungry. Gronkers bored AND hungry.'],
      key: ['KEY! GRONKERS GENIUS!', 'Shiny! Gronkers find! Gronkers best!', 'Ha! KEY!'],
      locked: ['Door locked. Gronkers... knock? KNOCK KNOCK.', 'Door no open. Need key. Gronkers know.'],
      unlock: ['OPEN! Up, up, up!', 'Youser! Gronkers coming!'],
      idle: ['Gronkers think about lunch.', '*tummy rumbles*', 'Gronkers could eat a horse. Or a chair.', 'Hm. Gronkers forget what Gronkers doing.'],
      bat: ['BAT! Gronkers eat bat? ...no. Bat too bony.', 'GO AWAY FLAPPY!'],
      mouse: ['Little snack! ...no. Little friend.', 'Squeaky!'],
      spider: ['Spider tickle Gronkers nose. AH-CHOO!', 'Crunchy?'],
      smashed: ['SMASH! Gronkers LOVE smash.', 'Oops. Again. Gronkers not sorry.'],
      catStartle: ['Kitty scared of Gronkers. Gronkers sad.', 'Fluffy run away!'],
      catPet: ['Soft. Gronkers gentle. Very gentle.', 'Nice fluffy. Gronkers protect fluffy.'],
      die: ['Gronkers... need... snack...', 'Gronkers sleepy now...'],
      reunionCall: ['YOUSER! GRONKERS HERE!'],
      reunion: ['Youser! Gronkers hug! BIG hug! ...not too big.', 'Small friend safe! Gronkers happy happy!'],
      pant: ['*huff huff* Gronkers need nap.', '*puff* Big belly. Heavy.'],
      whoa: ['WHOA!'],
      battleCry: ['RAAAAAH!', 'GRONKERS SMASH!'],
      notNow: ['Gronkers smash monster, not air.', 'Save big smash for big monster.'],
      fightStart: ['Monster! GRONKERS SMASH!', 'You look crunchy.', 'RAAAH! Fight!'],
      fightWin: ['Gronkers WIN! Gronkers hungry now.', 'Ha! Monster squished!'],
      fightFled: ['Run away, little monster! HA!', 'Come back! Gronkers not finished!'],
      parry: ['Ha! Bonk back!', 'Nope!'],
      junk: ['{item}! Can Gronkers eat it? ...no.', 'Ooh. {item}. Gronkers keep.', '{item}. Gronkers not know what is. Gronkers keep anyway.'],
      heal: ['FOOD! *CHOMP CHOMP*', '{item}! *GULP* More?', 'Mmm. {item}. Gronkers feel better. Gronkers want ten more.'],
    },
    rooms: {
      kitchen: ['KITCHEN! Gronkers favourite room!', 'Food smell! Where food?!'],
      dining: ['Big table! No food! WHY?'],
      library: ['Many books. Gronkers not read. Gronkers look at pictures.'],
      nursery: ['Tiny toys. Gronkers careful. Very careful.'],
    },
    kinds: {
      fridge: ['FRIDGE! *opens* ...Gronkers eat later. Key first.', 'Cold food! Gronkers love cold food!'],
      oven: ['Oven! Gronkers smell pie! No pie. Lies.'],
      bookcase: ['Books. Heavy. Gronkers push!'],
      piano: ['*BONK BONK BONK* Gronkers make music!'],
      table: ['Under table: crumbs! Gronkers lick... no.'],
      crate: ['SMASH!'],
    },
  },
  thief: {
    lines: {
      arrive: ['Floor {floor}... *whispers* so many drawers...', 'Shh. Floor {floor}. Nobody saw me.', 'Floor {floor}. Smells of shiny things.', 'Nobody home? Perfect.'],
      empty: ['Nothing worth borrowing.', 'Empty. Someone beat me to it.', 'Tch. Picked clean.', 'Bah. Junk.'],
      emptyMany: ['A good thief finds anything. Except this key, apparently.', 'Whoever hid it is better than me. I hate them.', 'I\'ve robbed castles faster than this.'],
      key: ['Ooh. Shiny. Mine.', 'Got it. Nobody saw nothing.', 'The key! Too easy.'],
      locked: ['Locked. I could pick it... no. Too squeaky.', 'Locked. Rude.'],
      unlock: ['After you. No, after me.', 'Up we go. Quietly.'],
      idle: ['*looks over shoulder*', 'Did someone hear me? Nobody heard me.', '*twitches*', 'That candlestick would fit in my pocket...'],
      bat: ['SKREE! Oh. A bat. Not a hawk. Phew.', 'Fly off, you\'ll blow my cover!'],
      mouse: ['Hello, colleague.', 'A mouse. Fellow sneak. Respect.'],
      spider: ['A spider! ...lunch? No. Focus.', 'Eight legs. Show-off.'],
      smashed: ['So much for sneaky.', 'Loud. Very loud. Oops.'],
      catStartle: ['CAT! Every bird\'s nightmare! AAAH!', 'Don\'t eat me don\'t eat me don\'t eat me.'],
      catPet: ['Nice kitty. Please don\'t eat birds.', 'There. Friends. Right? RIGHT?'],
      die: ['Should\'ve... stayed... in the shadows...', 'Caught... at last...'],
      reunionCall: ['Youser! *whispers loudly* YOUSER!'],
      reunion: ['Youser! The best thing I ever stole back.', 'There you are, little one. Let\'s get out of here. Quietly.'],
      bolts: ['Bolts! Handy.', 'Ooh, bolts. Mine now.'],
      pant: ['*pant* ...out of breath... rookie mistake...'],
      whoa: ['Whoa! Careful!'],
      notNow: ['Smoke bombs are for emergencies.'],
      fightStart: ['A fight? I don\'t DO fights.', 'Oh, feathers.', 'Can we talk about this? No? Fine.'],
      fightWin: ['Didn\'t even break a feather.', 'Never saw me coming.'],
      fightFled: ['Yes, run along.', 'And stay gone.'],
      parry: ['Too slow.', 'Nope.'],
      junk: ['{item}. Shiny-ish. Mine.', 'Ooh, {item}. Into the pocket.', '{item}? It might be worth something. Probably not.'],
      heal: ['{item}! Free lunch, my favourite kind.', '{item}. Don\'t mind if I do.', 'Mmm, {item}. Stolen food tastes better.'],
    },
    rooms: {
      study: ['A desk. Desks always have secrets.'],
      library: ['Books. Can\'t sell books. Boring.'],
      dining: ['Silverware! ...plated. Fake. Ugh.'],
      bedroom: ['Bedrooms: where people hide the good stuff.'],
      kitchen: ['Any seeds? A bird can dream.'],
    },
    kinds: {
      chest: ['A chest! My favourite!', 'Locked chests are just puzzles.'],
      desk: ['Desks always have a secret drawer. Always.'],
      painting: ['Hidden safe behind the painting? Classic.'],
      clock: ['A clock. Can\'t sell clocks. Too loud.'],
      dresser: ['Jewellery? Please be jewellery.'],
      vase: ['Antique? *shakes* Nope, empty.'],
    },
  },
};
