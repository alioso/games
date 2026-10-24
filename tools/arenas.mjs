// Starts a round in every arena and screenshots it to tools/shots/arena-<id>.png. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['grassy-pond', 'volcano', 'jungle', 'beach']) {
  await page.evaluate((id) => {
    const s = window.blocstrike.settings;
    s.ownedArenas = ['grassy-pond', 'volcano', 'jungle', 'beach'];
    s.arena = id;
    s.players = 1;
    window.blocstrike.startGame();
  }, id);
  await page.waitForTimeout(6500);
  await page.screenshot({ path: `${out}arena-${id}.png` });
  console.log(id, await page.evaluate(() => { const m = window.blocstrike.match; return `t=${m.time.toFixed(1)} ` + m.status().map((s) => `${s.team.name}:${s.blocs.map((b) => b.state[0]).join('')} bun${s.bunnyHp}`).join(' '); }));
}
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no errors');
await browser.close();
