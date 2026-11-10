import '@fontsource/bungee';
import '@fontsource/fredoka';
import './ui/style.css';
import * as THREE from 'three';
import { GameLoop } from '@engine/loop';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { connectedGamepads } from '@engine/input';
import { Thumbnailer } from '@engine/thumbnails';
import { AI_LEVELS, CAMERA, type Difficulty, HALF_LENGTHS, PITCH } from './data/tuning';
import { TEAMS, type Team } from './data/teams';
import { PlayerRig } from './entities/playerModel';
import { Match, type MatchEvent, type MatchOptions } from './game/match';
import { CONTROL_HELP, Controller, NO_INPUT } from './game/controls';
import { SFX, initSounds } from './game/sounds';
import { Stadium } from './world/stadium';
import { InkEffect } from './world/inkEffect';
import { Hud } from './ui/hud';
import { Menu, type MenuItem } from './ui/menu';

const L = PITCH.length / 2, W = PITCH.width / 2;

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const ink = new InkEffect({ thickness: 0.8, grain: 0.035 });
const renderer = new Renderer(app, { bloom: 0.35, effects: () => ({ effects: [ink] }) });
renderer.camera.fov = CAMERA.fov;
renderer.camera.near = 1;
renderer.camera.far = 500;
renderer.camera.updateProjectionMatrix();
initSounds();

const stadium = new Stadium();
renderer.scene.add(stadium.group);
const hud = new Hud(ui);
const menu = new Menu(ui);
const controller = new Controller();
const fade = document.createElement('div');
fade.className = 'fade';
ui.appendChild(fade);
const padStatus = document.createElement('div');
padStatus.className = 'padstatus';
ui.appendChild(padStatus);

let match: Match | null = null;
/** Not a real game: the computer playing itself behind the title menu. */
let attract = true;
let paused = false;
let simSpeed = 1;
let fullTimeAt = 0;
let lastSetup: MatchOptions | null = null;

// ---------- team pictures ----------

let thumbs: Thumbnailer | null = null;
function teamPic(team: Team) {
  thumbs ??= new Thumbnailer(280);
  return thumbs.render(`team:${team.id}`, () => {
    const rig = new PlayerRig(team, team.home, 10);
    rig.animate({ pose: 'idle', t: 0, speed: 0, phase: 0 }, 1);
    return rig.root;
  }, { yaw: -0.4, pitch: 0.12, zoom: 0.8 });
}

// ---------- matches ----------

function startMatch(opts: MatchOptions, demo = false) {
  match?.dispose();
  match = new Match(opts);
  match.autopilot = demo;
  attract = demo;
  renderer.scene.add(match.group);
  paused = false;
  fullTimeAt = 0;
  hud.show(!demo);
  hud.hideBanner();
  controller.reset();
  if (!demo) lastSetup = opts;
  camX = 0;
}

function demoMatch() {
  const pick = [...TEAMS].sort(() => Math.random() - 0.5);
  startMatch({ home: pick[0], away: pick[1], half: 60, difficulty: 'medium' }, true);
}

// ---------- menus ----------

function titleMenu() {
  if (!attract) demoMatch();
  hud.show(false);
  menu.show({
    title: 'ANIMAL SOCCER',
    subtitle: 'Seven against seven',
    items: [
      { label: 'Friendly match', sub: 'Against a random team', action: () => pickTeam('Pick your team', (you) => pickLength(you)) },
      { label: 'Training', sub: 'Your team, nobody else', action: () => pickTeam('Pick your team', (you) => { menu.hide(); startMatch({ home: you, away: TEAMS.find((t) => t !== you)!, half: 60, difficulty: 'easy', training: true }); }) },
      { label: 'Cup', sub: 'Coming soon', disabled: true, action: () => {} },
      { label: 'Penalty shootout', sub: 'Coming soon', disabled: true, action: () => {} },
      { label: 'Controls', action: () => controlsMenu(titleMenu) },
    ],
  });
}

function pickTeam(title: string, then: (t: Team) => void, not?: Team) {
  const teams = TEAMS.filter((t) => t !== not);
  menu.show({
    title,
    grid: true,
    items: teams.map((t): MenuItem => ({ label: t.name, html: `<img class="team-pic" src="${teamPic(t)}" alt="">`, action: () => then(t) })),
    back: titleMenu,
  });
}

