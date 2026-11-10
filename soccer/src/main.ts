import '@fontsource/bungee';
import '@fontsource/fredoka';
import './ui/style.css';
import * as THREE from 'three';
import { GameLoop } from '@engine/loop';
import { Renderer, toggleFullscreen } from '@engine/renderer';
import { connectedGamepads } from '@engine/input';
import { Thumbnailer } from '@engine/thumbnails';
import { AI_LEVELS, CAMERA, CONDITIONS, type Difficulty, HALF_LENGTHS, PITCH } from './data/tuning';
import { TEAMS, type Team, kitsFor } from './data/teams';
import { GROUNDS, TIME_NAMES, type TimeOfDay, type Weather, drawConditions, conditionsFor, weatherName } from './data/grounds';
import { PlayerRig } from './entities/playerModel';
import { Match, type MatchEvent, type MatchOptions } from './game/match';
import { CONTROL_HELP, Controller, NO_INPUT } from './game/controls';
import { SFX, initSounds } from './game/sounds';
import { Replay } from './game/replay';
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

let stadium = new Stadium();
/** Whether this match is at your team's ground (side 0's) or theirs. */
let hostIsYou = true;
renderer.scene.add(stadium.group);

/** Build the home team's ground for a match, at a time of day and in some weather. */
function buildStadium(opts: MatchOptions) {
  const { time, weather } = opts.time && opts.weather ? { time: opts.time, weather: opts.weather } : drawConditions();
  const [hk, ak] = kitsFor(opts.home, opts.away);
  const fans = (t: Team, k: typeof hk) => ({ animal: t.id, fur: t.fur, colors: [k.shirt, k.shirt, k.trim, k.shorts] });
  // Played at either team's ground (training: yours). Their fans fill it; the visitors get an end.
  hostIsYou = opts.training || (opts.venue ? opts.venue === 'home' : Math.random() < 0.5);
  const [host, hostKit, guest, guestKit] = hostIsYou ? [opts.home, hk, opts.away, ak] : [opts.away, ak, opts.home, hk];
  stadium.dispose();
  stadium = new Stadium({
    ground: GROUNDS[host.id as keyof typeof GROUNDS],
    time, weather,
    home: fans(host, hostKit),
    away: opts.training ? null : fans(guest, guestKit),
  });
  renderer.scene.add(stadium.group);
  renderer.scene.fog = stadium.fog;
  Object.assign(CONDITIONS, conditionsFor(weather));
  SFX.weather(weather);
  // Who's singing in the stands.
  SFX.setTeams({ animal: host.id, chant: host.chant }, opts.training ? null : { animal: guest.id, chant: guest.chant });
  SFX.onChant = (away, secs, delay, beat) => stadium.chant(away, secs, delay, beat);
  return { time, weather };
}
const hud = new Hud(ui);
const menu = new Menu(ui);
const controller = new Controller();
const fade = document.createElement('div');
fade.className = 'fade';
ui.appendChild(fade);
const replayTag = document.createElement('div');
replayTag.className = 'replaytag';
replayTag.innerHTML = 'REPLAY<small>press any button to skip</small>';
ui.appendChild(replayTag);
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
/** Goal replays: recorded as we go, played after the celebration. */
const replay = new Replay();
let replayCount = 0;
/** Fading out at the end of a replay (real time it finishes). */
let replayOutAt = 0;

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
  const where = buildStadium(opts);
  match = new Match(opts);
  match.autopilot = demo;
  match.replays = !demo;
  attract = demo;
  replay.stop();
  replayOutAt = 0;
  renderer.scene.add(match.group);
  paused = false;
  fullTimeAt = 0;
  hud.show(!demo);
  hud.hideBanner();
  controller.reset();
  if (!demo) {
    lastSetup = { ...opts, time: undefined, weather: undefined, venue: undefined };
    // Where we are, and what it's like.
    hud.showBanner(stadium.look.ground.name.toUpperCase(), `${TIME_NAMES[where.time]} · ${weatherName(where.time, where.weather)}`, 2.6);
  }
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

/** Ball sounds are noted for the replay too. */
function again(play: () => void) {
  play();
  if (match) replay.sound(match.time, play);
}

function onEvent(e: MatchEvent) {
  if (attract && (e.kind === 'banner' || e.kind === 'whistle' || e.kind === 'fulltime' || e.kind === 'halftime')) return;
  const x = bx();
  switch (e.kind) {
    case 'replay':
      if (replay.start(e.from, e.to, e.end)) { replayCount++; hud.hideBanner(); }
      else match?.replayDone();
      break;
    case 'whistle': SFX.whistle(e.long); break;
    case 'kick':
      again(() => SFX.kick(e.power, x, e.header));
      // A hard strike gives the camera a little jolt.
      if (!attract && e.power > 12) shake = Math.max(shake, (e.power - 12) / 7);
      break;
    case 'touch': again(() => SFX.touch(x)); break;
    case 'bounce': again(() => SFX.bounce(e.speed, x)); break;
    case 'post': again(() => SFX.post(x)); break;
    case 'net': again(() => { SFX.net(e.speed, x); stadium.shakeNet(e.end, e.speed); }); break;
    case 'save': again(() => SFX.save(e.catch, x)); break;
    case 'goal':
      SFX.goal(e.side.index === 0);
      // The scorers' fans burst into song (the home team is side 0; the away end is theirs).
      if (!attract) SFX.chantFor((e.side.index === 0) !== hostIsYou, 3.2);
      break;
    case 'tackle': SFX.tackle(e.won, bx()); break;
    case 'miss': SFX.miss(); break;
    case 'foul': SFX.foul(e.penalty); break;
    case 'card': SFX.card(e.red); break;
    case 'offside': SFX.offside(); break;
    case 'voice': SFX.voice(e.who.team.id, e.mood, e.who.x); break;
    case 'banner': hud.showBanner(e.text, e.sub, e.time, e.color); break;
    case 'fulltime': fullTimeAt = performance.now() / 1000 + 3; break;
    case 'halftime': break;
  }
}

