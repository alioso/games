// Putts on a hole, run straight through the real physics and through the aiming line's quick
// prediction: where each stops (and whether it drops), how far apart the two are, and what the ball
// hit. Usage: node tools/golf-physics.mjs [hole=1] [putts=30]
import { chromium } from 'playwright';
const holeNo = Number(process.argv[2] ?? 1), n = Number(process.argv[3] ?? 30);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
await page.evaluate((i) => window.golf.play(i), holeNo - 1);
await page.waitForTimeout(500);
const res = await page.evaluate((n) => {
  const h = window.golf.hole;
  const [tx, tz] = h.def.tee, [cx, cz] = h.def.cup;
  const toCup = Math.atan2(cx - tx, -(cz - tz));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const aim = toCup + (Math.random() - 0.5) * 0.9, power = 0.15 + Math.random() * 0.85;
    const r = window.golf.test(tx, tz, aim, power);
    const d = Math.hypot(r.pred.end[0] - r.real.end[0], r.pred.end[1] - r.real.end[1]);
    rows.push({ aim: +aim.toFixed(2), power: +power.toFixed(2), real: r.real.end.map((v) => +v.toFixed(2)).join(','), holed: r.real.holed, predHoled: r.pred.holed, apart: +d.toFixed(2), walls: r.events.filter((e) => e === 'wall').length });
  }
  return rows;
}, n);
console.table(res);
const apart = res.map((r) => r.apart).sort((a, b) => a - b);
console.log(`prediction vs physics: median ${apart[Math.floor(apart.length / 2)]} m apart, worst ${apart.at(-1)} m; holed ${res.filter((r) => r.holed).length}/${n}`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
