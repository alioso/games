import '@fontsource/bungee';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './ui/style.css';
import * as THREE from 'three';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { GameLoop } from '@engine/loop';
import { ArenaCamera } from '@engine/camera';
import { Particles } from '@engine/particles';
import { connectedGamepads, keyboard, PlayerController, type Controls } from '@engine/input';
import { synth } from '@engine/audio';
import { Arena } from './world/arena';
import { Match, type MatchEvents, type MatchSetup } from './match';
import { Hud } from './ui/hud';
import { Menus, keyName, type Screen } from './ui/menus';
import { deviceConfig, save, settings } from './settings';
import { ARENAS } from './data/arenas';
import { TEAMS, type TeamDef } from './data/teams';
import { TUNING, type Difficulty } from './data/tuning';
import { WEAPONS } from './data/weapons';
import { KEY_ACTIONS } from './data/controls';
import { TEXT } from './data/text';
import { SFX } from './data/sounds';

// ───────── setup ─────────

const renderer = new Renderer(document.getElementById('app')!, { renderScale: settings.renderScale });
const scene = renderer.scene;
scene.background = new THREE.Color(0x3d7a2c);

const particles = new Particles(1500);
const glow = new Particles(800, true);
scene.add(particles.mesh, glow.mesh);

const arena = new Arena(ARENAS[0], particles);
scene.add(arena.group);

const cam = new ArenaCamera(renderer.camera, arena.def.halfW + 1.8, arena.def.halfD + 1.4);
renderer.onResize = () => cam.fit();
applySafeMargin();
synth.setVolume(settings.volume);

const ui = document.getElementById('ui')!;
const hud = new Hud(ui);
const menus = new Menus(ui);

type Mode = 'menu' | 'playing' | 'paused' | 'results';
let mode: Mode = 'menu';
let match: Match | null = null;
let controllers: PlayerController[] = [];
let lastSetup: MatchSetup | null = null;
let time = 0;
let slowmo = 0;

function applySafeMargin() {
  document.documentElement.style.setProperty('--safe', `${settings.safeMargin}vh`);
  cam.margin = 1.06 / (1 - (2 * settings.safeMargin) / 100);
  cam.fit();
}

// ───────── matches ─────────

function newMatch(setup: MatchSetup) {
  match?.dispose();
  particles.clear();
  glow.clear();
  const events: MatchEvents = {
    banner: (t, s, c) => hud.banner(t, s, c),
    shake: (a) => cam.shake(a),
    slowmo: (s) => (slowmo = s),
    countdown: (n) => hud.countdown(n),
    over: (winner) => (setup.demo ? setTimeout(() => match?.setup === setup && startDemo(), 2500) : matchOver(winner)),
  };
  match = new Match(arena, setup, particles, glow, events);
  scene.add(match.group);
}

function startDemo() {
  newMatch({ humans: [], teamCount: 2, difficulty: 'normal', demo: true });
}

function startGame() {
  const humans = settings.players === 2 ? [0, settings.p2Team === 'same' ? 0 : 1] : [0];
  controllers = humans.map((_, i) => new PlayerController(deviceConfig(i as 0 | 1)));
  lastSetup = { humans, teamCount: 2, difficulty: settings.difficulty };
  newMatch(lastSetup);
  keyboard.consume(Object.values(settings.keys[0]).flat()); // forget the key that clicked "Start"
  menus.hide();
  hud.show(true, hint());
  mode = 'playing';
}

function hint() {
  const d = deviceConfig(0);
  if (d.kind === 'gamepad') return 'P1: Left stick move · Right stick aim · A throw · B dash · Start pause · F fullscreen';
  const k = d.keys;
  return `P1: ${[k.up, k.left, k.down, k.right].map((c) => keyName(c[0])).join('')} move · ${keyName(k.attack[0])} throw · ${keyName(k.dash[0])} dash · Esc pause · F fullscreen`;
}

