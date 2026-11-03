import '@fontsource/bangers';
import '@fontsource/patrick-hand';
import './ui/style.css';
import * as THREE from 'three';
import { GameLoop } from '@engine/loop';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { MenuInput, keyboard } from '@engine/input';
import { loadJSON, saveJSON } from '@engine/save';
import { synth } from '@engine/audio';
import { Thumbnailer } from '@engine/thumbnails';
import { DIFFICULTY, type Difficulty } from './data/tuning';
import { COMBAT } from './data/combat';
import { CLASSES, defaultLook, type HeroClass, type HeroLook } from './data/heroes';
import { buildHero } from './entities/heroModel';
import { type Injury, MONSTER_MODELS } from './entities/monsterModel';
import type { MonsterName } from './data/monsters';
import { Floor } from './game/floor';
import { Controller, NO_CONTROLS, loadBindings, padBlocker } from './game/controls';
import { ControlsScreen } from './ui/controlsScreen';
import { type RunState, newRun } from './game/run';
import { initSounds } from './game/sounds';
import { Autopilot } from './game/autoplay';
import { Bubbles } from './ui/bubbles';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Creator } from './ui/creator';
import { generateFloor, lastFail } from './world/plan';
import { InkEffect } from './world/inkEffect';

const SAVE_KEY = 'floorstep.save';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const ink = new InkEffect();
const renderer = new Renderer(app, { bloom: 0.7, effects: () => ({ effects: [ink] }) });
renderer.scene.background = new THREE.Color(0x0b0a10);
renderer.camera.far = 120;
renderer.gl.localClippingEnabled = true;
initSounds();

const bubbles = new Bubbles(ui, renderer.camera);
const hud = new Hud(ui);
const menu = new Menu(ui);
const bindings = loadBindings();
const controller = new Controller(bindings);
// Menus follow the controller bindings: "search" confirms, "dodge" goes back.
const menuPad = { confirm: bindings.pad.interact ?? [0], back: bindings.pad.dodge ?? [1] };
menu.input.pad = menuPad;
const controlsInput = new MenuInput();
controlsInput.pad = menuPad;
const controls = new ControlsScreen(ui, bindings, controlsInput, () => {
  menuPad.confirm = bindings.pad.interact ?? [0];
  menuPad.back = bindings.pad.dodge ?? [1];
});

// Say when a controller turns up (browsers only notice one after a button is pressed).
const padStatus = document.createElement('div');
padStatus.className = 'padstatus';
ui.appendChild(padStatus);
window.addEventListener('gamepadconnected', (e) => {
  hud.toast(`🎮 <b>${e.gamepad.id.replace(/\(.*?Vendor.*?\)/i, '').trim()}</b> connected${e.gamepad.mapping === 'standard' ? '' : ' — unusual layout: set its buttons in Controls'}`, 4);
});
window.addEventListener('gamepaddisconnected', () => hud.toast('🎮 Controller disconnected', 3));
function updatePadStatus() {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => !!p);
  const show = menu.open || creator.open;
  padStatus.style.display = show && !controls.open ? 'block' : 'none';
  const blocked = padBlocker();
  padStatus.innerHTML = blocked ? `🎮 ⚠ ${blocked}` : pads.length ? `🎮 ${pads[0]!.id.replace(/\(.*?Vendor.*?\)/i, '').trim()}` : '🎮 No controller yet: press any button on it';
}

const creator = new Creator(ui, (look) => portrait(look, 360)).listen();
creator.input.pad = menu.input.pad;
const PROGRESS_KEY = 'floorstep.progress';

/** What's been won (unlocks costumes) and the last hero made (the creator starts from it). */
interface Progress { won: Difficulty[]; lastLook: HeroLook | null }
function loadProgress(): Progress {
  return loadJSON<Progress>(PROGRESS_KEY, { won: [], lastLook: null });
}
function saveProgress(p: Progress) {
  saveJSON(PROGRESS_KEY, p);
}

