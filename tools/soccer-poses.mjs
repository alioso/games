// Freeze the game and pose one player through a run cycle and a kick, close up, to check the
// animation (tools/shots/soccer/poses.png: run on the top row, a shot below).
import { chromium } from 'playwright';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 500, height: 420 } });
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
  p.teleport(0, 4, Math.PI / 2);
  m.ball.place(0.45, 4);
  window.soccer.camera([0.3, 1.4, 7.6, 0.3, 0.45, 4]);
  window.__p = p;
});
await page.waitForTimeout(1500);
const shots = [];
const pose = async (fn, arg) => {
  await page.evaluate(fn, arg);
  await page.waitForTimeout(250);
  shots.push(await page.screenshot());
};
for (let i = 0; i < 6; i++) {
  await pose((ph) => { const p = window.__p; p.vx = 6.5; p.state = 'free'; p.stride = ph; }, (i / 6) * Math.PI * 2);
}
for (const t of [0.05, 0.12, 0.18, 0.22, 0.3, 0.45]) {
  await pose((t) => { const p = window.__p; p.vx = 0; p.state = 'kick'; p.stateT = t; p.kickContact = 0.17; p.kickPower = 0.8; p.kickStyle = 'shot'; }, t);
}
await browser.close();
const fs = await import('node:fs');
shots.forEach((b, i) => fs.writeFileSync(`${out}pose-${String(i).padStart(2, '0')}.png`, b));
console.log(errors.length ? errors.join('\n') : 'no page errors');