function pickLength(you: Team) {
  menu.show({
    title: 'How long?',
    subtitle: you.name,
    items: HALF_LENGTHS.map((m) => ({ label: `2 × ${m} minutes`, action: () => pickLevel(you, m) })),
    focus: 0,
    back: titleMenu,
  });
}

function pickLevel(you: Team, half: number) {
  menu.show({
    title: 'How hard?',
    subtitle: `${you.name} · 2 × ${half} minutes`,
    items: (Object.keys(AI_LEVELS) as Difficulty[]).map((d) => ({
      label: AI_LEVELS[d].label,
      action: () => drawOpponent(you, half, d),
    })),
    focus: 1,
    back: () => pickLength(you),
  });
}

/** The opponent is drawn at random: the pictures spin through the teams, then land on one. */
let drawTimer = 0;
function drawOpponent(you: Team, half: number, difficulty: Difficulty) {
  const others = TEAMS.filter((t) => t !== you);
  const them = others[Math.floor(Math.random() * others.length)];
  const card = (t: Team) => `<img class="team-pic big" src="${teamPic(t)}" alt=""><div class="draw-name">${t.name}</div>`;
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    clearInterval(drawTimer);
    const box = document.querySelector('.draw-card');
    if (box) { box.innerHTML = card(them); box.classList.add('landed'); }
    SFX.uiConfirm();
  };
  menu.show({
    title: 'Your opponent...',
    subtitle: `<div class="draw-card">${card(others[0])}</div>`,
    items: [{ label: 'Kick off!', action: () => {
      if (!done) { land(); return; }
      menu.hide();
      startMatch({ home: you, away: them, half, difficulty });
    } }],
    focus: 0,
    back: () => { clearInterval(drawTimer); pickLevel(you, half); },
  });
  // Spin through the teams, slowing down, then land.
  let i = 0, wait = 70, next = performance.now() + wait;
  clearInterval(drawTimer);
  drawTimer = window.setInterval(() => {
    if (performance.now() < next) return;
    if (wait > 380) { land(); return; }
    i++;
    const box = document.querySelector('.draw-card');
    if (box) box.innerHTML = card(others[i % others.length]);
    SFX.ui();
    wait *= 1.18;
    next = performance.now() + wait;
  }, 20);
}

function controlsMenu(back: () => void) {
  const rows = CONTROL_HELP.map((g) => `<tr><th colspan="3">${g.group}</th></tr>` + g.rows.map(([what, pad, key]) => `<tr><td>${what}</td><td class="key">${pad}</td><td class="key">${key}</td></tr>`).join('')).join('');
  menu.show({
    title: 'Controls',
    items: [{ label: 'Back', action: back }],
    footer: `<table class="controls-table"><tr class="head"><td></td><td>Controller</td><td>Keyboard</td></tr>${rows}</table>
      <p>The player with the yellow ring is you. You switch automatically to whoever is nearest the ball.</p>`,
    back,
  });
}

function pauseMenu() {
  paused = true;
  menu.show({
    title: 'Paused',
    items: [
      { label: 'Resume', action: resume },
      { label: 'Controls', action: () => controlsMenu(pauseMenu) },
      { label: 'Quit to menu', action: () => { paused = false; titleMenu(); } },
    ],
    back: resume,
  });
}

function resume() {
  menu.hide();
  paused = false;
  controller.reset();
}

function fullTimeMenu() {
  const m = match!;
  hud.hideBanner();
  const [a, b] = m.sides;
  const result = a.score > b.score ? 'You win!' : a.score < b.score ? 'You lose...' : 'A draw!';
  menu.show({
    title: 'FULL TIME',
    subtitle: `${a.team.name} ${a.score} - ${b.score} ${b.team.name}<br><b>${result}</b>`,
    items: [
      { label: 'Rematch', action: () => { menu.hide(); if (lastSetup) startMatch(lastSetup); } },
      { label: 'New opponent', action: () => { if (lastSetup) drawOpponent(lastSetup.home, lastSetup.half, lastSetup.difficulty); } },
      { label: 'Main menu', action: titleMenu },
    ],
  });
}

// ---------- hints for set pieces ----------

const usingPad = () => connectedGamepads().length > 0;
const btn = (pad: string, key: string) => `<b>${usingPad() ? pad : key}</b>`;

