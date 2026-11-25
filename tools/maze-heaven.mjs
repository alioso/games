// A Maze In: pictures of the ending at points along the way.
// Usage: node tools/maze-heaven.mjs [character-id]   (pictures in tools/shots/maze/heaven-*.png)
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const id = process.argv[2] ?? 'knight-dog';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}heaven-title.png` });
await page.evaluate((id) => window.maze.heaven(id), id);
for (const t of (process.argv[3] ?? '1,4,7,8.8,11,14,19').split(',').map(Number)) {
  await page.waitForFunction((t) => window.maze.heavenScene && window.maze.heavenScene.t >= t, t, { timeout: 30000 });
  await page.screenshot({ path: `${out}heaven-${t}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
