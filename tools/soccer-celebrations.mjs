// Every goal celebration in turn: a goal is forced (the ball rolled into the net off your striker),
// the celebration picked, and frames taken through it (tools/shots/soccer/celeb-<kind>-*.png).
// Usage: node tools/soccer-celebrations.mjs [--close] [kind ...]   (default: all of them)
//   --close: a camera right next to whoever leads the celebration, more frames.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const all = ['pile', 'kneeslide', 'airplane', 'flip', 'dance', 'belly', 'spin'];
const args = process.argv.slice(2);
const close = args.includes('--close');
const named = args.filter((a) => !a.startsWith('--'));
const kinds = named.length ? named : all;
const out = new URL('./shots/soccer/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(() => { window.soccer.start('duck', 'pig', 20, 'medium'); window.soccer.auto(true); window.soccer.sfx.mute?.(true); });
await page.waitForTimeout(3000);
for (const kind of kinds) {
  // Wait for open play, then put the striker on the edge of the box and the ball into the net.
  await page.waitForFunction(() => window.soccer.match.phase === 'play', null, { timeout: 30000 });
  await page.evaluate((kind) => {
    const m = window.soccer.match;
    m.celebPack = [kind];
    const s = m.sides[0], dir = s.dir;
    const p = s.players.find((q) => q.role === 'fwd');
    p.teleport(dir * 16, 3, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const gk = m.sides[1].players.find((q) => q.role === 'gk');
    if (gk) gk.teleport(dir * 19, -8, 0);
    m.ball.owner = null;
    m.ball.place(dir * 20.5, 0.5);
    m.ball.vel.set(dir * 12, 0, 0);
    m.ball.lastTouch = p;
  }, kind);
  await page.waitForFunction(() => window.soccer.match.phase === 'goal', null, { timeout: 5000 });
  const n = close ? 24 : 10;
  for (let i = 0; i < n; i++) {
    if (close) {
      await page.evaluate(() => {
        const l = window.soccer.match.leader;
        if (l && window.soccer.match.phase === 'goal') window.soccer.camera([l.x, 3.2, l.z + 9, l.x, 0.4, l.z - 1]);
        else window.soccer.camera(null);
      });
    }
    await page.waitForTimeout(close ? 230 : 550);
    await page.screenshot({ path: `${out}celeb-${kind}-${String(i).padStart(2, '0')}.png` });
  }
  await page.evaluate(() => window.soccer.camera(null));
  const what = await page.evaluate(() => window.soccer.match.celebration);
  console.log(kind, '->', what);
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
