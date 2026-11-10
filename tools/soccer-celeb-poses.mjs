// The goal-celebration poses, frozen and side-on, a few moments of each (tools/shots/soccer/celeb-poses.png).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.soccer.start('duck', 'pig', 20, 'medium');
  window.soccer.speed(0);
  const m = window.soccer.match;
  const p = m.sides[0].players[4];
  for (const q of m.players) if (q !== p) q.teleport(-30, 0, 0);
  m.referee.place(-30, -5);
  p.teleport(0, 4, Math.PI / 2);
  m.ball.place(0, 12);
  window.__p = p;
});
await page.waitForTimeout(1500);
// [pose, t, y (height off the ground), yaw, speed]
const rows = [
  [['kneeslide', 0.3, 0, Math.PI / 2], ['kneeslide', 1.2, 0, 0.5], ['belly', 0.4, 0, Math.PI / 2], ['belly', 1.8, 0, 0.5], ['spin', 0.5, 0, 0.3], ['clap', 0.1, 0, 0.3], ['clap', 0.32, 0, 0.3]],
  [['flip', 0.0, 0, Math.PI / 2], ['flip', 0.15, 0.5, Math.PI / 2], ['flip', 0.3, 0.85, Math.PI / 2], ['flip', 0.43, 0.9, Math.PI / 2], ['flip', 0.6, 0.75, Math.PI / 2], ['flip', 0.75, 0.3, Math.PI / 2], ['flip', 1.2, 0, 0.3]],
  [['dance', 0.0, 0, 0.2], ['dance', 0.23, 0, 0.2], ['dance', 0.45, 0, 0.2], ['dance', 0.7, 0, 0.2], ['dance', 1.15, 0, 0.2], ['sad', 0.5, 0, 0.6], ['airplane', 0.5, 0, 0.3, 5]],
];
const shots = [];
for (const row of rows) for (const [pose, t, y, yaw, speed] of row) {
  await page.evaluate(({ pose, t, y, yaw, speed }) => {
    const p = window.__p;
    p.state = 'celebrate';
    p.celebPose = pose === 'sad' ? 'celebrate' : pose;
    if (pose === 'sad') { p.state = 'free'; p.glum = true; }
    p.celebAt = 0;
    p.stateT = t;
    p.y = y;
    p.yaw = yaw;
    p.vx = speed ? Math.sin(yaw) * speed : 0; p.vz = speed ? Math.cos(yaw) * speed : 0;
    window.soccer.camera([0, 0.9 + y * 0.6, 8.6, 0, 0.5 + y * 0.6, 4]);
  }, { pose, t, y, yaw, speed: speed ?? 0 });
  await page.waitForTimeout(450);
  shots.push(await page.screenshot());
}
// Stitch into one sheet in the page (canvas), so no image library is needed.
const data = await page.evaluate(async ({ shots, cols }) => {
  const imgs = await Promise.all(shots.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; })));
  const c = document.createElement('canvas');
  c.width = 220 * cols; c.height = 220 * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  imgs.forEach((im, i) => g.drawImage(im, 30, 50, 240, 240, (i % cols) * 220, Math.floor(i / cols) * 220, 220, 220));
  return c.toDataURL('image/png').split(',')[1];
}, { shots: shots.map((b) => b.toString('base64')), cols: 7 });
writeFileSync(`${out}celeb-poses.png`, Buffer.from(data, 'base64'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
