import '@fontsource/bungee';
import '@fontsource/fredoka';
import './ui/style.css';
import * as THREE from 'three';
import { GameLoop } from '@engine/loop';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { connectedGamepads } from '@engine/input';
import { Thumbnailer } from '@engine/thumbnails';
import { CHARACTERS, type Character, fullName } from './data/characters';
import { MAZES, generate, shiftAfterRuby } from './data/mazes';
import { Youser } from './entities/youser';
import { buildHero } from './entities/heroModel';
import { CONTROL_HELP, Controller, NO_INPUT } from './game/controls';
import { Level } from './game/level';
import { Heaven } from './game/heaven';
import { clock, finish, progress, resetProgress, save, unlocked } from './data/save';
import { setDarkOff } from './world/darkness';
import { MazeWorld } from './world/maze';
import { SFX } from './game/sounds';
import { InkEffect } from './world/inkEffect';
import { STYLES } from './world/themes';
import { Hud } from './ui/hud';
import { Menu, type MenuItem } from './ui/menu';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const ink = new InkEffect({ thickness: 0.8, grain: 0.035 });
const renderer = new Renderer(app, { bloom: 0.5, effects: () => ({ effects: [ink] }) });
renderer.camera.fov = 45;
renderer.camera.near = 0.1;
renderer.camera.far = 600;
renderer.camera.updateProjectionMatrix();
renderer.scene.background = new THREE.Color(0x0c0c14);

const hud = new Hud(ui);
const menu = new Menu(ui);
const controller = new Controller();
const padStatus = document.createElement('div');
padStatus.className = 'padstatus';
ui.appendChild(padStatus);

let level: Level | null = null;
let heaven: Heaven | null = null;
let paused = false;
let doneShown = false;
let character: Character = CHARACTERS.find((c) => c.id === progress.hero) ?? CHARACTERS[0];
let levelIndex = 0;

// ---------- characters ----------