let floor: Floor | null = null;
let run: RunState | null = null;
let playing = false;
let transitioning = false;
/** Test hooks: a robot player, and running the simulation faster than real time. */
let autopilot: Autopilot | null = null;
let autoOn = false;
let simSpeed = 1;
let autoStyle: 'block' | 'dodge' | 'mash' = 'block';

function loadRun(): RunState | null {
  const r = loadJSON<{ run: RunState | null }>(SAVE_KEY, { run: null }).run;
  if (!r || !r.look || !DIFFICULTY[r.difficulty]) return null;
  // Saves from before fighting existed.
  return { ...newRun(r.difficulty, r.look, r.seedBase), ...r };
}

function saveRun() {
  saveJSON(SAVE_KEY, { run });
}

function clearRun() {
  saveJSON(SAVE_KEY, { run: null });
}

/** A lit-up floor behind the title screen, the hero idling at the bottom of it. */
function backdrop() {
  floor?.dispose();
  playing = false;
  hud.show(false);
  floor = new Floor({
    scene: renderer.scene, camera: renderer.camera, bubbles, hud,
    look: defaultLook('wizard'), floor: 1, total: 5, seed: Math.floor(Math.random() * 1e6), run: newRun('easy', defaultLook('wizard'), 0),
    onExit: () => {}, onDefeat: () => {}, calm: true,
  });
  floor.debugRevealAll();
  floor.debugTeleport(floor.plan.start.x, floor.plan.start.z);
  floor.phase = 'done';
}

function startFloor() {
  if (!run) return;
  floor?.dispose();
  const r = run;
  const total = DIFFICULTY[r.difficulty].floors;
  floor = new Floor({
    scene: renderer.scene, camera: renderer.camera, bubbles, hud,
    look: r.look, floor: r.floor, total, seed: r.seedBase + r.floor * 1013, run: r,
    onExit: () => nextFloor(),
    onDefeat: () => defeated(),
  });
  saveRun();
  hud.show(true);
  hud.setName(r.look.name);
  hud.banner(`FLOOR ${r.floor}`, r.floor === total ? 'The top floor! Youser is near...' : `${total - r.floor} more to go`);
  keyboard.consume(['KeyE', 'Space', 'Enter', 'KeyJ', 'KeyK', 'KeyQ']);
  playing = true;
}

async function nextFloor() {
  if (!run || transitioning) return;
  transitioning = true;
  await hud.fade(1, 0.7);
  const total = DIFFICULTY[run.difficulty].floors;
  if (run.floor >= total) {
    const won = run.difficulty, stats = run.stats, heroName = run.look.name;
    clearRun();
    run = null;
    playing = false;
    hud.show(false);
    backdrop();
    await hud.fade(0, 0.5);
    transitioning = false;
    winScreen(won, stats, heroName);
    return;
  }
  run.floor++;
  startFloor();
  await hud.fade(0, 0.7);
  transitioning = false;
}

/** The hero fell: try the floor again (a new layout, full health), or it's game over. */
async function defeated() {
  if (!run || transitioning) return;
  transitioning = true;
  run.continues--;
  run.stats.falls++;
  if (run.continues > 0) {
    hud.banner('DEFEATED!', `${run.continues} ${run.continues === 1 ? 'try' : 'tries'} left on this floor`, 2.6);
    await new Promise((r) => setTimeout(r, 2000));
    await hud.fade(1, 0.6);
    run.hp = COMBAT[run.look.cls].maxHp;
    run.seedBase += 7919;
    startFloor();
    await hud.fade(0, 0.6);
    transitioning = false;
    return;
  }
  hud.banner('GAME OVER', 'Youser is still waiting...', 3);
  await new Promise((r) => setTimeout(r, 2600));
  await hud.fade(1, 0.6);
  clearRun();
  run = null;
  backdrop();
  await hud.fade(0, 0.5);
  transitioning = false;
  menu.show({
    title: 'GAME OVER',
    subtitle: 'Back to the bottom of the house. Try again?',
    items: [{ label: 'Back to title', action: () => titleScreen() }],
  });
}