// ---------- camera ----------

let camX = 0, camZ = 0, zoom = 0, shake = 0, penBlend = 0;
/** Where the ball is in the replay being shown (null: no replay). */
let replayBall: THREE.Vector3 | null = null;
const penFrom = new THREE.Vector3(), penAt = new THREE.Vector3();
/** For tools: put the camera somewhere fixed ([x, y, z, lookX, lookY, lookZ]). */
let camOverride: number[] | null = null;
const look = new THREE.Vector3();
const replayLook = new THREE.Vector3(), replayPos = new THREE.Vector3();
function updateCamera(dt: number) {
  const cam = renderer.camera;
  if (camOverride) {
    const [x, y, z, lx, ly, lz] = camOverride;
    cam.position.set(x, y, z);
    cam.lookAt(lx, ly, lz);
    return;
  }
  if (replayBall) {
    // Replays: from behind the goal (or low on the touchline, every other goal), following the ball.
    const b = replayBall, end = replay.end;
    const want = replayCount % 2
      ? new THREE.Vector3(end * (L + 6.5), 3.6, Math.max(-6, Math.min(6, b.z * 0.6)))
      : new THREE.Vector3(Math.max(-L + 4, Math.min(L - 4, b.x - end * 5)), 1.9, W + 3.2);
    const k = 1 - Math.exp(-dt * 3);
    if (replayPos.lengthSq() === 0) { replayPos.copy(want); replayLook.copy(b); }
    replayPos.lerp(want, k);
    replayLook.lerp(new THREE.Vector3(b.x, Math.min(b.y, 1.2) * 0.6 + 0.3, b.z), 1 - Math.exp(-dt * 6));
    cam.position.copy(replayPos);
    cam.lookAt(replayLook);
    return;
  }
  replayPos.set(0, 0, 0);
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
    // Any button skips a replay.
    if (replay.playing && !attract && !replayOutAt && Object.values(input.b).some((s) => s.pressed)) replayOutAt = now + 0.3;
    for (let i = 0; i < simSpeed; i++) {
      match.update(dt, attract ? NO_INPUT : input);
      for (const e of match.events) onEvent(e);
    }
    if (attract && match.phase === 'fulltime') demoMatch();
    if (fullTimeAt && now > fullTimeAt && !menu.open) { fullTimeAt = 0; fullTimeMenu(); }
  },
  (frameDt) => {
    replayBall = null;
    if (match && replay.playing) {
      // Playing back a goal: pose everything from the recording; fade out at the end.
      const now = performance.now() / 1000;
      replayBall = replay.update(paused ? 0 : frameDt, match.ball);
      if (replay.left < 0.3 && !replayOutAt && !paused) replayOutAt = now + 0.3;
      if (replayOutAt && now > replayOutAt) {
        replayOutAt = 0;
        replay.stop();
        replayBall = null;
        match.replayDone();
      }
    } else if (match) {
      match.render(frameDt);
      if (!attract) replay.capture(match.time, match.rigs(), match.ball);
    }
    replayTag.classList.toggle('on', !!replayBall);
    if (match) {
      const a = match.sides[0], b = match.sides[1];
      hud.setScore(a.team, a.kit, a.score, match.training ? null : b.team, match.training ? null : b.kit, b.score, match.training ? null : match.minute, match.cardsFor(a), match.cardsFor(b));
      // Power bar over your player's head.
      const h = match.human;
      if (h && match.charge && !attract) {
        proj.set(h.x, 1.5, h.z).project(renderer.camera);
        hud.setPower(match.charge.power, (proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight);
      } else hud.setPower(null);
      hud.setHint(attract ? '' : hintFor(match));
      stadium.update(frameDt, match.excitement(), renderer.camera.position.x);
      if (!paused) SFX.crowd(frameDt, match.excitement(), !!match.penalty && !match.penalty.kickedAt);
      fade.classList.toggle('on', (match.phase === 'goal' && match.phaseT > 5.7) || (match.phase === 'halftime' && match.phaseT > 3.2) || !!replayOutAt);
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
  /** Start a match (tools: sunny afternoon unless a time and weather are given). */
  start(home = 'duck', away = 'pig', half = 5, difficulty: Difficulty = 'medium', training = false, time: TimeOfDay = 'day', weather: Weather = 'sunny') {
    menu.hide();
    startMatch({ home: TEAMS.find((t) => t.id === home)!, away: TEAMS.find((t) => t.id === away)!, half, difficulty, training, time, weather, venue: 'home' });
  },
  /** Your side plays itself. */
  auto(on = true) { if (match) { match.autopilot = on; match.replays = !on; } },
  /** Run the simulation n times faster. */
  speed(n: number) { simSpeed = Math.max(0, Math.floor(n)); },
  camera(at: number[] | null) { camOverride = at; },
  title: titleMenu,
  teamPic,
};

loop.start();
titleMenu();
