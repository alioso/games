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

**Fighting.** Each floor has a monster, in this order: **Gribbles** (scrawny goblin-rat: claws, bites, lunges; then
pounces; then calls his rats), **Claught** (huge crab-bear: slow crushing slams and pincers; then throws crates; then
burrows under the floor and bursts up), **Zegron** (chameleon: long tongue and tail whip; then turns invisible, only a
shimmer gives him away; then spits acid that leaves burning puddles), **Sieger** (armoured beetle-knight: hits from the
front clang off, so get behind him or catch him off balance; then charges, and is dizzy if he hits a wall; then flies
up and dives), **Slashner** (scarecrow with blade hands: three-hit slashes and spins; then teleports behind you; then
throws boomerang blades). On Easy each shows up once and dies; on Medium twice, on Hard three times (fleeing upstairs at
each mark, coming back bandaged with new tricks). Every attack has a wind-up you can read, then a moment where the
monster is open. Light hits don't interrupt them and mashing gets you countered, so block, parry (block just before the
hit), dodge, then punish; heavy blows break a wind-up and knock teeth out. Beaten, a monster blurts out a hint about the
key (plain on Easy, vaguer on Medium, a riddle on Hard). Health only comes back from food, potions and petting the cat.
Fall, and you get 3 tries per floor (new layout, full health) before it's back to floor 1.

**Around the house:** a cat naps on beds and sofas (pet it, or startle it), spiders drop out of wardrobes, portraits'
eyes follow you, toilets flush, pianos plonk, clocks cuckoo, and the hero has something to say about most of it.

**The top floor:** Youser waits in a cage at the top of the last stairs. Open the door and... well, play it. Then the
end screen shows your run (time, things searched, monsters beaten, cats petted) and unlocks a costume colour.

Heroes: Guzzard (sword combo, 3 recharging magic blasts), MightyMac (long halberd thrusts, best block, shield bash),
Gronkers (huge club hits, poor block, ground slam that smashes furniture), Shifumi (crossbow bolts, then a fast knife;
smoke bomb; finds bolts while searching).

Gamepad: stick move · Ⓐ search · Ⓧ attack (press again to combo) · Ⓨ heavy · RB/LB block (hold) · Ⓑ dodge · RT/LT special
Keys: WASD · E search · J attack · K heavy · L block · Space dodge · Q special · Esc pause
Everything can be rebound in **Controls** (title screen and pause menu), which also shows which controllers the browser
has found and lights up their buttons as you press them. Browsers only notice a controller after a button is pressed
with the game window in front.

Tweak it in `floorstep/src/data/`: `tuning.ts` (floors per difficulty, house size, hero speed, camera), `furniture.ts`
(what can be searched, how, for how long), `rooms.ts` (room types, their floors, wallpaper and furniture), `lines.ts`
(everything the hero says, junk and snacks), `heroes.ts` (classes, animals, voices, weapons, colours, name ideas), `combat.ts` (every move's timing,
damage, reach, stamina; how patient monsters are per difficulty), `monsters.ts` (the five monsters: health, attacks per appearance, lines, key hints).

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
node tools/floorstep-monsters.mjs knight Claught,Sieger   # films monsters at full strength fighting the robot
node tools/floorstep-anim.mjs knight  # frame strips of walking, turning, combos, heavy blows and a fight (judge animation)
node tools/floorstep-probe.mjs "<js>" [ms]   # run code in the page (window.floorstep), optional screenshot
```

In the browser console, `blocstrike.match` is the live round, `blocstrike.settings.coins = 500` gives you coins
(then `blocstrike.save()`), `blocstrike.useArena('volcano')` switches arena, and `blocstrike.simulate('hard', 10, ['spear', 'grenade'], 'beach')` runs quick AI rounds.
