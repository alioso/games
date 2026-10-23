// Runs computer-only matches at full speed and prints pacing stats. Needs `npm run dev`.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:5173/');
await page.waitForTimeout(1500);
for (const d of ['easy', 'normal', 'hard']) {
  const r = await page.evaluate((d) => window.blocstrike.simulate(d, 12), d);
  const avg = (k) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(1);
  const wins = r.reduce((m, x) => ((m[x.winner] = (m[x.winner] ?? 0) + 1), m), {});
  console.log(`${d.padEnd(6)} time ${avg('time')}s  kills ${avg('kills')}  revives ${avg('revives')}  eaten ${avg('eaten')}  ff ${avg('friendlyKills')} robotHits ${avg('enemyRobotHits')} ffRobot ${avg('friendlyRobotHits')}  ${JSON.stringify(wins)}`);
}
await browser.close();
