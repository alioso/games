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

Blue vs Red, 3 blocs + 1 robot per team. One hit kills a bloc; the robot takes 3 hits. Destroy the other team's robot to win (+10 bloccoins). Stand on a fallen teammate for 3 s to revive them (each player can revive once). Don't fall in the pond: piranhas.

| | Keyboard (P1) | Keyboard (P2) | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick / D-pad |
| Aim | facing direction | facing direction | Right stick |
| Throw | Space | Enter | A or RT |
| Dash (every 5 s) | Left Shift | Right Shift | B or LB/RB |
| Pause | Esc | Backspace | Start |

Keys and devices can be changed in **Controls** (saved in the browser).

### Where to change things

Everything a designer would want to tweak lives in `blocstrike/src/data/`:

- `tuning.ts`: speeds, dash, revive time, robot health, coins per win, computer-player skill
- `weapons.ts`: weapon list and prices, spear speed/range/pierce
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
npm run shot                  # plays a match in headless Chrome, saves tools/shots/*.png
node tools/mechanics.mjs      # stages a double hit and a piranha attack, screenshots them
node tools/simulate.mjs       # 12 computer-only matches per difficulty: length, kills, revives, winners
```

In the browser console, `blocstrike.match` is the live match and `blocstrike.simulate('hard', 10)` runs quick AI matches.