// ---------- menus ----------

let thumbs: Thumbnailer | null = null;
function portrait(look: HeroLook, size = 200) {
  thumbs ??= new Thumbnailer(size);
  const key = [look.cls, look.animal, look.sex, look.costume, look.accent, look.weapon].join(':');
  return thumbs.render(key, () => buildHero(look).root, { yaw: -0.45, pitch: 0.2, zoom: 0.85 });
}

function titleScreen() {
  const saved = loadRun();
  const items = [];
  if (saved) {
    items.push({
      label: 'Continue',
      sub: `${saved.look.name} · Floor ${saved.floor}/${DIFFICULTY[saved.difficulty].floors} · ${DIFFICULTY[saved.difficulty].label}`,
      action: () => { run = saved; menu.hide(); fadeInto(startFloor); },
    });
  }
  items.push({ label: 'New game', action: () => difficultyScreen() });
  items.push({ label: 'Controls', action: () => { menu.hide(); controls.show(titleScreen); } });
  items.push({ label: 'Full screen', action: () => toggleFullscreen() });
  menu.show({
    title: 'FLOOR STEP',
    subtitle: 'Find the key on every floor. Climb the house. Save Youser!',
    items,
    footer: 'Gamepad: stick move · Ⓐ search · Ⓧ attack · Ⓨ heavy · RB block · Ⓑ dodge · RT special<br>Keys: WASD · E search · J attack · K heavy · L block · Space dodge · Q special · Esc pause · all changeable in Controls',
  });
}

function difficultyScreen() {
  menu.show({
    title: 'How brave are you?',
    items: (Object.keys(DIFFICULTY) as Difficulty[]).map((d) => ({
      label: DIFFICULTY[d].label,
      sub: `${DIFFICULTY[d].floors} floors`,
      action: () => creatorScreen(d),
    })),
    back: () => titleScreen(),
  });
}

function creatorScreen(d: Difficulty) {
  menu.hide();
  const prog = loadProgress();
  creator.show(
    { ...defaultLook('wizard'), ...(prog.lastLook ?? {}) },
    prog.won,
    (look) => {
      saveProgress({ ...loadProgress(), lastLook: look });
      run = newRun(d, look, Math.floor(Math.random() * 1e9));
      fadeInto(startFloor);
    },
    () => difficultyScreen(),
  );
}

function pauseScreen() {
  playing = false;
  menu.show({
    title: 'Paused',
    items: [
      { label: 'Resume', action: () => { menu.hide(); playing = true; } },
      { label: 'Controls', action: () => { menu.hide(); controls.show(pauseScreen); } },
      { label: 'Full screen', action: () => toggleFullscreen() },
      { label: 'Save & quit', sub: 'Continue later from this floor', action: () => { menu.hide(); backdrop(); titleScreen(); } },
    ],
    back: () => { menu.hide(); playing = true; },
  });
}

function winScreen(d: Difficulty, stats: RunState['stats'], name: string) {
  const prog = loadProgress();
  const fresh = !prog.won.includes(d);
  if (fresh) saveProgress({ ...prog, won: [...prog.won, d] });
  const prize = { easy: 'gold', medium: 'midnight black', hard: 'ghost white' }[d];
  menu.show({
    title: 'THE END',
    subtitle: `${name} and Youser are together again!<br>
      <span class="endstats">${DIFFICULTY[d].floors} floors climbed · ${Math.floor(stats.seconds / 60)} min ${Math.round(stats.seconds % 60)} s ·
      ${stats.searched} things searched · ${stats.beaten} monsters beaten${stats.fled ? ` (${stats.fled} ran away first)` : ''} ·
      ${stats.falls} ${stats.falls === 1 ? 'fall' : 'falls'} · ${stats.petted} ${stats.petted === 1 ? 'cat' : 'cats'} petted</span>
      ${fresh ? `<br>New costume colour unlocked: <b>${prize}</b>!` : ''}`,
    items: [{ label: 'Back to title', action: () => titleScreen() }],
  });
}