function matchOver(winner: TeamDef | null) {
  const myTeam = lastSetup?.humans[0] ?? 0;
  const won = winner?.id === myTeam;
  if (won) {
    settings.coins += TUNING.coins.perWin;
    settings.wins += 1;
    save();
  }
  setTimeout(() => {
    if (mode !== 'playing') return;
    mode = 'results';
    (won ? SFX.win : SFX.lose)();
    const title = winner ? TEXT.wins(winner.name) : TEXT.draw;
    const color = winner ? '#' + winner.color.toString(16).padStart(6, '0') : '#888';
    menus.show({
      header: `<div class="result-title" style="--c:${color}">${title}</div>` +
        (won ? `<div class="earned">+${TUNING.coins.perWin} ${TEXT.coins}!</div>` : '') +
        `<div class="coins">🪙 ${settings.coins} ${TEXT.coins}</div>`,
      items: [
        { kind: 'button', label: TEXT.playAgain, primary: true, onClick: startGame },
        { kind: 'button', label: TEXT.menu, onClick: goMenu },
      ],
      onBack: goMenu,
    });
  }, 1800);
}

function pause() {
  mode = 'paused';
  menus.show({
    title: TEXT.paused,
    items: [
      { kind: 'button', label: TEXT.resume, primary: true, onClick: resume },
      { kind: 'button', label: TEXT.quit, onClick: goMenu },
    ],
    onBack: resume,
  });
}

function resume() {
  menus.hide();
  mode = 'playing';
  for (const c of controllers) c.poll(); // swallow the button that closed the menu
}

function goMenu() {
  hud.show(false);
  startDemo();
  mode = 'menu';
  menus.show(mainScreen());
}

// ───────── menu screens ─────────

function mainScreen(): Screen {
  return {
    header: `<div class="logo">${TEXT.title}</div><div class="coins">🪙 ${settings.coins} ${TEXT.coins}</div>`,
    items: [
      { kind: 'button', label: TEXT.play, primary: true, onClick: () => menus.show(playScreen()) },
      { kind: 'button', label: TEXT.controls, onClick: () => menus.show(controlsScreen()) },
      { kind: 'button', label: TEXT.settings, onClick: () => menus.show(settingsScreen()) },
      { kind: 'text', html: 'Throw your spear, go get it back, protect your robot!' },
    ],
  };
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

function playScreen(): Screen {
  return {
    title: TEXT.play,
    items: [
      { kind: 'option', label: 'Players', values: ['1 player', '2 players'], get: () => settings.players - 1, set: (i) => { settings.players = (i + 1) as 1 | 2; save(); } },
      {
        kind: 'option', label: 'Player 2 is', values: ['On my team', 'On the other team'],
        get: () => (settings.p2Team === 'same' ? 0 : 1), set: (i) => { settings.p2Team = i ? 'other' : 'same'; save(); },
        disabled: () => settings.players === 1,
      },
      { kind: 'option', label: 'Computer players', values: ['Easy', 'Normal', 'Hard'], get: () => DIFFS.indexOf(settings.difficulty), set: (i) => { settings.difficulty = DIFFS[i]; save(); } },
      { kind: 'option', label: 'Arena', values: [ARENAS[0].name], get: () => 0, set: () => {} },
      { kind: 'option', label: 'Weapon', values: [WEAPONS.spear.name], get: () => 0, set: () => {} },
      { kind: 'text', html: `<b>${TEAMS[0].name}</b> vs <b>${TEAMS[1].name}</b> · ${TUNING.teams.blocsPerTeam} blocs + 1 robot each.<br>Destroy the other team's robot (3 hits) to win!` },
      { kind: 'button', label: TEXT.start, primary: true, onClick: startGame },
      { kind: 'button', label: TEXT.back, onClick: () => menus.show(mainScreen()) },
    ],
    onBack: () => menus.show(mainScreen()),
  };
}

function controlsScreen(): Screen {
  const pads = connectedGamepads();
  const choices = ['keyboard', 'gamepad:0', 'gamepad:1', 'gamepad:2', 'gamepad:3'];
  const labels = choices.map((c, i) => (i === 0 ? 'Keyboard' : `Gamepad ${i}${pads.some((p) => p.index === i - 1) ? ' ✓' : ''}`));
  const items: Screen['items'] = [];
  for (const p of [0, 1] as const) {
    items.push({
      kind: 'option', label: `Player ${p + 1} uses`, values: labels,
      get: () => Math.max(0, choices.indexOf(settings.devices[p])),
      set: (i) => { settings.devices[p] = choices[i]; save(); },
    });
    for (const action of KEY_ACTIONS) {
      items.push({
        kind: 'rebind',
        label: `P${p + 1} ${action}`,
        value: () => keyName(settings.keys[p][action][0]),
        onCapture: (code) => { settings.keys[p][action] = [code]; save(); },
      });
    }
  }
  items.push({ kind: 'text', html: '<b>Gamepad:</b> left stick move · right stick aim · A/RT throw · B/LB dash · Start pause' });
  items.push({ kind: 'button', label: TEXT.back, onClick: () => menus.show(mainScreen()) });
  return { title: TEXT.controls, items, onBack: () => menus.show(mainScreen()), wide: true };
}

function settingsScreen(): Screen {
  const scales = [1, 0.75, 0.5];
  const margins = [0, 2.5, 5];
  const vols = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return {
    title: TEXT.settings,
    items: [
      { kind: 'option', label: 'Graphics quality', values: ['High', 'Medium', 'Low (big TV)'], get: () => Math.max(0, scales.indexOf(settings.renderScale)), set: (i) => { settings.renderScale = scales[i]; renderer.setRenderScale(scales[i]); save(); } },
      { kind: 'option', label: 'TV edge margin', values: ['None', 'Small', 'Large'], get: () => Math.max(0, margins.indexOf(settings.safeMargin)), set: (i) => { settings.safeMargin = margins[i]; applySafeMargin(); save(); } },
      { kind: 'option', label: 'Sound', values: vols.map((v) => (v ? `${v * 100}%` : 'Off')), get: () => Math.max(0, vols.indexOf(settings.volume)), set: (i) => { settings.volume = vols[i]; synth.setVolume(vols[i]); save(); } },
      { kind: 'button', label: 'Fullscreen (F)', onClick: toggleFullscreen },
      { kind: 'button', label: TEXT.back, onClick: () => menus.show(mainScreen()) },
    ],
    onBack: () => menus.show(mainScreen()),
  };
}

// ───────── loop ─────────

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !keyboard.capture && !e.repeat) toggleFullscreen();
});