let thumbs: Thumbnailer | null = null;
function characterPic(c: Character) {
  thumbs ??= new Thumbnailer(240);
  return thumbs.render(`maze:${c.id}`, () => {
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

function playLevel(i: number) {
  levelIndex = i;
  clearScene();
  level = new Level(MAZES[i], i + 1, character);
  renderer.scene.add(level.group);
  (renderer.scene.background as THREE.Color).set(STYLES[MAZES[i].theme].clear);
  doneShown = false;
  hud.show(true);
  hud.setPlaying(true);
  hud.setBigMap(false);
  menu.hide();
  paused = false;
  controller.reset();
}

/** Whatever's on (a maze, heaven, the title's backdrop) goes. */
function clearScene() {
  level?.dispose();
  level = null;
  heaven?.dispose();
  heaven = null;
  hideBackdrop();
  hud.setHint('');
  hud.setBubble(null);
  hud.setFight(null);
}

function levelDone() {
  const next = levelIndex + 1;
  const hearts = level?.hearts ?? 3, time = level?.elapsed ?? 0;
  const firstTime = !progress.done[levelIndex];
  const before = progress.best[levelIndex];
  const best = finish(levelIndex, time, hearts);
  const timeLine = `Time: <b>${clock(time)}</b>${best && before ? ' · <b class="new-best">NEW BEST!</b>' : before ? ` · best ${clock(before.time)}` : ''}`;
  const last = next >= MAZES.length;
  menu.show({
    title: `RUBY ${levelIndex + 1} OF 3!`,
    subtitle: `You found the ruby and got out of ${MAZES[levelIndex].name}${hearts === 3 ? ' without a scratch!' : ` with ${hearts} ${hearts === 1 ? 'heart' : 'hearts'} left.`}<br>${timeLine}${!last ? `<br>${firstTime ? `<b>${MAZES[next].name}</b> is open now!` : 'Your hearts fill up again for the next maze.'}` : ''}`,
    items: !last
      ? [
        { label: `On to ${MAZES[next].name}`, sub: MAZE_BLURB[next], action: () => playLevel(next) },
        { label: 'Play it again', sub: 'Try for a better time', action: () => playLevel(levelIndex) },
        { label: 'Main menu', action: titleMenu },
      ]
      : [
        { label: 'Up to heaven!', sub: 'All three rubies: someone\'s waiting for you...', action: playHeaven },
        { label: 'Play it again', sub: 'Try for a better time', action: () => playLevel(levelIndex) },
        { label: 'Main menu', action: titleMenu },
      ],
  });
}

// ---------- the ending ----------

function playHeaven() {
  clearScene();
  heaven = new Heaven(character);
  renderer.scene.add(heaven.group);
  (renderer.scene.background as THREE.Color).set(0xbfe0ff);
  hud.show(true);
  hud.setPlaying(false);
  menu.hide();
  paused = false;
  controller.reset();
  progress.heaven = true;
  heavenStay = false;
  heavenMenuShown = false;
  save();
}

function heavenMenu() {
  menu.show({
    title: 'THE END',
    light: true,
    subtitle: `${fullName(character)} found all three rubies<br>and had ramen in the clouds with everyone.<br><i>Thanks for playing A Maze In!</i>`,
    items: [
      { label: 'Stay a while', sub: 'Watch them eat', action: () => { menu.hide(); heavenStay = true; } },
      { label: 'Play again', sub: 'Pick a hero and a maze', action: pickCharacter },
      { label: 'Main menu', action: titleMenu },
    ],
  });
}
let heavenStay = false;
let heavenMenuShown = false;

// ---------- the title's backdrop: the hedge maze from high up, lights on, going slowly round ----------

let backdrop: { world: MazeWorld; t: number } | null = null;
function showBackdrop() {
  if (backdrop) return;
  // (A made-up one, not the real hedge maze: no peeking at the way to the ruby.)
  const world = new MazeWorld(generate({ ...MAZES[0], seed: 4242 }));
  renderer.scene.add(world.group);
  (renderer.scene.background as THREE.Color).set(STYLES[MAZES[0].theme].clear);
  setDarkOff(true);
  backdrop = { world, t: 0 };
}
function hideBackdrop() {
  if (!backdrop) return;
  backdrop.world.dispose();
  backdrop = null;
  setDarkOff(false);
}
function backdropCamera(dt: number) {
  if (!backdrop) return;
  const b = backdrop, w = b.world;
  b.t += dt;
  w.update(dt, w.start);
  const cx = w.width / 2, cz = w.depth / 2, a = 1.1 + b.t * 0.03, r = Math.max(w.width, w.depth) * 0.75;
  renderer.camera.position.set(cx + Math.cos(a) * r, 26, cz + Math.sin(a) * r);
  renderer.camera.lookAt(cx, 0, cz);
}

// ---------- menus ----------

function titleMenu() {
  if (level || heaven) clearScene();
  showBackdrop();
  hud.show(false);
  const rubies = progress.done.filter(Boolean).length;
  const items: MenuItem[] = [
    { label: 'Play', sub: rubies === 0 ? 'Pick your hero' : `${'♦'.repeat(rubies)} ${rubies} of 3 rubies`, action: pickCharacter },
  ];
  if (progress.heaven) items.push({ label: 'Up to heaven', sub: 'Watch the ending again', action: () => { heavenStay = false; playHeaven(); } });
  items.push({ label: 'Controls', action: () => controlsMenu(titleMenu) });
  if (rubies > 0 || progress.heaven) items.push({ label: 'Start over', sub: 'Forget every ruby', action: resetMenu });
  menu.show({ title: 'A MAZE IN', subtitle: 'Find the ruby · get back out · three mazes', items });
}

function resetMenu() {
  menu.show({
    title: 'Start over?',
    subtitle: 'Every ruby, best time and heaven will be forgotten.<br>Only the hedge maze will be open.',
    items: [
      { label: 'No, keep them', action: titleMenu },
      { label: 'Yes, start over', action: () => { resetProgress(); titleMenu(); } },
    ],
    back: titleMenu,
  });
}

function pickCharacter() {
  menu.show({
    title: 'Who goes in?',
    grid: true,
    items: CHARACTERS.map((c): MenuItem => ({
      label: fullName(c),
      html: `<img class="team-pic" src="${characterPic(c)}" alt="">`,
      action: () => { character = c; progress.hero = c.id; save(); pickMaze(); },
    })),
    focus: Math.max(0, CHARACTERS.indexOf(character)),
    back: titleMenu,
  });
}

/** What each maze is like (on the menus). */
const MAZE_BLURB = [
  'Hedges · thorns, wasps and mud',
  'Town walls · manholes, falling flowerpots and spilt honey',
  'Castle stones · spikes, dragon fire and creaky trapdoors',
];

/** Which maze: the first is open, each ruby opens the next (done ones show your best). */
function pickMaze() {
  if (!level && !heaven) showBackdrop();
  const next = progress.done.findIndex((d) => !d);
  menu.show({
    title: 'Which maze?',
    subtitle: `${fullName(character)} goes in`,
    items: MAZES.map((m, i): MenuItem => {
      const b = progress.best[i];
      if (!unlocked(i)) return { label: `🔒 ${m.name}`, sub: `Get the ruby from ${MAZES[i - 1].name} first`, disabled: true, action: () => {} };
      return {
        label: `${progress.done[i] ? '<span class="ruby-got">♦</span> ' : ''}${i + 1}. ${m.name}`,
        sub: b ? `Best ${clock(b.time)} · <span class="best-hearts">${'♥'.repeat(b.hearts)}</span>${'♡'.repeat(3 - b.hearts)}` : MAZE_BLURB[i],
        action: () => playLevel(i),
      };
    }),
    focus: next < 0 ? 0 : next,
    back: pickCharacter,
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
      { label: 'Restart this maze', action: () => playLevel(levelIndex) },
      { label: 'Controls', action: () => controlsMenu(pauseMenu) },
      { label: 'Quit to menu', action: () => { paused = false; titleMenu(); } },
    ],
    back: () => { menu.hide(); paused = false; controller.reset(); },
  });
}

// ---------- riddles ----------

/** A keeper asks their riddle: three answers (in any order); going back means you haven't answered yet. */
function riddleMenu(l: Level, k: NonNullable<ReturnType<Level['talkTarget']>>) {
  paused = true;
  const r = l.riddleFor(k);
  l.say(k, k.keeper.hello, 2);
  const answers = [{ text: r.right, right: true }, ...r.wrong.map((w) => ({ text: w, right: false }))].sort(() => Math.random() - 0.5);
  const done = (right: boolean) => { menu.hide(); paused = false; controller.reset(); l.answer(k, right); };
  menu.show({
    title: k.keeper.look.name,
    subtitle: `<div class="riddle-who">"${k.keeper.hello}"</div><div class="riddle">${r.q}</div>`,
    items: answers.map((a) => ({ label: a.text, action: () => done(a.right) })),
    back: () => { menu.hide(); paused = false; controller.reset(); },
  });
}

// ---------- hints ----------

const usingPad = () => connectedGamepads().length > 0;
const btn = (pad: string, key: string) => `<b>${usingPad() ? pad : key}</b>`;

function hintFor(l: Level) {
  if (l.phase === 'fight') {
    const magic = l.walker.powered ? ` · ${btn('X', 'X')} magic (hold for a blast)` : '';
    return `${btn('A', 'Space')} hit · ${btn('B', 'Shift')} block · ${btn('▲', '↑')} jump · ${btn('▼', '↓')} duck${magic}`;
  }
  if (l.phase !== 'explore') return '';
  if (hud.big) return `${btn('Y', 'M')} close the map`;
  const k = l.talkTarget();
  if (k) return `${btn('A', 'Space')} talk to ${k.keeper.look.name}`;
  const no = l.refusedNear();
  if (no) return `${no.keeper.look.name} won't let you through: find another way`;
  if (l.inMud) return l.slowKind === 'honey' ? 'Stuck in sticky honey! Keep going...' : 'Stuck in the mud! Keep going...';
  const creep = l.creepNear();
  if (creep) return `Hold ${btn('B', 'Shift')} to creep past ${creep === 'wasps' ? 'the wasps' : 'the creaky trapdoor'}`;
  if (l.canFight()) return `${btn('A', 'Space')} fight it!${l.walker.powered ? ' (your wand is ready)' : ' (with just a stick...)'}`;
  return `${btn('stick', 'arrows')} walk · hold ${btn('B', 'Shift')} to creep · ${btn('Y', 'M')} big map`;
}

// ---------- loop ----------

const loop = new GameLoop(
  (dt) => {
    const input = menu.open || paused ? NO_INPUT : controller.poll(dt);
    if (menu.open) controller.poll(dt);
    if (heaven) {
      if (!menu.open && heavenStay && (input.b.pause.pressed || input.b.action.pressed)) { heavenStay = false; heavenMenu(); return; }
      heaven.update(dt, heavenStay ? NO_INPUT : input);
      for (const e of heaven.events) hud.showBanner(e.text, e.sub, e.time, e.color);
      heaven.events.length = 0;
      if (heaven.menuReady && !menu.open && !heavenStay && !heavenMenuShown) { heavenMenuShown = true; heavenMenu(); }
      return;
    }
    if (!level) return;
    if (!menu.open && input.b.pause.pressed) { pauseMenu(); return; }
    if (paused) return;
    if (input.b.map.pressed) hud.setBigMap(!hud.big);
    if (input.b.action.pressed && !hud.big) {
      const k = level.talkTarget();
      if (k) { riddleMenu(level, k); return; }
    }
    level.update(dt, hud.big ? NO_INPUT : input);
    for (const e of level.events) hud.showBanner(e.text, e.sub, e.time, e.color);
    level.events.length = 0;
    if (level.phase === 'done' && !doneShown) {
      doneShown = true;
      setTimeout(levelDone, 3200);
    }
    if (level.phase === 'failed' && !doneShown) {
      doneShown = true;
      const which = levelIndex;
      setTimeout(() => { if (level?.phase === 'failed' && levelIndex === which) playLevel(which); }, 3200);
    }
  },
  (frameDt) => {
    menu.update(performance.now() / 1000);
    if (heaven) {
      heaven.render(frameDt, renderer.camera);
      hud.setHint(menu.open ? '' : heavenStay ? `${btn('A', 'Space')} menu` : heaven.menuReady ? '' : `${btn('A', 'Space')} skip`);
    } else if (backdrop) backdropCamera(frameDt);
    if (level) {
      level.render(paused ? 0 : frameDt, renderer.camera);
      const l = level, h = l.hero;
      hud.setHearts(l.hearts);
      hud.drawMap({
        layout: l.layout, seen: (x, y) => l.seenTile(x, y), hero: { x: h.x, z: h.z, yaw: l.walker.yaw }, hasRuby: l.hasRuby,
        traps: l.layout.traps, keepers: l.keepers.map((k) => ({ tile: k.tile, open: !k.blocking })),
      }, performance.now() / 1000);
      hud.setHurt(l.hurtFlash / 0.5);
      const f = l.fight;
      hud.setFight(f ? { name: l.walker.character.name.toUpperCase(), you: f.hero.hp, it: f.mon.hp, powered: l.walker.powered } : null);
      for (const p of l.pows) {
        const v = new THREE.Vector3(p.x, p.y, 0).project(renderer.camera);
        hud.pow(p.text, (v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, p.color);
      }
      l.pows.length = 0;
      if (l.bubble) {
        const p = l.bubble.at.getWorldPosition(new THREE.Vector3()).setY(1.55).project(renderer.camera);
        hud.setBubble(l.bubble.text, (p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
      } else hud.setBubble(null);
      hud.setHint(menu.open ? '' : hintFor(l));
    }
    hud.update(frameDt);
    renderer.render(frameDt);
  },
);

setInterval(() => {
  const pads = connectedGamepads();
  padStatus.textContent = pads.length ? `🎮 ${pads.length > 1 ? `${pads.length} controllers` : 'Controller'} connected` : '🎮 Press a button on your controller';
}, 1000);
window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !menu.open) toggleFullscreen(); if (e.code === 'Tab') e.preventDefault(); });

// ---------- debug / test hooks ----------

declare global {
  interface Window { maze: unknown }
}
window.maze = {
  get level() { return level; },
  camera: renderer.camera,
  sfx: SFX,
  /** Tools: where a maze's shift will close and open passages (tile indices). */
  shiftOf(i: number) { return shiftAfterRuby(generate(MAZES[i])); },
  /** Start a maze straight away (tools): maze index, character id. */
  /** The ending (tools): character id. */
  heaven(id = 'wizard-duck') {
    character = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    playHeaven();
  },
  get heavenScene() { return heaven; },
  progress,
  play(i = 0, id = 'wizard-duck') {
    character = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    playLevel(i);
  },
};

titleMenu();
loop.start();
