// Every team's ground, each at a different time of day and weather (tools/shots/soccer/grounds.png).
// Usage: node tools/soccer-grounds.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
const combos = [
  ['bunny', 'pig', 'day', 'sunny'], ['pig', 'dog', 'day', 'rain'], ['dog', 'cat', 'evening', 'sunny'], ['cat', 'duck', 'night', 'sunny'],
  ['duck', 'raccoon', 'day', 'snow'], ['raccoon', 'bear', 'evening', 'windy'], ['bear', 'mouse', 'night', 'rain'], ['mouse', 'bunny', 'day', 'cloudy'],
  ['dog', 'duck', 'night', 'snow'],
];
const shots = [];
for (const [home, away, time, weather] of combos) {
  await page.evaluate(([home, away, time, weather]) => { window.soccer.start(home, away, 20, 'medium', false, time, weather); window.soccer.auto(true); }, [home, away, time, weather]);
  await page.waitForTimeout(3500);
  shots.push(await page.screenshot());
}
const data = await page.evaluate(async ({ shots, cols }) => {
  const imgs = await Promise.all(shots.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; })));
  const c = document.createElement('canvas');
  c.width = 400 * cols; c.height = 225 * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  imgs.forEach((im, i) => g.drawImage(im, (i % cols) * 400, Math.floor(i / cols) * 225, 400, 225));
  return c.toDataURL('image/png').split(',')[1];
}, { shots: shots.map((b) => b.toString('base64')), cols: 3 });
writeFileSync(`${out}grounds.png`, Buffer.from(data, 'base64'));
shots.forEach((b, i) => writeFileSync(`${out}ground-${i}.png`, b));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