/** A line telling you which buttons do what, when it's your turn at a set piece. */
function hintFor(m: Match) {
  const h = m.human;
  if (!h) return '';
  const r = m.restart;
  if (r?.ready && r.taker === h) {
    switch (r.kind) {
      case 'kickoff': return `Kick-off: ${btn('A', 'J')} to pass`;
      case 'throw': return `Throw-in: aim with the stick · ${btn('A', 'J')} short · ${btn('B', 'L')} long`;
      case 'corner': return `Corner: ${btn('B', 'L')} cross into the box · ${btn('A', 'J')} short pass`;
      case 'goalkick': return `Goal kick: ${btn('A', 'J')} pass · ${btn('B', 'L')} kick it long`;
      case 'free': return r.indirect
        ? `Free kick (indirect: someone else must touch it before a goal counts): ${btn('A', 'J')} pass · ${btn('B', 'L')} cross`
        : `Free kick: ${btn('X', 'K')} shoot (hold longer to get it over the wall) · ${btn('A', 'J')} pass · ${btn('B', 'L')} cross`;
      case 'penalty': return `Penalty! Stick: pick your corner (up = high, down = low) · ${btn('X', 'K')} shoot — not too long or it flies over`;
    }
  }
  if (m.penalty && m.penalty.keeper === h && !m.penalty.kickedAt) return `Penalty against you! Hold the stick where you'll dive (up = high, nothing = stay in the middle)`;
  if (m.ball.holder === h && h.role === 'gk') return `Your keeper has it: ${btn('A', 'J')} throw · ${btn('X', 'K')} kick it long`;
  return '';
}

// ---------- events → sounds and banners ----------

/** Where the ball is (sounds are placed there). */
const bx = () => match?.ball.pos.x ?? 0;

function onEvent(e: MatchEvent) {
  if (attract && (e.kind === 'banner' || e.kind === 'whistle' || e.kind === 'fulltime' || e.kind === 'halftime')) return;
  switch (e.kind) {
    case 'whistle': SFX.whistle(e.long); break;
    case 'kick':
      SFX.kick(e.power, bx(), e.header);
      // A hard strike gives the camera a little jolt.
      if (!attract && e.power > 12) shake = Math.max(shake, (e.power - 12) / 7);
      break;
    case 'touch': SFX.touch(bx()); break;
    case 'bounce': SFX.bounce(e.speed, bx()); break;
    case 'post': SFX.post(bx()); break;
    case 'net': SFX.net(e.speed, bx()); stadium.shakeNet(e.end, e.speed); break;
    case 'goal': SFX.goal(e.side.index === 0); break;
    case 'save': SFX.save(e.catch, bx()); break;
    case 'tackle': SFX.tackle(e.won, bx()); break;
    case 'miss': SFX.miss(); break;
    case 'foul': SFX.foul(e.penalty); break;
    case 'card': SFX.card(e.red); break;
    case 'offside': SFX.offside(); break;
    case 'banner': hud.showBanner(e.text, e.sub, e.time, e.color); break;
    case 'fulltime': fullTimeAt = performance.now() / 1000 + 3; break;
    case 'halftime': break;
  }
}

// ---------- camera ----------