async function fadeInto(fn: () => void) {
  transitioning = true;
  await hud.fade(1, 0.4);
  fn();
  await hud.fade(0, 0.6);
  transitioning = false;
}

// ---------- loop ----------

const loop = new GameLoop(
  (dt) => {
    if (menu.open) menu.update(performance.now() / 1000);
    if (creator.open) creator.update(performance.now() / 1000);
    if (controls.open) controls.update(performance.now() / 1000);
    updatePadStatus();
    if (!floor) return;
    for (let i = 0; i < simSpeed; i++) {
      if (playing && !transitioning) {
        if (autoOn && (!autopilot || autopilot.floor !== floor)) {
          autopilot = new Autopilot(floor);
          autopilot.style = autoStyle;
        }
        const c = autoOn ? autopilot!.poll(dt) : controller.poll();
        if (c.pause) { pauseScreen(); return; }
        floor.update(dt, c);
      } else {
        floor.update(dt, NO_CONTROLS);
      }
    }
  },
  (dt) => {
    floor?.render(dt);
    bubbles.update(dt);
    renderer.render(dt);
  },
);


// For tests and tinkering in the console.
declare global {
  interface Window { floorstep: unknown }
}
window.floorstep = {
  get floor() { return floor; },
  get run() { return run; },
  synth,
  generateFloor,
  get lastFail() { return lastFail; },
  /** Start a game straight away, skipping menus. */
  start(difficulty: Difficulty = 'medium', cls: HeroClass = 'wizard', seed = 12345) {
    menu.hide();
    run = newRun(difficulty, defaultLook(cls), seed);
    startFloor();
  },
  setLook(look: Partial<HeroLook>) {
    if (!run) return;
    run.look = { ...run.look, ...look };
    startFloor();
  },
  next: () => nextFloor(),
  controller,
  bindings,
  /** Where a world point lands on screen, in CSS pixels. */
  screenOf(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(renderer.camera);
    return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
  },
  ink,
  autoplay(on = true, speed = 1, style: 'block' | 'dodge' | 'mash' = 'block') {
    autoOn = on;
    simSpeed = speed;
    autopilot = null;
    autoStyle = style;
  },
  get autopilot() { return autopilot; },
  /** The five monsters (fresh, and beaten-up) as portraits. */
  monsterSheet() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:#efe6cc;display:grid;grid-template-columns:repeat(5,1fr);z-index:99';
    const t = new Thumbnailer(400);
    for (const hurt of [[], ['ear', 'bandage', 'eye', 'tooth']] as Injury[][])
      for (const name of Object.keys(MONSTER_MODELS) as MonsterName[]) {
        const img = document.createElement('img');
        img.src = t.render(name + hurt.join(), () => MONSTER_MODELS[name](hurt).root, { yaw: -0.5, pitch: 0.2, zoom: 0.9 });
        img.style.width = '100%';
        div.appendChild(img);
      }
    document.body.appendChild(div);
  },
  /** Every class × animal × sex as portraits, laid over the screen (for checking the models). */
  sheet() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:#efe6cc;display:grid;grid-template-columns:repeat(8,1fr);z-index:99';
    thumbs = new Thumbnailer(400);
    for (const cls of Object.keys(CLASSES) as HeroClass[])
      for (const animal of CLASSES[cls].animals)
        for (const sex of ['m', 'f'] as const) {
          const img = document.createElement('img');
          img.src = portrait({ ...defaultLook(cls), animal, sex });
          img.style.width = '100%';
          div.appendChild(img);
        }
    document.body.appendChild(div);
  },
};

backdrop();
titleScreen();
loop.start();
