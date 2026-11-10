// Set pieces, staged one by one with you (the keyboard) involved: a free kick near goal, a penalty
// for you, a penalty against you (you dive), an offside, and a sending-off. Prints what happened
// and saves screenshots (tools/shots/soccer/set-*.png).
// Usage: node tools/soccer-setpieces.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5175/');
await wait(1500);
await page.evaluate(() => {
  window.soccer.start('duck', 'pig', 20, 'medium');
  const m = window.soccer.match;
  window.__log = [];
  const em = m.emit.bind(m);
  m.emit = (e) => { if (['banner', 'foul', 'card', 'offside', 'goal', 'save'].includes(e.kind)) window.__log.push(e.kind === 'banner' ? `banner ${e.text} (${e.sub ?? ''})` : e.kind + (e.kind === 'card' ? (e.red ? ' red' : ' yellow') : '')); em(e); };
});
const log = async (label) => {
  const r = await page.evaluate(() => { const m = window.soccer.match; const l = window.__log.splice(0); return { phase: m.phase, restart: m.restart?.kind ?? '-', score: `${m.sides[0].score}-${m.sides[1].score}`, log: l }; });
  console.log(`${label}: ${r.phase}/${r.restart} score ${r.score} | ${r.log.join(' | ')}`);
};
// Put play somewhere: everyone parked, then `by` fouls `on` there (sliding from behind or not).
const stageFoul = (args) => page.evaluate(([x, z, bySide, how, behind]) => {
  const m = window.soccer.match;
  m.restart = null; m.phase = 'play'; m.phaseT = 0; m.penalty = null;
  m.ball.dead = false;
  const on = m.sides[1 - bySide].players.find((p) => p.role === 'fwd') ?? m.sides[1 - bySide].players[1];
  const by = m.sides[bySide].players[1];
  m.players.forEach((p, i) => { if (p !== on && p !== by && p.role !== 'gk') p.teleport(-3 + (i % 5) * 1.5 * Math.sign(-x || 1), -8 + (i % 4) * 4, 0); });
  on.teleport(x, z, 0);
  by.teleport(x - 0.5, z, 0);
  m.ball.place(x, z + 0.4);
  m.ball.owner = on;
  m['foul'](by, on, how, behind);
}, args);

// 1. Free kick for you, 13 m out.
await stageFoul([9, 2, 1, 'tackle', false]);
await wait(4500);
await log('free kick set up');
await page.screenshot({ path: `${out}set-1-freekick.png` });
await page.keyboard.down('KeyK'); await wait(700); await page.keyboard.up('KeyK');
await wait(2500);
await log('free kick taken');

// 2. Penalty for you: aim right (D), shoot.
await stageFoul([18, 1, 1, 'tackle', false]);
await wait(4500);
await log('penalty set up');
await page.screenshot({ path: `${out}set-2-penalty.png` });
await page.keyboard.down('KeyD');
await page.keyboard.down('KeyK'); await wait(500); await page.keyboard.up('KeyK');
await wait(500);
await page.screenshot({ path: `${out}set-3-penalty-shot.png` });
await page.keyboard.up('KeyD');
await wait(2000);
await log('penalty taken');
await wait(4000);

// 3. Penalty against you: hold left (A) to dive that way.
await stageFoul([-18, 0.5, 0, 'tackle', false]);
await wait(4000);
await log('penalty against set up');
await page.keyboard.down('KeyA');
await page.waitForFunction(() => window.soccer.match.penalty?.kickedAt > 0, null, { timeout: 8000 }).catch(() => {});
await wait(280);
await page.screenshot({ path: `${out}set-4-penalty-dive.png` });
await page.keyboard.up('KeyA');
await wait(1500);
await log('penalty against taken');
await wait(4000);

// 4. Offside: your striker well past their defence, a teammate passes to them (the teams' brains
// paused so nothing else happens).
await page.evaluate(() => {
  const m = window.soccer.match;
  m.restart = null; m.phase = 'play'; m.phaseT = 0; m.penalty = null; m.ball.dead = false;
  window.__brains = m.sides.map((s) => s.brain.update);
  for (const s of m.sides) s.brain.update = () => {};
  m.autopilot = true;
  const [us, them] = m.sides;
  window.__level = us.level;
  us.level = { ...us.level, passError: 0 };
  const dir = us.dir;
  them.players.forEach((p, i) => { if (p.role !== 'gk') p.teleport(dir * 4, -9 + i * 3, 0); });
  const mid = us.players[3], fwd = us.players[6];
  us.players.forEach((p) => { if (p !== mid && p !== fwd && p.role !== 'gk') p.teleport(-dir * 8, p.z, 0); });
  mid.teleport(-dir * 2, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  fwd.teleport(dir * 11, 2, -Math.PI / 2 * dir);
  m.ball.place(mid.x + dir * 0.4, 0); m.ball.owner = mid;
  m.orders.set(mid, { kind: 'pass', power: 0.7, aimX: fwd.x - mid.x, aimZ: fwd.z - mid.z, target: fwd, until: m.time + 1 });
});
await wait(3000);
await log('offside');
await page.evaluate(() => { const m = window.soccer.match; m.sides.forEach((s, i) => { s.brain.update = window.__brains[i]; }); m.sides[0].level = window.__level; m.autopilot = false; });
await wait(3000);
await log('indirect free kick');

// 5. Two bad slides from behind by the same player (the referee's dice loaded): second yellow, off.
await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.3; });
await stageFoul([2, -3, 1, 'slide', true]);
await page.evaluate(() => { Math.random = window.__rnd; });
await wait(3500);
await page.evaluate(() => { Math.random = () => 0.3; });
await stageFoul([4, -2, 1, 'slide', true]);
await page.evaluate(() => { Math.random = window.__rnd; });
await wait(1800);
await page.evaluate(() => { const r = window.soccer.match.referee.p; window.soccer.camera([r.x + 1.5, 1.6, r.z + 3.2, r.x, 0.8, r.z]); });
await wait(300);
await page.screenshot({ path: `${out}set-5-card.png` });
await page.evaluate(() => window.soccer.camera(null));
await wait(2500);
await log('sending off');
console.log(await page.evaluate(() => `players left: ${window.soccer.match.sides.map((s) => s.players.length).join(' v ')}; cards ${JSON.stringify(window.soccer.match.cardsFor(window.soccer.match.sides[1]))}`));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
