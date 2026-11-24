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
import { SFX } from './game/sounds';
import { InkEffect } from './world/inkEffect';
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
let paused = false;
let doneShown = false;
let character: Character = CHARACTERS[0];
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
  level?.dispose();
  level = new Level(MAZES[i], i + 1, character);
  renderer.scene.add(level.group);
  doneShown = false;
  hud.show(true);
  hud.setBigMap(false);
  menu.hide();
  paused = false;
  controller.reset();
}

function levelDone() {
  const next = levelIndex + 1;
  const hearts = level?.hearts ?? 3;
  menu.show({
    title: `RUBY ${levelIndex + 1} OF 3!`,
    subtitle: `You found the ruby and got out of ${MAZES[levelIndex].name}${hearts === 3 ? ' without a scratch!' : ` with ${hearts} ${hearts === 1 ? 'heart' : 'hearts'} left.`}<br>Your hearts fill up again for the next maze.`,
    items: next < MAZES.length
      ? [
        // (The city and castle mazes come in a later milestone; until then, play this one again.)
        { label: 'Play it again', sub: `${MAZES[next].name} is coming soon`, action: () => playLevel(levelIndex) },
        { label: 'Main menu', action: titleMenu },
      ]
      : [{ label: 'Main menu', action: titleMenu }],
  });
}

// ---------- menus ----------

function titleMenu() {
  level?.dispose();
  level = null;
  hud.show(false);
  menu.show({
    title: 'A MAZE IN',
    subtitle: 'Find the ruby · get back out · three mazes',
    items: [
      { label: 'Play', sub: 'Pick your hero', action: pickCharacter },
      { label: 'Controls', action: () => controlsMenu(titleMenu) },
    ],
  });
}

function pickCharacter() {
  menu.show({
    title: 'Who goes in?',
    grid: true,
    items: CHARACTERS.map((c): MenuItem => ({
      label: fullName(c),
      html: `<img class="team-pic" src="${characterPic(c)}" alt="">`,
      action: () => { character = c; playLevel(0); },
    })),
    back: titleMenu,
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
  if (l.inMud) return 'Stuck in the mud! Keep going...';
  if (l.canFight()) return `${btn('A', 'Space')} fight it!${l.walker.powered ? ' (your wand is ready)' : ' (with just a stick...)'}`;
  return `${btn('stick', 'arrows')} walk · hold ${btn('B', 'Shift')} to creep · ${btn('Y', 'M')} big map`;
}

// ---------- loop ----------

const loop = new GameLoop(
  (dt) => {
    const input = menu.open || paused ? NO_INPUT : controller.poll(dt);
    if (menu.open) controller.poll(dt);
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
  play(i = 0, id = 'wizard-duck') {
    character = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    playLevel(i);
  },
};

titleMenu();
loop.start();
