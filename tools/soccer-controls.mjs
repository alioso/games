// Plays with the keyboard like a person: kick-off pass, dribbling, held shots from the edge of the
// box, and tackles. Prints what happened. Screenshots: tools/shots/soccer/ctl-*.png
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
const wait = (ms) => page.waitForTimeout(ms);
const out = new URL('./shots/soccer/', import.meta.url).pathname;
await page.goto('http://localhost:5175/');
await wait(2000);
await page.evaluate(() => window.soccer.start('duck', 'pig', 5, 'easy'));
await wait(1500);
const st = () => page.evaluate(() => {
  const m = window.soccer.match, h = m.human;
  return { phase: m.phase, human: h ? `#${h.number}` : null, owner: m.ball.owner ? `${m.ball.owner.team.id}#${m.ball.owner.number}` : m.ball.holder ? `hands:${m.ball.holder.team.id}` : '-', ball: [+m.ball.pos.x.toFixed(1), +m.ball.pos.y.toFixed(1), +m.ball.pos.z.toFixed(1)], speed: +m.ball.speed.toFixed(1), score: `${m.sides[0].score}-${m.sides[1].score}` };
});
console.log('before kick-off:', JSON.stringify(await st()));
await page.keyboard.press('KeyJ');
await wait(400);
console.log('after tapping pass:', JSON.stringify(await st()));
await wait(1200);
console.log('a moment later (should control the receiver):', JSON.stringify(await st()));

// Dribble: hold right for a second.
await page.evaluate(() => { const m = window.soccer.match; const h = m.human; m.ball.place(h.x + 0.4, h.z); m.sides[1].players.forEach((p) => { if (p.role !== 'gk') p.teleport(p.x - 30 * p.side.dir, p.z, 0); }); });
await page.keyboard.down('KeyD');
await wait(1000);
await page.keyboard.up('KeyD');
console.log('after dribbling right 1s:', JSON.stringify(await st()));
await page.screenshot({ path: `${out}ctl-1-dribble.png` });

// Shots: from the edge of the box, hold K for different times.
const results = [];
for (const [hold, aim] of [[200, null], [450, null], [700, null], [450, 'KeyW'], [450, 'KeyS'], [1000, null]]) {
  await page.evaluate(() => {
    const m = window.soccer.match;
    m.restart = null; m.phase = 'play'; m.phaseT = 0;
    const h = m.sides[0].players[6];
    m.setHuman(h);
    h.teleport(13, 2, Math.PI / 2);
    m.ball.place(13.4, 2);
    m.ball.owner = h;
    m.sides[1].players.forEach((p) => { if (p.role !== 'gk') p.teleport(-10, p.z, 0); });
    const k = m.sides[1].players[0]; k.teleport(21.2, 0, -Math.PI / 2);
  });
  await wait(300);
  if (aim) await page.keyboard.down(aim);
  await page.keyboard.down('KeyK');
  await wait(hold);
  if (hold === 450 && !aim) await page.screenshot({ path: `${out}ctl-2-powerbar.png` });
  await page.keyboard.up('KeyK');
  if (aim) await page.keyboard.up(aim);
  await wait(1600);
  const s = await st();
  results.push({ hold, aim, phase: s.phase, score: s.score, ball: s.ball, owner: s.owner });
  if (s.phase === 'goal') await wait(5500);
}
console.table(results);

// Tackle: the opponent has the ball right in front of you.
await page.evaluate(() => {
  const m = window.soccer.match;
  m.restart = null; m.phase = 'play';
  const h = m.sides[0].players[3], o = m.sides[1].players[6];
  m.setHuman(h);
  h.teleport(0, 0, Math.PI / 2);
  o.teleport(1.6, 0, -Math.PI / 2);
  m.ball.place(1.2, 0);
  m.ball.owner = o;
});
await wait(150);
await page.keyboard.press('KeyJ');
await wait(700);
console.log('after tackle:', JSON.stringify(await st()));
await page.screenshot({ path: `${out}ctl-3-tackle.png` });
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no page errors');
await browser.close();
