# Games

Browser games built on a small shared 3D engine (Three.js + post-processing).

```
engine/      reusable engine: loop, renderer, camera, input, sound synth, particles, path-finding, save
blocstrike/  the first game
floorstep/   the second game
soccer/      the third game: Animal Soccer
tools/       headless-browser scripts: screenshots, staged mechanics, AI match simulation
```

## Run it

```sh
npm install
npm run dev        # Blocstrike → http://localhost:5173  (also reachable from other devices on the network)
npm run dev:floor  # Floor Step → http://localhost:5174
npm run dev:soccer # Animal Soccer → http://localhost:5175
```

Then press **F** for fullscreen.

## Blocstrike

Blue vs Red, 3 blocs + 1 baby bunny per team, **best of 5 rounds**. One hit knocks a bloc out; the bunny takes 3 hearts. A team loses the round when its bunny goes poof. Stand on a fallen teammate for 3 s to revive them; bunnies can revive too, in 2 s (everyone, bunnies included, can revive once per round). Don't fall in the pond: piranhas. Winning a match gives +10 bloccoins to spend in the **Shop** (bloc skins, hats, weapons — one shared wallet for both players).

**Arenas** (bought in the Shop, picked in **Play**): 🌳 Grassy Pond (piranha pond), 🌋 Volcano (island in lava, a sliding bridge that pulls apart), 🌴 Jungle (crocodile river, stone gates that rise and fall on the log bridges), 🏖️ Beach (sharks, a lagoon, a tide that comes in and out), 🏛️ Rocky Ruins (crumbling walls, quicksand that swallows you slowly — get out in time — and rolling boulders to jump over), ☁️ Cloud Heaven (floating islands, rainbow bridges, drifting clouds you can ride; fall off and you're gone). Explosions and the hammer break trees, crates, walls and sandcastles (rocks and pillars take two); flames burn trees and crates down. Everything grows back next round.

Computer players revive teammates depending on difficulty (easy: never, normal: sometimes and only when safe, hard: always). After 2 minutes a round goes to **sudden death** (everyone goes for the bunnies); after 4 it's a draw.

**Jump** (the old dash button): legs bend for 1 s, then a hop. In the air, spears, bullets, swords and flames pass underneath and you can hop over narrow water or lava; explosions still hit. 2 s before the next jump.

Weapons (you pick yours in **Play**; computer players get random ones for the whole match):

| | How it works |
|---|---|
| 🗡️ Spear | Throw, then walk over it to pick it up. Pierces up to 2 blocs. |
| ⚔️ Sword | Always in your hand, no reload. Slashes everything just in front (teammates too). |
| ✨ Light Saber | Like the sword with longer reach and faster swings. Slash at spears, bolts, bullets and rockets to send them back. |
| 🔨 Hammer | Slow smash: knocks out whoever is where it lands, shoves everyone around (into the water?), breaks props. |
| 🏹 Crossbow | Fast bolts that fly really far and pierce two blocs. Reloads by itself (no fetching). |
| 🚀 Bazooka | Rocket with a small blast that also pushes people (into the pond!). 3 s reload. |
| 💣 Big Grenade | **Hold** to throw further, release to throw. Bigger blast, 2 bunny hearts per hit, 5 per round. |
| 🔥 Flamethrower | **Hold** to spray. Short range, burns teammates too. 20 s of fuel per round. |
| 🔫 Machine Gun | **Hold** to fire for 2 s, then 2 s to reload. 2 bullets knock out a bloc; bunnies are small (bullets miss them more) and need 6 per heart. Bullets are slow enough to dodge. |
| 👊 Punch | When grenades or fuel run out, attack punches (hold to keep punching). Enemies only. 5 punches knock out a bloc; 2 punches take a bunny heart. Punches from teammates add up. |

| | Keyboard (P1) | Keyboard (P2) | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick / D-pad |
| Aim | facing direction | facing direction | Right stick |
| Attack | Space | Enter | A or RT |
| Jump | Left Shift | Right Shift | B or LB/RB |
| Pause | Esc | Backspace | Start |

Keys and devices can be changed in **Controls** (saved in the browser).

### Where to change things

Everything a designer would want to tweak lives in `blocstrike/src/data/`:

- `tuning.ts`: speeds, dash, revive time, bunny hearts, rounds to win, coins per win, computer-player skill
- `weapons.ts`: weapon list and prices; spear, bazooka, grenade and flamethrower numbers
- `hats.ts`: hat shop list and prices (models in `entities/hats.ts`)
- `arenas.ts`: the arenas: land shape, liquids, bridges, gates, props, spawns (left half is copied to the right)
- `blocs.ts`: bloc shop skins and prices
- `teams.ts`: team colours
- `controls.ts`: default keys and gamepad buttons
- `sounds.ts`: sound effects (recorded samples in `public/sfx/` from [Kenney](https://kenney.nl), CC0, plus a little synth)
- `text.ts`: every word shown on screen

Save the file and the browser reloads.

### On a TV

Plug the computer in with HDMI (a direct USB-C→HDMI adapter is more reliable than a hub), then press F.
If the edges are cut off, use **Settings → TV edge margin**. If it stutters, use **Settings → Graphics quality → Low**.

## Floor Step

A haunted house drawn like a comic book. Climb it floor by floor to free Youser the baby bunny, who is locked in at the
very top: **Easy** 5 floors, **Medium** 10, **Hard** 15. Each floor is a new set of rooms (kitchen, bedrooms, library,
bathroom, nursery…), generated fresh every game. Somewhere on each floor, one piece of furniture hides the **key** to the
locked door and the stairs up. Open wardrobes and chests, look under beds and tables, smash crates and vases, push
bookcases aside, dig through laundry, lift rugs and toilet lids, peek behind paintings. Some hold snacks and potions
(hearts), some junk, some a bat or a mouse. Rooms stay dark until you open their door. The game saves at every floor.

**Fight scenes.** Each floor has a monster prowling the house: **Gribbles** (goblin-rat), **Claught** (crab-bear),
**Zegron** (chameleon), **Sieger** (armoured beetle-knight), **Slashner** (blade-handed scarecrow). If it hasn't seen you,
you can still sneak off to another room. Once it sees you, the camera swings round to the side of the room and it's a
one-on-one fight on a line, arcade-style, until it runs away, dies, or you fall. Move with the stick, jump (stick up or Ⓐ),
crouch (stick down), hold block (standing blocks high and overhead blows, crouching blocks low sweeps; block right before a
hit to parry), dodge (Ⓑ: hop back, or roll right past it when pushing forward), Ⓧ light combo (press again in rhythm),
Ⓨ heavy. Combos: down+Ⓧ sweep (gets under a guard), down+Ⓨ rising strike (knocks it off its feet), forward+Ⓨ lunge,
Ⓧ/Ⓨ in the air for a chop. Specials (RT): magic blast, shield bash, ground slam, smoke-step behind it. Monsters show
every attack coming: duck high ones (Gribbles' swipe, Zegron's tongue, Slashner's blades), jump low ones (tails, spins,
rats), block overhead ones, and get out of the red rings (pounces, dives, crates, Claught bursting up from the floor).
Sieger can't be hurt from the front: jump or roll behind him, or make him charge into a wall. Each monster comes back
stronger on later appearances (Medium/Hard), wounded from last time, and blurts out a hint about the key when beaten.
Health only comes back from food, potions and petting the cat. 3 tries per floor, then it's back to floor 1.

**Residents.** Three odd characters live on every floor: old folk smoking pipes, stirring soups, reading enormous books,
knitting, telling fortunes or snoring over a newspaper, and weird kids playing marbles with eyeballs, collecting bugs,
holding tea parties for a doll or playing hide and seek alone. Talk to them (Ⓐ): each asks five questions picked at
random from their own set, and the right answer is whatever pleases *them* (the twins want gross answers, the Colonel
wants you to shout, Great-Granny wants you to be Herbert). One wrong answer is forgiven (two on Easy); any more and they
sulk for a while. Pass and you can ask about the monster (where it hangs out, how to beat it) or the key. Key clues are
only hints: how you'd have to search ("behind something heavy"), which side of the house, what's next door, or how far it
is from the stairs. Easy floors name the room as a riddle instead. Each resident on a floor tries to tell you something
new. Junk you find goes in your pocket; each resident wants something (a tooth, a spoon, an eyeball...), and giving it
skips the quiz and gets you two hints. They remember you on later floors. You can't search a chair someone's sitting
in, and when someone's standing next to what you want to search, face the thing to search it or face them to talk.

**Around the house:** a cat naps on beds and sofas (pet it, or startle it), spiders drop out of wardrobes, portraits'
eyes follow you, toilets flush, pianos plonk, clocks cuckoo, and the hero has something to say about most of it.

**The top floor:** Youser waits in a cage at the top of the last stairs. Open the door and... well, play it. Then the
end screen shows your run (time, things searched, monsters beaten, cats petted) and unlocks a costume colour.

Heroes: Guzzard (sword combo, 3 recharging magic blasts), MightyMac (long halberd thrusts, best block, shield bash),
Gronkers (huge club hits, poor block, ground slam that smashes furniture), Shifumi (crossbow bolts, then a fast knife;
smoke bomb; finds bolts while searching).

Each hero has their own voice for everything they find, see and fight. Guzzard, the duck, is a pompous, grumpy, slightly
cowardly scholar. MightyMac, the dog, is an earnest knight who isn't very bright and goes on about honour (and sniffs things).
Gronkers, the fat dragon, is loud and always hungry, and talks about himself in the third person. Shifumi, the weird bird,
is a twitchy sneak who "borrows" shiny things and is terrified of the cat.

Gamepad: stick move · Ⓐ search · Ⓧ attack (press again to combo) · Ⓨ heavy · RB/LB block (hold) · Ⓑ dodge · RT/LT special
Keys: WASD · E search · J attack · K heavy · L block · Space dodge · Q special · Esc pause
Everything can be rebound in **Controls** (title screen and pause menu), which also shows which controllers the browser
has found and lights up their buttons as you press them. Browsers only notice a controller after a button is pressed
with the game window in front.

Tweak it in `floorstep/src/data/`: `tuning.ts` (floors per difficulty, house size, hero speed, camera, how many quiz questions and slips), `furniture.ts`
(what can be searched, how, for how long), `rooms.ts` (room types, their floors, wallpaper and furniture; which furniture may appear more than once), `lines.ts`
(the shared hero lines, junk and snacks), `personas.ts` (each hero's own lines, plus what they say about rooms and furniture), `heroes.ts` (classes, animals, voices, weapons, colours, name ideas), `combat.ts` (every move's timing,
damage, reach, stamina; how patient monsters are per difficulty), `monsters.ts` (the five monsters: health, attacks per appearance with their heights, lines, key hints),
`residents.ts` (the residents: rooms, tests, wants, clue wording, fighting tips).

## Animal Soccer

Seven against seven, animal teams (baby bunnies, pigs, dogs, cats, ducks, raccoons, bears, mice), watched from the
stand like on TV. All teams play the same; only the animals and kits differ. You control one player: the one nearest
the ball switches to you automatically (yellow ring), or switch yourself. Keepers are run by the computer, but you take
over when yours has the ball in their hands.

**Modes:** Friendly (pick your team, 2×5 / 2×10 / 2×20 minutes, Easy / Medium / Hard; the opponent is drawn at random) and Training (your team, no
opponents, no clock). Cup and Penalty shootout are coming.

**Controls** (also on the Controls screen; buttons are tap = soft, hold = harder, with a power bar over your player):

| | Controller | Keyboard |
|---|---|---|
| Move | left stick / d-pad | WASD / arrows |
| Sprint (hold) | RB or RT | Shift |
| Switch player | LB or LT | Q |
| Pause | Start | Esc |
| **With the ball** | | |
| Pass (tap short, hold harder) | A | J |
| Shoot (hold for power; too much goes over) | X | K |
| Lob / cross (hold for distance) | B | L |
| Through ball (into space ahead of a teammate) | Y | I |
| **Defending** | | |
| Tackle | A | J |
| Slide tackle | B | L |
| A teammate presses too (hold) | X | K |
| **Keeper with the ball in hand** | | |
| Throw it out | A | J |
| Kick it long | X or B | K or L |
| **Free kicks and penalties** | | |
| Free kick: shoot (hold longer to get over the wall) | X | K |
| Your penalty: pick the corner, then shoot (not too long!) | stick + X | WASD + K |
| Their penalty: hold where your keeper will dive (up = high, nothing = stay) | stick | WASD |

Aim passes and shots with the stick: up/down picks the corner of the goal. Everything curls a little; placed shots bend
away from the keeper. At set pieces a line at the bottom says which buttons do what.

**Rules:** kick-offs, throw-ins, corners, goal kicks, goals, half time and full time, plus the referee (an owl):
- **Fouls**: tackling through the dribbler (when they're shielding the ball), sliding in from behind, taking the
  player instead of the ball, or catching someone just after they've passed it. Clean tackles (timed when the ball's
  been pushed out in front) are fine. A foul gives a **free kick**; in the fouling team's own box, a **penalty**.
- **Free kicks** near goal get a wall (2 or 3 players, 4 m away); everyone else stays 4 m back.
- **Penalties**: the camera goes behind the taker. Taking one, aim with the stick; facing one, you're in goal and pick
  where to dive before the kick (a guess, like a real keeper).
- **Cards**: yellow for reckless fouls (mostly slides from behind), red for a second yellow or a slide from behind
  that stops a clear run at goal. A sent-off player walks off and the team plays with six. Cards show under the
  team names. (Keepers only ever get yellows.)
- **Offside**: only clear ones (well past the second-last defender when the pass is played), so it's rare. It's an
  indirect free kick: a goal straight from it doesn't count.

**Sounds** (`soccer/src/game/sounds.ts`) are made on the fly: the ball's pock and thump (harder kicks deeper, with
a whoosh), the referee's pea whistle, a ringing post, the net, and a crowd that murmurs, swells near the goals,
"ooh"s, roars at goals (with a horn), groans, boos fouls, applauds saves, hushes for penalties and chants now and then.
Every animal has its own voice (quacks, oinks, woofs, meows, squeaks, roars, chitters, and the owl referee hooting
as the card comes out): happy calls when they score or make a big save, a cry when fouled, a sad one when they
let a goal in. Sounds are panned to where they happen on screen.

**Where you play**: each match is at one of the two teams' grounds (The Burrow, The Mud Bowl, Kennel Park,
Scratching Post Stadium, The Pond, The Tip, The Honey Pot, Cheddar Park), each with its own seat and roof colours,
size, name sign and pitch (stripes, checks, diagonals, rings; the Mud Bowl is churned up, the Tip is worn bare).
The home fans fill most of it as their own animal, and the visitors have the end on the right. It's an afternoon, a
sunset or a night game under the lights, in sun, cloud, rain, wind or snow, and the weather changes play a
little:
- **Rain**: the ball skids on, and passes run a bit long.
- **Snow**: the ball holds up, and passes come up short.
- **Wind**: the ball drifts in the air.
- There are rain, snow and leaves in the air, and the rain and wind can be heard.

**Chants**: now and then one end sings, bouncing in time: their team's name with claps ("Bun-nies!"
clap clap clap), or the whole end quacking, oinking, woofing or roaring together. After a goal the scorers' fans
start up.

