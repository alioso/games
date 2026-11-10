// Every animal's face in each mood (tools/shots/soccer/faces.png): rows are the animals; columns are
// calm, happy, sad, ouch, effort, then running side-on (ears flying back, tail going).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 260, height: 260 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
const pairs = [['bunny', 'pig'], ['dog', 'cat'], ['duck', 'raccoon'], ['bear', 'mouse']];
const moods = [null, 'happy', 'sad', 'ouch', 'effort', 'run'];
const shots = [];
for (const pair of pairs) {
  for (let s = 0; s < 2; s++) {
    await page.evaluate(({ pair, s }) => {
      window.soccer.start(pair[0], pair[1], 20, 'medium');
      window.soccer.speed(0);
      const m = window.soccer.match;
      const p = m.sides[s].players[4];
      for (const q of m.players) if (q !== p) q.teleport(-30, 0, 0);
      m.referee.place(-30, -5);
      m.ball.place(0, 12);
      p.teleport(0, 4, 0);
      const rig = p.rig, orig = rig.animate.bind(rig);
      rig.animate = (pi, dt) => orig({ ...pi, mood: window.__mood ?? undefined }, dt);
      window.__p = p;
    }, { pair, s });
    await page.waitForTimeout(600);
    for (const mood of moods) {
      await page.evaluate((mood) => {
        const p = window.__p;
        window.__mood = mood === 'run' ? null : mood;
        if (mood === 'run') { p.yaw = Math.PI / 2; p.vx = 6.5; p.sprint = true; window.soccer.camera([0.1, 0.85, 6.6, 0.1, 0.7, 4]); }
        else { p.yaw = 0; p.vx = 0; window.soccer.camera([0, 0.95, 5.75, 0, 0.84, 4]); }
      }, mood);
      // Long enough for the expression to settle, avoiding a blink if we can.
      await page.waitForTimeout(500);
      shots.push(await page.screenshot());
    }
  }
}
const data = await page.evaluate(async ({ shots, cols }) => {
  const imgs = await Promise.all(shots.map((b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; })));
  const c = document.createElement('canvas');
  c.width = 180 * cols; c.height = 180 * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d');
  imgs.forEach((im, i) => g.drawImage(im, 40, 50, 180, 180, (i % cols) * 180, Math.floor(i / cols) * 180, 180, 180));
  return c.toDataURL('image/png').split(',')[1];
}, { shots: shots.map((b) => b.toString('base64')), cols: moods.length });
writeFileSync(`${out}faces.png`, Buffer.from(data, 'base64'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
