// Curl check: flies curled passes, crosses and shots with the real ball physics and reports how
// much each bends (furthest from the straight line) and how far from the target it ends up.
// Usage: node tools/soccer-curl.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1200);
console.log(await page.evaluate(async () => {
  window.soccer.start('duck', 'pig', 20, 'easy');
  const V = window.soccer.match.ball.pos.constructor;
  const K = await import('/src/game/kicks.ts');
  const { flight } = await import('/src/game/ball.ts');
  const rows = [];
  const fly = (name, from, vel, curl, tx, tz, ground, lands = false) => {
    const c = K.curled(from, vel, curl, tx, tz, lands);
    const p = from.clone(), v = c.vel.clone(), s = c.spin.clone();
    const d = Math.hypot(tx - from.x, tz - from.z), ux = (tx - from.x) / d, uz = (tz - from.z) / d;
    let bend = 0, miss = 99;
    for (let t = 0; t < 4; t += 1 / 240) {
      flight(p, v, s, 1 / 240);
      const side = (p.x - from.x) * -uz + (p.z - from.z) * ux;
      if (Math.abs(side) > Math.abs(bend)) bend = side;
      if (!ground || p.y < 0.3) miss = Math.min(miss, Math.hypot(p.x - tx, p.z - tz));
    }
    rows.push(`${name.padEnd(22)} bend ${bend.toFixed(2)} m   ends ${miss.toFixed(2)} m from target`);
  };
  const o = new V(0, 0.13, 0);
  for (const [d, curl] of [[8, 0.2], [15, 0.4], [22, 0.45]]) {
    const sp = K.rollSpeed(d, 6);
    fly(`ground pass ${d} m c=${curl}`, o, K.groundKick(0, 0, d, 0, sp), curl, d, 0, true);
  }
  for (const [d, curl] of [[18, 0.6], [25, -0.8]]) fly(`lofted ${d} m c=${curl}`, o, K.loftCapped(o, d, 0, K.loftTime(d), 17), curl, d, 0, true, true);
  for (const [pw, curl] of [[0.4, 0.65], [0.95, 0.15]]) {
    const sp = 10 + pw * 9;
    fly(`shot 14 m p=${pw} c=${curl}`, o, K.shot(o, 14, 0.8, 1.7, sp).vel, curl, 14, 1.7, false);
  }
  return rows.join('\n');
}));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
