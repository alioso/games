// Every hole from above (the "look at the hole" view) on one sheet: tools/shots/golf/holes.png.
// Usage: node tools/golf-holes.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
const shots = [];
for (let i = 0; i < 18; i++) {
  await page.evaluate((i) => window.golf.play(i), i);
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.golf.hole.overview = true; document.querySelector('.hud').style.display = 'none'; });
  await page.waitForTimeout(1600);
  shots.push(await page.screenshot());
  await page.evaluate(() => { document.querySelector('.hud').style.display = ''; });
}
const data = await page.evaluate(async ({ shots, cols }) => {
  const imgs = await Promise.all(shots.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; })));
  const c = document.createElement('canvas');
  c.width = 400 * cols; c.height = 280 * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  g.font = 'bold 22px sans-serif';
  imgs.forEach((im, i) => {
    const x = (i % cols) * 400, y = Math.floor(i / cols) * 280;
    g.drawImage(im, x, y, 400, 280);
    g.fillStyle = '#000'; g.fillRect(x, y, 34, 28); g.fillStyle = '#fff'; g.fillText(String(i + 1), x + 4, y + 22);
  });
  return c.toDataURL('image/png').split(',')[1];
}, { shots: shots.map((b) => b.toString('base64')), cols: 6 });
writeFileSync(`${out}holes.png`, Buffer.from(data, 'base64'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