let camX = 0, camZ = 0, zoom = 0, shake = 0, penBlend = 0;
const penFrom = new THREE.Vector3(), penAt = new THREE.Vector3();
/** For tools: put the camera somewhere fixed ([x, y, z, lookX, lookY, lookZ]). */
let camOverride: number[] | null = null;
const look = new THREE.Vector3();
function updateCamera(dt: number) {
  const cam = renderer.camera;
  if (camOverride) {
    const [x, y, z, lx, ly, lz] = camOverride;
    cam.position.set(x, y, z);
    cam.lookAt(lx, ly, lz);
    return;
  }
  const f = match ? match.focus() : { x: 0, z: 0, zoom: 0 };
  const k = (rate: number) => 1 - Math.exp(-dt * rate);
  camX += (Math.max(-L + 7, Math.min(L - 7, f.x)) - camX) * k(2.6);
  camZ += (f.z - camZ) * k(2);
  zoom += (f.zoom - zoom) * k(2.2);
  // Follow the ball across the pitch enough to keep the near touchline in view.
  look.set(camX, 0, camZ * 0.7 - 1);
  const base = new THREE.Vector3(camX, CAMERA.height, W + CAMERA.back);
  // Zoom in on celebrations.
  const target = new THREE.Vector3(f.x, 0.7, f.z);
  cam.position.copy(base).lerp(target.clone().add(new THREE.Vector3(0, 4, 9)), zoom * 0.75);
  look.lerp(target, zoom);
  // Penalties: a camera behind the taker.
  const pv = match?.penaltyView() ?? null;
  penBlend += ((pv ? 1 : 0) - penBlend) * k(3);
  if (pv) { penFrom.set(...pv.from); penAt.set(...pv.at); }
  if (penBlend > 0.001) {
    cam.position.lerp(penFrom, penBlend);
    look.lerp(penAt, penBlend);
  }
  if (shake > 0.01) {
    const a = shake * 0.12;
    look.x += (Math.random() - 0.5) * a;
    look.y += (Math.random() - 0.5) * a;
    shake *= Math.exp(-dt * 14);
  }
  cam.lookAt(look);
  SFX.listen(cam.position.x);
}

// ---------- loop ----------

const proj = new THREE.Vector3();
const loop = new GameLoop(
  (dt) => {
    const now = performance.now() / 1000;
    menu.update(now);
    const input = menu.open || paused ? NO_INPUT : controller.poll(dt);
    if (menu.open) controller.poll(dt);
    if (!match) return;
    if (!attract && !menu.open && input.b.pause.pressed) { pauseMenu(); return; }
    if (paused) return;
    for (let i = 0; i < simSpeed; i++) {
      match.update(dt, attract ? NO_INPUT : input);
      for (const e of match.events) onEvent(e);
    }
    if (attract && match.phase === 'fulltime') demoMatch();
    if (fullTimeAt && now > fullTimeAt && !menu.open) { fullTimeAt = 0; fullTimeMenu(); }
  },
  (frameDt) => {
    if (match) {
      match.render(frameDt);
      const a = match.sides[0], b = match.sides[1];
      hud.setScore(a.team, a.kit, a.score, match.training ? null : b.team, match.training ? null : b.kit, b.score, match.training ? null : match.minute, match.cardsFor(a), match.cardsFor(b));
      // Power bar over your player's head.
      const h = match.human;
      if (h && match.charge && !attract) {
        proj.set(h.x, 1.5, h.z).project(renderer.camera);
        hud.setPower(match.charge.power, (proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight);
      } else hud.setPower(null);
      hud.setHint(attract ? '' : hintFor(match));
      stadium.update(frameDt, match.excitement());
      if (!paused) SFX.crowd(frameDt, match.excitement(), !!match.penalty && !match.penalty.kickedAt);
      fade.classList.toggle('on', (match.phase === 'goal' && match.phaseT > 4.7) || (match.phase === 'halftime' && match.phaseT > 3.2));
    }
    hud.update(frameDt);
    updateCamera(frameDt);
    renderer.render(frameDt);
  },
);

// Say whether a controller is connected (browsers only see one after a button press).
setInterval(() => {
  const pads = connectedGamepads();
  padStatus.textContent = pads.length ? `🎮 ${pads.length > 1 ? `${pads.length} controllers` : 'Controller'} connected` : '🎮 Press a button on your controller';
}, 1000);

window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !menu.open) toggleFullscreen(); });

// ---------- debug / test hooks ----------

declare global {
  interface Window { soccer: unknown }
}
window.soccer = {
  get match() { return match; },
  /** The sounds (tools: soccer.sfx.kick(15), soccer.sfx.goal(true)...). */
  sfx: SFX,
  get menu() { return menu; },
  start(home = 'duck', away = 'pig', half = 5, difficulty: Difficulty = 'medium', training = false) {
    menu.hide();
    startMatch({ home: TEAMS.find((t) => t.id === home)!, away: TEAMS.find((t) => t.id === away)!, half, difficulty, training });
  },
  /** Your side plays itself. */
  auto(on = true) { if (match) match.autopilot = on; },
  /** Run the simulation n times faster. */
  speed(n: number) { simSpeed = Math.max(0, Math.floor(n)); },
  camera(at: number[] | null) { camOverride = at; },
  title: titleMenu,
  teamPic,
};

loop.start();
titleMenu();
