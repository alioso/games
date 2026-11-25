// Close-up pictures of the heaven table (seats, bowls, chopsticks). Usage: node tools/maze-heaven-close.mjs [id]
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const id = process.argv[2] ?? 'knight-dog';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1200);
await page.evaluate((id) => { window.maze.heaven(id); }, id);
await page.evaluate(() => window.maze.heavenScene.skip());
await page.waitForTimeout(2500);
const views = process.argv[3] ? JSON.parse(process.argv[3]) : { side: [0, 1.3, 3.6, 0, 0.6, 0], end: [-6, 1.6, 0.01, 0, 0.6, 0], top: [0.5, 5, 2.5, 0, 0.5, 0], far: [2.5, 1.5, -3.2, 2.5, 0.7, 0] };
for (const [n, v] of Object.entries(views)) {
  await page.evaluate((v) => { window.maze.heavenScene.debugCam = v; }, v);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}heaven-close-${n}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
