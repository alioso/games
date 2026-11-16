import '@fontsource/bungee';
import '@fontsource/fredoka';
import './ui/style.css';
import * as THREE from 'three';
import { GameLoop } from '@engine/loop';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { connectedGamepads } from '@engine/input';
import { Thumbnailer } from '@engine/thumbnails';
import { BALL_COLORS, CHARACTERS, type Character, fullName } from './data/characters';
import { COUNTRYSIDE } from './data/holes';
import { PUTT } from './data/tuning';
import { Youser } from './entities/youser';
import { buildHero } from './entities/heroModel';
import { CONTROL_HELP, Controller, NO_INPUT } from './game/controls';
import { HolePlay, type PlayerSlot } from './game/hole';
import { initPhysics } from './game/physics';
import { predict } from './game/predict';
import { type Entry, Round, vsParText } from './game/round';
import { SFX } from './game/sounds';
import { scorecardHtml } from './ui/scorecard';
import { InkEffect } from './world/inkEffect';
import { Hud } from './ui/hud';
import { Menu, type MenuItem } from './ui/menu';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const ink = new InkEffect({ thickness: 0.8, grain: 0.035 });
const renderer = new Renderer(app, { bloom: 0.3, effects: () => ({ effects: [ink] }) });
renderer.camera.fov = 50;
renderer.camera.near = 0.1;
renderer.camera.far = 500;
renderer.camera.updateProjectionMatrix();

const hud = new Hud(ui);
const menu = new Menu(ui);
const controller = new Controller();
const padStatus = document.createElement('div');
padStatus.className = 'padstatus';
ui.appendChild(padStatus);

let hole: HolePlay | null = null;
let paused = false;
/** The end-of-hole screen is up. */
let doneShown = false;

// ---------- characters ----------

let thumbs: Thumbnailer | null = null;
function characterPic(c: Character) {
  thumbs ??= new Thumbnailer(240);
  return thumbs.render(`golfer:${c.id}`, () => {
    if (c.kind === 'youser') {
      const y = new Youser();
      for (let i = 0; i < 30; i++) y.animate(1 / 30, i / 30, 0, 'happy');
      y.root.scale.setScalar(2.2);
      return y.root;
    }
    const rig = buildHero(c.look, { noWeapon: true });
    for (let i = 0; i < 30; i++) rig.animate(1 / 30, 'idle', { speed: 0, stride: 0, turn: 0 }, 0);
    return rig.root;
  }, { yaw: -0.35, pitch: 0.1, zoom: 0.9 });
}

// ---------- playing ----------

let round: Round | null = null;

/** Start (or restart) the round's current hole. */
async function playHole() {
  const r = round!;
  await initPhysics();
  hole?.dispose();
  const slots: PlayerSlot[] = r.order().map((p) => ({ name: p.name, color: p.color, golfer: p.golfer, voice: p.character.voice, cpu: p.cpu }));
  hole = new HolePlay(r.holes[r.hole], r.first + r.hole, slots);
  doneShown = false;
  renderer.scene.add(hole.group);
  renderer.scene.fog ??= new THREE.Fog(0xd8eef8, 50, 170);
  hud.setHole(hole.shape);
  hud.show(true);
  hud.hideBanner();
  menu.hide();
  paused = false;
  controller.reset();
}

/** A hole's finished: write the scores down and show the card. */
function holeDone(h: HolePlay) {
  const r = round!;
  h.players.forEach((slot, i) => {
    const p = r.players.find((q) => q.golfer === slot.golfer)!;
    p.scores[r.hole] = h.strokes[i];
  });
  const played = r.hole;
  r.hole++;
  const last = r.finished;
  menu.show({
    title: last ? 'FINAL SCORES' : `AFTER HOLE ${r.first + played}`,
    subtitle: scorecardHtml(r, last ? -1 : r.hole),
    items: last
      ? [{ label: 'And the winner is...', action: resultsMenu }]
      : [
        { label: `Hole ${r.first + r.hole}`, sub: r.holes[r.hole].name, action: () => playHole() },
        { label: 'Main menu', action: titleMenu },
      ],
    wide: true,
  });
}

/** The end of the round: the podium. */
function resultsMenu() {
  const r = round!;
  const st = r.standings();
  const pic = (i: number) => {
    const p = st[i];
    if (!p) return '';
    const t = r.total(p);
    return `<div class="spot ${i === 0 ? 'first' : ''}"><img src="${characterPic(p.character)}" alt=""><b>${p.name}</b>${t.strokes} (${vsParText(t.vsPar)})<div class="block" style="height:${[70, 46, 30, 18][i]}px">${i + 1}</div></div>`;
  };
  SFX.cup('ace');
  menu.show({
    title: st.length > 1 ? `${st[0].name} WINS!` : 'ROUND OVER',
    subtitle: `<div class="podium">${pic(1)}${pic(0)}${pic(2)}${pic(3)}</div>`,
    items: [
      { label: 'Play again', sub: 'Same golfers, same holes', action: () => { round = new Round(r.entries, r.holes, r.first); playHole(); } },
      { label: 'Main menu', action: titleMenu },
    ],
  });
}

