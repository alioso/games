// Ball control check: how far the ball stays from your player's feet while dribbling (jog, sprint,
// sharp turn), and how a pass is received (distance and speed of the ball around the first touch).
// Usage: node tools/soccer-touch.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.soccer.start('duck', 'pig', 20, 'easy');
  const m = window.soccer.match;
  m.restart = null; m.phase = 'play';
  for (const p of m.sides[1].players) p.teleport(-20, p.z, 0);
  const h = m.sides[0].players[5];
  for (const p of m.sides[0].players) if (p !== h) p.teleport(-15, p.z, 0);
  h.teleport(-8, 0, Math.PI / 2);
  m.ball.place(-7.6, 0);
  m.setHuman(h);
  for (const s of m.sides) s.brain.update = () => {};
});
const sample = (label, n = 14) => page.evaluate(async ([label, n]) => {
  const m = window.soccer.match, h = m.human, out = [];
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 70));
    const fx = h.x + h.fx * 0.3, fz = h.z + h.fz * 0.3;
    out.push((m.ball.owner === h ? '' : '!') + Math.hypot(m.ball.pos.x - fx, m.ball.pos.z - fz).toFixed(2));
  }
  return `${label.padEnd(8)} ${out.join(' ')}   speed ${h.speed.toFixed(1)}`;
}, [label, n]);
await page.keyboard.down('KeyD');
console.log('dribble (distance from the foot; ! = not yours)');
console.log(await sample('jog'));
await page.keyboard.down('ShiftLeft');
console.log(await sample('sprint'));
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyD');
await page.keyboard.down('KeyW');
console.log(await sample('turn up'));
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyA');
console.log(await sample('turn back'));
await page.keyboard.up('KeyA');
console.log(await sample('stop', 8));

// Receiving: a teammate passes to you from 10 m.
const rec = await page.evaluate(async () => {
  const m = window.soccer.match, h = m.human;
  const mate = m.sides[0].players[3];
  // (Autopilot, or you'd switch to the passer the moment they have the ball.)
  m.autopilot = true;
  m.sides[0].level = { ...m.sides[0].level, passError: 0 };
  h.teleport(0, 0, -Math.PI / 2);
  mate.teleport(10, 0.5, -Math.PI / 2);
  m.ball.place(9.6, 0.5);
  m.ball.owner = mate;
  m.orders.set(mate, { kind: 'pass', power: 0.6, aimX: -1, aimZ: 0, target: h, until: m.time + 1 });
  const out = [];
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const fx = h.x + h.fx * 0.3, fz = h.z + h.fz * 0.3;
    const d = Math.hypot(m.ball.pos.x - fx, m.ball.pos.z - fz);
    if (d < 2.5 && out.length < 22) out.push(`${m.ball.owner === h ? 'OWN' : '   '} d=${d.toFixed(2)} v=${m.ball.speed.toFixed(1)} touch=${h.touchT.toFixed(2)}`);
  }
  return out.join('\n');
});
console.log('\nreceiving a 10 m pass:\n' + rec);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
