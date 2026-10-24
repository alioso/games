# Games

Browser games built on a small shared 3D engine (Three.js + post-processing).

```
engine/      reusable engine: loop, renderer, camera, input, sound synth, particles, path-finding, save
blocstrike/  the first game
tools/       headless-browser scripts: screenshots, staged mechanics, AI match simulation
```

## Run it

```sh
npm install
npm run dev        # → http://localhost:5173  (also reachable from other devices on the network)
```

Then press **F** for fullscreen.

## Blocstrike

Blue vs Red, 3 blocs + 1 baby bunny per team, **best of 5 rounds**. One hit knocks a bloc out; the bunny takes 3 hearts. A team loses the round when its bunny goes poof. Stand on a fallen teammate for 3 s to revive them; bunnies can revive too, in 2 s (everyone, bunnies included, can revive once per round). Don't fall in the pond: piranhas. Winning a match gives +10 bloccoins to spend in the **Shop** (bloc skins, hats, weapons — one shared wallet for both players).

**Arenas** (bought in the Shop, picked in **Play**): 🌳 Grassy Pond (piranha pond), 🌋 Volcano (island in lava, a sliding bridge that pulls apart), 🌴 Jungle (crocodile river, stone gates that rise and fall on the log bridges), 🏖️ Beach (sharks, a lagoon, a tide that comes in and out). Explosions break trees, crates and sandcastles (rocks and pillars take two); flames burn trees and crates down. Everything grows back next round.

**Jump** (the old dash button): legs bend for 1 s, then a hop. In the air, spears, bullets, swords and flames pass underneath and you can hop over narrow water or lava; explosions still hit. 2 s before the next jump.

Weapons (you pick yours in **Play**; computer players get random ones for the whole match):

| | How it works |
|---|---|
| 🗡️ Spear | Throw, then walk over it to pick it up. Pierces up to 2 blocs. |
| ⚔️ Sword | Always in your hand, no reload. Slashes everything just in front (teammates too). |
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

## Tools

With `npm run dev` running:

```sh
npm run shot                  # plays a round in headless Chrome, saves tools/shots/*.png
node tools/mechanics.mjs      # stages a spear double hit and a piranha attack
node tools/showcase.mjs       # stages each weapon, punching, the bunny and the shop (incl. a purchase)
node tools/closeups.mjs       # close-up renders of the bunny and skin/hat combos
node tools/arenas.mjs         # starts a round in every arena and screenshots it
node tools/features.mjs       # 16 staged checks: jumping lava, sliding bridge, gates, breaking props, sword, machine gun, bunny hops
node tools/simulate.mjs arenas 10            # computer-only rounds in every arena (random weapons)
node tools/simulate.mjs weapons 6 jungle     # every weapon against every weapon in one arena
```

In the browser console, `blocstrike.match` is the live round, `blocstrike.settings.coins = 500` gives you coins
(then `blocstrike.save()`), `blocstrike.useArena('volcano')` switches arena, and `blocstrike.simulate('hard', 10, ['spear', 'grenade'], 'beach')` runs quick AI rounds.
