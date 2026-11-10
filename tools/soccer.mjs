// Animal Soccer smoke test: title screen, a match kicking off, then the computer playing both sides
// for a while. Screenshots in tools/shots/soccer/, plus the score and any page errors.
// Usage: node tools/soccer.mjs [seconds of play=40] [speed=4]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const seconds = Number(process.argv[2] ?? 40);
const speed = Number(process.argv[3] ?? 4);
const out = new URL('./shots/soccer/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5175/');
await wait(2500);
await page.screenshot({ path: `${out}01-title.png` });
await page.evaluate(() => window.soccer.start('duck', 'pig', 5, 'medium'));
await wait(1200);
await page.screenshot({ path: `${out}02-kickoff.png` });
await page.evaluate((s) => { window.soccer.auto(true); window.soccer.speed(s); }, speed);
const state = () => page.evaluate(() => {
  const m = window.soccer.match;
  return { phase: m.phase, minute: Math.floor(m.minute), score: `${m.sides[0].score}-${m.sides[1].score}`, ball: [m.ball.pos.x.toFixed(1), m.ball.pos.y.toFixed(1), m.ball.pos.z.toFixed(1)], owner: m.ball.owner ? `${m.ball.owner.team.id}#${m.ball.owner.number}` : m.ball.holder ? `hands:${m.ball.holder.team.id}` : '-' };
});
const phases = {};
let shots = 3;
for (let t = 0; t < seconds; t += 2) {
  await wait(2000);
  const s = await state();
  phases[s.phase] = (phases[s.phase] ?? 0) + 1;
  if (t % 8 === 0) console.log(t, JSON.stringify(s));
  if (t % 10 === 4 && shots < 9) {
    await page.evaluate(() => window.soccer.speed(1));
    await wait(300);
    await page.screenshot({ path: `${out}${String(shots++).padStart(2, '0')}-play.png` });
    await page.evaluate((s) => window.soccer.speed(s), speed);
  }
}
console.log('phases seen:', phases);
console.log('final:', JSON.stringify(await state()));
console.log(errors.length ? errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
