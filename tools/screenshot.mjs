// Drives the game in a headless browser and saves screenshots to tools/shots/.
// Usage: npm run dev (in another terminal), then: npm run shot [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const wait = (ms) => page.waitForTimeout(ms);
await page.goto(url);
await wait(3000);
await page.screenshot({ path: out + '1-menu.png' });

await page.evaluate(() => window.blocstrike.startGame());
await wait(1500);
await page.screenshot({ path: out + '2-countdown.png' });
await wait(2500);
// Walk right and throw.
await page.keyboard.down('KeyD');
await wait(700);
await page.keyboard.press('Space');
await wait(250);
await page.keyboard.up('KeyD');
await page.screenshot({ path: out + '3-throw.png' });
await wait(6000);
await page.screenshot({ path: out + '4-battle.png' });
const state = await page.evaluate(() => {
  const m = window.blocstrike.match;
  return { phase: m.phase, time: m.time.toFixed(1), status: m.status().map((s) => ({ team: s.team.name, blocs: s.blocs.map((b) => b.state).join(','), bunny: s.bunnyHp })) };
});
console.log(JSON.stringify(state, null, 1));
await wait(12000);
await page.screenshot({ path: out + '5-later.png' });
const state2 = await page.evaluate(() => {
  const m = window.blocstrike.match;
  return { phase: m.phase, time: m.time.toFixed(1), status: m.status().map((s) => ({ team: s.team.name, blocs: s.blocs.map((b) => b.state).join(','), bunny: s.bunnyHp })) };
});
console.log(JSON.stringify(state2, null, 1));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
