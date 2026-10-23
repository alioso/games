// Runs computer-only rounds at full speed and prints pacing/balance stats. Needs `npm run dev`.
// node tools/simulate.mjs            → every weapon against every weapon (normal)
// node tools/simulate.mjs hard 20    → difficulty and runs per matchup
import { chromium } from 'playwright';
const [difficulty = 'normal', runsArg = '8'] = process.argv.slice(2);
const runs = Number(runsArg);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
const W = ['spear', 'bazooka', 'grenade', 'flamethrower'];
console.log(`${difficulty}, ${runs} rounds per matchup (Blue weapon v Red weapon)`);
for (const a of W) {
  for (const b of W) {
    const r = await page.evaluate(([d, n, a, b]) => window.blocstrike.simulate(d, n, [a, b]), [difficulty, runs, a, b]);
    const avg = (k) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(1);
    const wins = r.reduce((m, x) => ((m[x.winner] = (m[x.winner] ?? 0) + 1), m), {});
    console.log(`${(a + ' v ' + b).padEnd(27)} ${avg('time').padStart(5)}s  kills ${avg('kills')}  revives ${avg('revives')}  eaten ${avg('eaten')}  ff ${avg('friendlyKills')}  B:${wins.Blue ?? 0} R:${wins.Red ?? 0} draw:${wins.draw ?? 0}`);
  }
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
