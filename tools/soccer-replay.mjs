// Goal replay: forces a goal from a long shot, waits through the celebration, and takes frames of the
// replay (tools/shots/soccer/replay-*.png). Prints phases along the way.
// Usage: node tools/soccer-replay.mjs [goals=1]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const goals = Number(process.argv[2] ?? 1);
const out = new URL('./shots/soccer/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(() => { window.soccer.start('dog', 'cat', 20, 'medium'); window.soccer.auto(true); window.soccer.match.replays = true; });
for (let g = 0; g < goals; g++) {
  await page.waitForFunction(() => window.soccer.match.phase === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const m = window.soccer.match;
    const s = m.sides[0], dir = s.dir;
    const p = s.players.find((q) => q.role === 'fwd');
    p.teleport(dir * 9, -2, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const gk = m.sides[1].players.find((q) => q.role === 'gk');
    gk.teleport(dir * 19, -9, 0);
    m.ball.owner = null;
    m.ball.place(dir * 9.6, -2);
    m.ball.vel.set(dir * 15, 2.2, 1.2);
    m.ball.lastTouch = p;
  });
  await page.waitForFunction(() => window.soccer.match.phase === 'goal', null, { timeout: 6000 });
  console.log('goal');
  await page.waitForFunction(() => window.soccer.match.phase === 'replay', null, { timeout: 9000 });
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}replay-${g}-${i}.png` });
  }
  await page.waitForFunction(() => window.soccer.match.phase !== 'replay', null, { timeout: 15000 });
  console.log(`replay lasted ${((Date.now() - t0) / 1000).toFixed(1)} s; now ${await page.evaluate(() => window.soccer.match.phase)}`);
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
