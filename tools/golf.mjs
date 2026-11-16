// BB Golf smoke test: starts hole 1, takes pictures of the flyover, the aim view, a putt rolling,
// and the overview; prints what happened. Usage: node tools/golf.mjs
import { chromium } from 'playwright';
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}title.png` });
await page.evaluate(() => window.golf.play(0, 'wizard'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}flyover.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}aim.png` });
// Hold for a medium putt.
await page.keyboard.down('Space');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}charge.png` });
await page.keyboard.up('Space');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}swing.png` });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}roll.png` });
await page.waitForFunction(() => window.golf.hole.phase === 'aim' && !window.golf.hole.physics.moving, null, { timeout: 30000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => { const h = window.golf.hole; const p = h.physics.pos; return `after putt 1: ball at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}; strokes ${h.strokes[0]}; phase ${h.phase}`; }));
await page.screenshot({ path: `${out}aim2.png` });
await page.keyboard.press('KeyV');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}overview.png` });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