**Replays**: after each goal's celebration, the build-up plays again in slow motion, from behind the goal or low
on the touchline, with the ball sounds. Any button skips it.

**The animals** blink, and their faces show how they feel: a grin when celebrating (the duck's beak drops
open), a frown and heavy eyes after letting one in, eyes screwed shut when hurt, gritted teeth in a hard kick or
tackle. Ears bounce with each step and sweep back at a sprint (the dog's flap, the bunny's stream behind),
twitch now and then, droop when sad; tails wag (the dog's madly when happy), sway (the cat's) or tuck in.

**Goal celebrations** come round from a shuffled pack (all seven before any repeats): the corner pile-on, a knee
slide, the airplane (the whole team flying behind in a line), a backflip with the others clapping, a team dance in
a row facing the fans, everyone belly-sliding, and a spin with the team running rings round the scorer. The team
that let it in stands around heads down.

Tweak it in `soccer/src/data/`: `tuning.ts` (pitch size, ball physics, running speeds, kick powers, camera, how good the
computer is at each difficulty), `teams.ts` (team names, fur and kit colours, shirt numbers).

## Tools

With `npm run dev` (Blocstrike) or `npm run dev:floor` (Floor Step) running:

```sh
npm run shot                  # plays a round in headless Chrome, saves tools/shots/*.png
node tools/mechanics.mjs      # stages a spear double hit and a piranha attack
node tools/showcase.mjs       # stages each weapon, punching, the bunny and the shop (incl. a purchase)
node tools/closeups.mjs       # close-up renders of the bunny and skin/hat combos
node tools/arenas.mjs         # starts a round in every arena and screenshots it
node tools/features.mjs       # 30 staged checks: lava jumps, bridges, gates, quicksand, boulders, clouds, every weapon, bunny hops
node tools/stuck.mjs 15 110   # hunts for rounds that never end, every arena and difficulty, and dumps where everyone is
node tools/simulate.mjs arenas 10            # computer-only rounds in every arena (random weapons)
node tools/simulate.mjs weapons 6 jungle     # every weapon against every weapon in one arena

node tools/floorstep.mjs all          # Floor Step: generates 300 floors, then plays one (search, key, exit), screenshots
node tools/floorstep.mjs showcase     # searches one of each kind of furniture and screenshots it
node tools/floorstep-auto.mjs 15 hard # a robot player finishes whole floors (proves every floor can be finished)
node tools/floorstep-menus.mjs        # new game → pause → save & quit → continue
node tools/floorstep-fight.mjs 1 wizard,knight,barbarian,thief block   # a careful robot fights every monster at each appearance
node tools/floorstep-fight.mjs 1 knight mash                           # ...and a button-masher (should get hurt)
node tools/floorstep.mjs fight        # screenshots of a fight
node tools/floorstep-controls.mjs     # opens Controls and rebinds a key
node tools/floorstep-duel.mjs knight Claught,Sieger hard  # films fight scenes against monsters (frame sheets)
node tools/floorstep-talk.mjs        # talks to every resident on a floor, prints what they say
node tools/floorstep-anim.mjs knight  # frame strips of walking, turning, combos, heavy blows and a fight (judge animation)
node tools/floorstep-probe.mjs "<js>" [ms]   # run code in the page (window.floorstep), optional screenshot

node tools/soccer.mjs 40 4            # Animal Soccer (dev:soccer running): title, kick-off, then the computer plays itself (40 s at 4× speed), screenshots
node tools/soccer-controls.mjs        # plays with the keyboard: kick-off pass, dribbling, held shots, a tackle
node tools/soccer-shots.mjs 24        # 24 shots per difficulty against the keeper: goals / saves / misses
node tools/soccer-shots.mjs 24 them   # the same, but the computer shoots (its way) at your keeper
node tools/soccer-flow.mjs 25 medium rain  # how a computer-vs-computer match flows (passes completed / intercepted, possession, tackles, shots); weather optional
node tools/soccer-curl.mjs            # how much curled passes, crosses and shots bend, and that they still land on target
node tools/soccer-sounds.mjs          # records every sound in turn to tools/shots/soccer/sounds.wav (+ sounds.txt: what's when)
node tools/soccer-setpieces.mjs       # stages a free kick, a penalty each way (you shoot / you dive), an offside and a sending-off; screenshots
node tools/soccer-touch.mjs           # ball control: distance from the feet while dribbling / turning, and a pass being received
node tools/soccer-poses.mjs           # freezes one player through a run and a kick, close up (tools/shots/soccer/pose-*.png)
node tools/soccer-celebrations.mjs [--close] [kind ...]  # forces a goal per celebration, frames of each (celeb-<kind>-*.png)
node tools/soccer-celeb-poses.mjs     # the celebration poses frozen side-on (tools/shots/soccer/celeb-poses.png)
node tools/soccer-faces.mjs           # every animal's face: calm, happy, sad, ouch, effort, running (faces.png)
node tools/soccer-grounds.mjs         # every ground at a different time and weather (grounds.png)
node tools/soccer-replay.mjs [goals]  # forces goals and takes frames of the replays (replay-*.png)
node tools/soccer-closeup.mjs         # zoomed-in burst of frames while the computer plays, plus the goal
node tools/soccer-sheet.mjs           # picture of all eight teams (tools/shots/soccer/teams.png)
```

In Animal Soccer's console, `soccer.start('duck', 'pig', 5, 'hard')` starts a match (a sunny afternoon at the duck's ground; add `, false, 'night', 'snow'` for other conditions), `soccer.auto()` lets the computer
play your side, `soccer.speed(8)` fast-forwards (`0` freezes it), `soccer.camera([x, y, z, lookX, lookY, lookZ])` pins the camera
(`null` to let go), and `soccer.match` is the live match, and `soccer.sfx` plays any sound (`soccer.sfx.goal(true)`, `soccer.sfx.whistle(3)`).

In the browser console, `blocstrike.match` is the live round, `blocstrike.settings.coins = 500` gives you coins
(then `blocstrike.save()`), `blocstrike.useArena('volcano')` switches arena, and `blocstrike.simulate('hard', 10, ['spear', 'grenade'], 'beach')` runs quick AI rounds.
