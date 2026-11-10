// Close-up screenshots for checking animation and the goals: the camera zooms on a player while the
// computer plays, in a burst of frames (tools/shots/soccer/close-*.png).
// Usage: node tools/soccer-closeup.mjs [frames=8] [gap ms=70]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const frames = Number(process.argv[2] ?? 8), gap = Number(process.argv[3] ?? 70);
const out = new URL('./shots/soccer/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(() => { window.soccer.start('duck', 'pig', 20, 'medium'); window.soccer.auto(true); });
await page.waitForTimeout(6000);
// Follow whoever has the ball (or is nearest it), zoomed in.
await page.evaluate(() => {
  const m = window.soccer.match;
  m.focus = () => {
    const b = m.ball.pos;
    return { x: b.x, z: b.z, zoom: 1 };
  };
});
await page.waitForTimeout(1500);
for (let i = 0; i < frames; i++) {
  await page.screenshot({ path: `${out}close-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(gap);
}
// The goal at +x, from the zoomed camera.
await page.evaluate(() => { const m = window.soccer.match; m.focus = () => ({ x: 19, z: 0, zoom: 1 }); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}close-goal.png` });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
