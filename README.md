# Games

Browser games built on a small shared 3D engine (Three.js + post-processing).

```
engine/      reusable engine: loop, renderer, camera, input, sound synth, particles, path-finding, save
blocstrike/  the first game
floorstep/   the second game
tools/       headless-browser scripts: screenshots, staged mechanics, AI match simulation
```

## Run it

```sh
npm install
npm run dev        # Blocstrike → http://localhost:5173  (also reachable from other devices on the network)
npm run dev:floor  # Floor Step → http://localhost:5174
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
```

In the browser console, `blocstrike.match` is the live round, `blocstrike.settings.coins = 500` gives you coins
(then `blocstrike.save()`), `blocstrike.useArena('volcano')` switches arena, and `blocstrike.simulate('hard', 10, ['spear', 'grenade'], 'beach')` runs quick AI rounds.
