// BB Golf: the golfer walking up to the ball the long way round (round the windmill, over a wall):
// puts the ball somewhere, lets the golfer walk, and checks they never walk through anything solid.
// Usage: node tools/golf-walk.mjs [hole] [x] [z]   (frames: tools/shots/golf/walk-*.png)
import { chromium } from 'playwright';
const holeNo = Number(process.argv[2] ?? 13), bx = Number(process.argv[3] ?? 0.6), bz = Number(process.argv[4] ?? -10);
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
await page.evaluate((n) => window.golf.play(n - 1), holeNo);
await page.waitForTimeout(600);
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
await page.evaluate(([x, z]) => { const h = window.golf.hole; h.physics.place(x, z); h.overview = true; h.afterStop(); }, [bx, bz]);
const trail = [];
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(150);
  const s = await page.evaluate(() => { const h = window.golf.hole, r = h.player.golfer.root.position; return { x: r.x, y: r.y, z: r.z, solid: h.blocked(r.x, r.z), walking: h.player.golfer.walking }; });
  trail.push(s);
  if (i % 8 === 0) await page.screenshot({ path: `${out}walk-${i / 8}.png` });
  if (!s.walking) break;
}
console.log(trail.map((t) => `${t.x.toFixed(1)},${t.z.toFixed(1)} y${t.y.toFixed(2)}${t.solid ? ' SOLID' : ''}`).join(' | '));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