const NONE: (Controls | null)[] = [];

const loop = new GameLoop(
  (dt) => {
    if (!match || mode === 'paused') return;
    const scale = slowmo > 0 ? 0.3 : 1;
    let controls = NONE;
    if (mode === 'playing') {
      controls = controllers.map((c) => c.poll());
      const escape = keyboard.consume(['Escape', 'KeyP']);
      if (controls.some((c) => c?.pausePressed) || escape) {
        if (match.phase !== 'over') pause();
        return;
      }
    }
    match.update(dt * scale, controls);
  },
  (frameDt) => {
    time += frameDt;
    slowmo = Math.max(0, slowmo - frameDt);
    const dt = mode === 'paused' ? 0 : frameDt * (slowmo > 0 ? 0.3 : 1);
    menus.update(time);
    const actors = match ? match.blocs.filter((b) => b.alive) : [];
    arena.update(dt, time, actors);
    particles.update(dt);
    glow.update(dt);
    if (match) {
      match.render(dt);
      if (mode !== 'menu') hud.setStatus(match.status());
    }
    cam.update(frameDt);
    renderer.render(frameDt);
  },
);

goMenu();
loop.start();

// Handy for poking at the game from the browser console.
function simulate(difficulty: Difficulty = 'normal', runs = 10) {
  // Plays computer-only matches at full speed (nothing drawn) to check pacing and balance.
  const quiet: MatchEvents = { banner() {}, shake() {}, slowmo() {}, countdown() {}, over() {} };
  const results = [];
  for (let i = 0; i < runs; i++) {
    const m = new Match(arena, { humans: [], teamCount: 2, difficulty, demo: true }, particles, glow, quiet);
    let kills = 0, revives = 0, eaten = 0;
    const before = () => m.blocs.map((b) => b.state);
    let prev = before();
    while (m.phase !== 'over' && m.time < 300) {
      m.update(1 / 60, []);
      const now = before();
      now.forEach((s, j) => {
        if (s === 'dead' && prev[j] === 'alive') kills++;
        if (s === 'alive' && prev[j] === 'dead') revives++;
        if (s === 'eaten' && prev[j] !== 'eaten') eaten++;
      });
      prev = now;
    }
    const left = m.teams.filter((t) => !m.eliminated.has(t.id));
    results.push({ time: Math.round(m.time), winner: left.length === 1 ? left[0].name : 'draw', kills, revives, eaten, ...m.stats });
    m.dispose();
  }
  arena.ponds.forEach((p) => p.clear());
  return results;
}

Object.assign(window, { blocstrike: { get match() { return match; }, settings, startGame, goMenu, simulate } });
