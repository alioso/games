// Runs computer-only rounds at full speed and prints pacing/balance stats. Needs `npm run dev`.
// node tools/simulate.mjs arenas [runs]        → every arena, everyone on random weapons
// node tools/simulate.mjs weapons [runs] [arena] [only] → every weapon against every weapon (whole teams);
//   `only` limits it to matchups involving that weapon
import { chromium } from 'playwright';
const [mode = 'arenas', runsArg = '8', arenaArg = 'grassy-pond', only] = process.argv.slice(2);
const runs = Number(runsArg);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
const report = (label, r) => {
  const avg = (k) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(1);
  const wins = r.reduce((m, x) => ((m[x.winner] = (m[x.winner] ?? 0) + 1), m), {});
  const stuck = r.filter((x) => x.time >= 299).length;
  console.log(`${label.padEnd(27)} ${avg('time').padStart(5)}s  kills ${avg('kills')}  revives ${avg('revives')}  eaten ${avg('eaten')}  ff ${avg('friendlyKills')}  B:${wins.Blue ?? 0} R:${wins.Red ?? 0} draw:${wins.draw ?? 0}${stuck ? `  STUCK:${stuck}` : ''}`);
};
if (mode === 'arenas') {
  for (const id of ['grassy-pond', 'volcano', 'jungle', 'beach', 'ruins', 'clouds']) {
    report(id, await page.evaluate(([n, id]) => window.blocstrike.simulate('normal', n, undefined, id), [runs, id]));
  }
} else {
  const W = ['spear', 'sword', 'lightsaber', 'hammer', 'crossbow', 'bazooka', 'grenade', 'flamethrower', 'machinegun'];
  for (const a of W) for (const b of W) {
    if (only && a !== only && b !== only) continue;
    report(`${a} v ${b}`, await page.evaluate(([n, a, b, id]) => window.blocstrike.simulate('normal', n, [a, b], id), [runs, a, b, arenaArg]));
  }
}
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no errors');
await browser.close();
