// Stages specific moments (pond, double hit, revive) and screenshots them. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5173/');
await wait(1500);
await page.evaluate(() => window.blocstrike.startGame());
await wait(4200);

// 1. Double hit: freeze two red blocs in a row in front of P1 and throw.
await page.evaluate(() => {
  const m = window.blocstrike.match;
  const p1 = m.human(0);
  const reds = m.blocs.filter((b) => b.team.id === 1 && !b.isBunny);
  for (const b of m.blocs) if (b !== p1) m.brains.delete(b); // everyone stands still
  p1.x = -10; p1.z = -4; p1.aimX = 1; p1.aimZ = 0;
  reds[0].x = -6; reds[0].z = -4;
  reds[1].x = -3.5; reds[1].z = -4;
});
await page.keyboard.press('Space');
await wait(450);
await page.screenshot({ path: out + 'm1-double.png' });
const dbl = await page.evaluate(() => window.blocstrike.match.blocs.filter((b) => b.team.id === 1 && !b.isBunny).map((b) => b.state));
console.log('after double throw, reds:', dbl.join(','));

// 2. Walk P1 into the pond.
await wait(1200);
await page.evaluate(() => { const p1 = window.blocstrike.match.human(0); p1.x = -6.5; p1.z = -0.5; });
await page.keyboard.down('KeyD');
await wait(900);
await page.keyboard.up('KeyD');
await wait(300);
await page.screenshot({ path: out + 'm2-piranhas.png' });
console.log('P1 after pond:', await page.evaluate(() => window.blocstrike.match.human(0).state));
await wait(1500);
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
