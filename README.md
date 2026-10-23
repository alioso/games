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

Blue vs Red, 3 blocs + 1 baby bunny per team, **best of 5 rounds**. One hit knocks a bloc out; the bunny takes 3 hearts. A team loses the round when its bunny goes poof. Stand on a fallen teammate for 3 s to revive them (each player can revive once per round). Don't fall in the pond: piranhas. Winning a match gives +10 bloccoins to spend in the **Shop** (bloc skins, hats, weapons — one shared wallet for both players).

Weapons (each team picks one for the whole match, in **Play**):

| | How it works |
|---|---|
| 🗡️ Spear | Throw, then walk over it to pick it up. Pierces up to 2 blocs. |
| 🚀 Bazooka | Rocket with a small blast that also pushes people (into the pond!). 10 s reload. |
| 💣 Big Grenade | **Hold** to throw further, release to throw. Bigger blast, 2 bunny hearts per hit, 5 per round. |
| 🔥 Flamethrower | **Hold** to spray. Short range, burns teammates too. 20 s of fuel per round. |
| 👊 Punch | When grenades or fuel run out, attack punches (hold to keep punching). Enemies only. 5 punches knock out a bloc; 2 punches take a bunny heart. Punches from teammates add up. |

| | Keyboard (P1) | Keyboard (P2) | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick / D-pad |
| Aim | facing direction | facing direction | Right stick |
| Attack | Space | Enter | A or RT |
| Dash (every 5 s) | Left Shift | Right Shift | B or LB/RB |
| Pause | Esc | Backspace | Start |

Keys and devices can be changed in **Controls** (saved in the browser).

### Where to change things

Everything a designer would want to tweak lives in `blocstrike/src/data/`:

- `tuning.ts`: speeds, dash, revive time, bunny hearts, rounds to win, coins per win, computer-player skill
- `weapons.ts`: weapon list and prices; spear, bazooka, grenade and flamethrower numbers
- `hats.ts`: hat shop list and prices (models in `entities/hats.ts`)
- `arenas.ts`: arena size, pond, trees and rocks (left half is mirrored to the right)
- `blocs.ts`: bloc shop skins and prices
- `teams.ts`: team colours
- `controls.ts`: default keys and gamepad buttons
- `sounds.ts`: sound effects (synthesised; no audio files)
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
node tools/simulate.mjs       # computer-only rounds for every weapon matchup: length, kills, winners
```

In the browser console, `blocstrike.match` is the live round, `blocstrike.settings.coins = 500` gives you coins
(then `blocstrike.save()`), and `blocstrike.simulate('hard', 10, ['spear', 'grenade'])` runs quick AI rounds.
