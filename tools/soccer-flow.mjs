// How a match flows (the computer playing both sides): passes and where they end up (the intended
// teammate, another teammate, intercepted, nobody), tackles, shots, goals, and how long the ball is
// at someone's feet. Usage: node tools/soccer-flow.mjs [seconds=20] [level=medium]
import { chromium } from 'playwright';
const secs = Number(process.argv[2] ?? 20), level = process.argv[3] ?? 'medium';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
console.log(await page.evaluate(async ([secs, level]) => {
  window.soccer.start('duck', 'pig', 20, level); window.soccer.auto(true); window.soccer.speed(4);
  const m = window.soccer.match, b = m.ball;
  const res = { target: 0, mate: 0, intercepted: 0, nobody: 0 }, ev = {};
  let pending = null, owner = null, owned = 0, samples = 0, seen = -1;
  Object.defineProperty(b, 'owner', { get: () => owner, set: (v) => {
    if (v && pending) { res[v === pending.to ? 'target' : v.side === pending.from.side ? 'mate' : 'intercepted']++; pending = null; }
    owner = v;
  } });
  const em = m.emit.bind(m);
  m.emit = (e) => { const k = e.kind === 'tackle' ? (e.won ? 'tackle won' : 'tackle lost') : e.kind; ev[k] = (ev[k] ?? 0) + 1; em(e); };
  const t0 = m.time;
  const step = setInterval(() => {
    samples++;
    if (owner) owned++;
    if (m.pass && m.pass.t !== seen) { pending = { ...m.pass }; seen = m.pass.t; }
    if (pending && (m.time - pending.t > 3 || m.phase !== 'play')) { res.nobody++; pending = null; }
  }, 10);
  await new Promise((r) => setTimeout(r, secs * 1000));
  clearInterval(step);
  const total = res.target + res.mate + res.intercepted + res.nobody;
  return [
    `${(m.time - t0).toFixed(0)} s of play (${level}), score ${m.sides[0].score}-${m.sides[1].score}`,
    `passes ${total}: to the teammate ${res.target}, another teammate ${res.mate}, intercepted ${res.intercepted}, nobody ${res.nobody}`,
    `ball at someone's feet ${Math.round((owned / samples) * 100)}% of the time`,
    `events ${JSON.stringify(ev)}`,
  ].join('\n');
}, [secs, level]));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