// ---------- menus ----------

function titleMenu() {
  hole?.dispose();
  hole = null;
  round = null;
  hud.show(false);
  menu.show({
    title: 'BB GOLF',
    subtitle: 'Countryside · mini golf for 1 to 4 players',
    items: [
      { label: 'Play', sub: 'Pick your golfers', action: howMany },
      { label: 'Controls', action: () => controlsMenu(titleMenu) },
    ],
  });
}

function howMany() {
  menu.show({
    title: 'How many players?',
    subtitle: 'You take turns: each plays the whole hole',
    items: [1, 2, 3, 4].map((n) => ({ label: n === 1 ? '1 player' : `${n} players`, action: () => pickCharacters(n, []) })),
    back: titleMenu,
  });
}

/** All eighteen, or nine of them. */
function howLong(picked: Entry[]) {
  const go = (from: number, to: number) => { round = new Round(picked, COUNTRYSIDE.slice(from, to), from + 1); playHole(); };
  menu.show({
    title: 'How many holes?',
    items: [
      { label: 'All 18 holes', sub: 'The whole countryside course', action: () => go(0, 18) },
      { label: 'Front 9', sub: 'Holes 1–9: gentle slopes, sand and a pond', action: () => go(0, 9) },
      { label: 'Back 9', sub: 'Holes 10–18: pipes, jumps, windmill, barn and more', action: () => go(9, 18) },
    ],
    back: () => pickCharacters(picked.length, picked.slice(0, -1)),
  });
}

/** Each player picks a golfer (someone already picked can't be picked again). */
function pickCharacters(n: number, picked: Entry[]) {
  const i = picked.length;
  if (i >= n) { howLong(picked); return; }
  const color = `#${BALL_COLORS[i].toString(16).padStart(6, '0')}`;
  const taken = (c: Character) => picked.some((e) => e.character === c);
  menu.show({
    title: n === 1 ? 'Who\'s playing?' : `Player ${i + 1}: pick a golfer`,
    subtitle: n > 1 ? `<span class="ball-chip" style="background:${color}"></span> this ball` : undefined,
    grid: true,
    items: CHARACTERS.map((c): MenuItem => ({
      label: fullName(c),
      html: `<img class="team-pic" src="${characterPic(c)}" alt="">`,
      disabled: taken(c),
      action: () => { if (!taken(c)) n === 1 ? pickCharacters(n, [{ character: c }]) : whoPlays(n, picked, c); },
    })),
    back: i === 0 ? howMany : () => pickCharacters(n, picked.slice(0, -1)),
  });
}

/** With more than one player: is this golfer played by a person or by the computer? */
function whoPlays(n: number, picked: Entry[], c: Character) {
  const next = (cpu?: Entry['cpu']) => pickCharacters(n, [...picked, { character: c, cpu }]);
  menu.show({
    title: `Who plays ${c.name}?`,
    subtitle: `<img class="team-pic small" src="${characterPic(c)}" alt="">`,
    items: [
      { label: 'A person', sub: 'Someone here takes the turns', action: () => next() },
      { label: 'Computer · easy', sub: 'Wobbly aim, sometimes too soft or too hard', action: () => next('easy') },
      { label: 'Computer · good', sub: 'Steady hands: hard to beat!', action: () => next('good') },
    ],
    back: () => pickCharacters(n, picked),
  });
}

function controlsMenu(back: () => void) {
  const rows = CONTROL_HELP.map((g) => `<tr><th colspan="3">${g.group}</th></tr>` + g.rows.map(([what, pad, key]) => `<tr><td>${what}</td><td class="key">${pad}</td><td class="key">${key}</td></tr>`).join('')).join('');
  menu.show({
    title: 'Controls',
    items: [{ label: 'Back', action: back }],
    footer: `<table class="controls-table"><tr class="head"><td></td><td>Controller</td><td>Keyboard</td></tr>${rows}</table>`,
    back,
  });
}

function pauseMenu() {
  paused = true;
  menu.show({
    title: 'Paused',
    items: [
      { label: 'Resume', action: () => { menu.hide(); paused = false; controller.reset(); } },
      { label: 'Restart the hole', action: () => { if (round) playHole(); } },
      { label: 'Scorecard', action: () => menu.show({ title: 'SCORECARD', subtitle: round ? scorecardHtml(round, round.hole) : '', items: [{ label: 'Back', action: pauseMenu }], back: pauseMenu, wide: true }) },
      { label: 'Controls', action: () => controlsMenu(pauseMenu) },
      { label: 'Quit to menu', action: () => { paused = false; titleMenu(); } },
    ],
    back: () => { menu.hide(); paused = false; controller.reset(); },
  });
}

