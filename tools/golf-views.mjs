// BB Golf: the aim view on the tee of each hole (or the ones given), on one sheet: tools/shots/golf/views.png.
// Usage: node tools/golf-views.mjs [hole numbers...]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const list = process.argv.slice(2).map(Number);
const holes = list.length ? list : Array.from({ length: 18 }, (_, i) => i + 1);
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1500);
const shots = [];
for (const n of holes) {
  await page.evaluate((i) => window.golf.play(i, 'knight-bear'), n - 1);
  await page.waitForTimeout(700);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2600);
  shots.push(await page.screenshot());
}
const cols = Math.min(3, shots.length);
const data = await page.evaluate(async ({ shots, cols }) => {
  const imgs = await Promise.all(shots.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; })));
  const c = document.createElement('canvas');
  c.width = 640 * cols; c.height = 400 * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  imgs.forEach((im, i) => g.drawImage(im, (i % cols) * 640, Math.floor(i / cols) * 400, 640, 400));
  return c.toDataURL('image/png').split(',')[1];
}, { shots: shots.map((b) => b.toString('base64')), cols });
writeFileSync(`${out}views.png`, Buffer.from(data, 'base64'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