// ---------- hints ----------

const usingPad = () => connectedGamepads().length > 0;
const btn = (pad: string, key: string) => `<b>${usingPad() ? pad : key}</b>`;

function hintFor(h: HolePlay) {
  switch (h.phase) {
    case 'flyover': return `${btn('A', 'Space')} skip`;
    case 'aim':
      if (h.overview) return `${btn('Y', 'V')} back to your ball`;
      return `${btn('◀ ▶', '← →')} aim · hold ${btn('A', 'Space')} for power, let go to putt · ${btn('Y', 'V')} look at the hole`;
    case 'charge': return 'Let go to putt!';
    default: return '';
  }
}

// ---------- the scene before anything is loaded: a title backdrop ----------

renderer.scene.background = new THREE.Color(0x9cd0f0);

// ---------- loop ----------

const loop = new GameLoop(
  (dt) => {
    const input = menu.open || paused ? NO_INPUT : controller.poll(dt);
    if (menu.open) controller.poll(dt);
    if (!hole) return;
    if (!menu.open && input.b.pause.pressed) { pauseMenu(); return; }
    if (paused) return;
    hole.update(dt, input);
    for (const e of hole.events) hud.showBanner(e.text, e.sub, e.time, e.color);
    hole.events.length = 0;
    if (hole.phase === 'done' && !doneShown) {
      doneShown = true;
      holeDone(hole);
    }
  },
  (frameDt) => {
    menu.update(performance.now() / 1000);
    if (hole) {
      hole.render(paused ? 0 : frameDt, renderer.camera);
      const h = hole, p = h.player;
      const rp = round?.players.find((q) => q.golfer === p.golfer);
      hud.setCard(h.number, h.def.name, h.def.par, p.name, h.strokes[h.turn] ?? 0, `#${p.color.toString(16).padStart(6, '0')}`, rp && round ? vsParText(round.total(rp).vsPar) : '');
      hud.setPower(h.phase === 'charge' ? h.power : h.phase === 'aim' && !h.overview ? 0 : null, h.lastPower);
      hud.drawMap(h.mapBalls(), h.aimPath);
      hud.drawFlag(h.def.cup);
      hud.setHint(menu.open ? '' : hintFor(h));
    }
    hud.update(frameDt);
    renderer.render(frameDt);
  },
);

setInterval(() => {
  const pads = connectedGamepads();
  padStatus.textContent = pads.length ? `🎮 ${pads.length > 1 ? `${pads.length} controllers` : 'Controller'} connected` : '🎮 Press a button on your controller';
}, 1000);
window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !menu.open) toggleFullscreen(); });

// ---------- debug / test hooks ----------

declare global {
  interface Window { golf: unknown }
}
window.golf = {
  get hole() { return hole; },
  sfx: SFX,
  /** Start a round straight away (tools): character ids, from hole index. */
  async play(index = 0, ...ids: string[]) {
    // (An id ending in ":easy" or ":good" is played by the computer.)
    const cs = (ids.length ? ids : ['wizard-duck']).map((spec): Entry => {
      const [id, cpu] = spec.split(':');
      return { character: CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0], cpu: cpu as Entry['cpu'] };
    });
    round = new Round(cs, COUNTRYSIDE);
    round.hole = index;
    for (const p of round.players) for (let k = 0; k < index; k++) p.scores[k] = round.holes[k].par;
    await playHole();
  },
  get round() { return round; },
  camera: renderer.camera,
  /** Tools: the computer takes your next putt (the best one it can find). */
  auto() {
    const h = hole;
    if (!h) return null;
    const b = h.bestShot();
    return h.autoShot(b.aim, b.power) ? b : null;
  },
  /**
   * Tools: putt from a spot with an aim (radians, 0 = down the hole) and power (0..1), run the
   * physics to the end at once, and compare with the aiming line's prediction.
   */
  test(x: number, z: number, aim: number, power: number) {
    const h = hole!;
    const dx = Math.sin(aim), dz = -Math.cos(aim);
    const speed = PUTT.minSpeed + (PUTT.maxSpeed - PUTT.minSpeed) * Math.pow(power, PUTT.curve);
    const pred = predict(h.shape, x, z, dx, dz, speed, 200);
    h.physics.place(x, z);
    h.physics.putt(dx, dz, speed);
    const hits: string[] = [];
    for (let i = 0; i < 60 * 40 && h.physics.moving; i++) for (const e of h.physics.step(1 / 60)) hits.push(e.kind);
    const p = h.physics.pos;
    return { pred: { end: pred.end, holed: pred.holed }, real: { end: [p.x, p.z], holed: h.physics.holed }, events: hits };
  },
};

titleMenu();
loop.start();
