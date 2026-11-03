// Opens Controls from the title, rebinds "Attack" on the keyboard to H, checks it stuck, and screenshots.
import { chromium } from 'playwright';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, ms = 250) => { await page.keyboard.press(k); await wait(ms); };
await page.goto('http://localhost:5174/');
await wait(1500);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2000);
await key('ArrowDown');          // Controls
await key('Enter', 500);
await page.screenshot({ path: out + 'controls.png' });
await key('ArrowDown');          // Attack row
await key('ArrowLeft');          // keyboard column
await key('Enter');              // listen
await key('KeyH', 400);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('floorstep.controls') ?? '{}').keys?.light);
await page.screenshot({ path: out + 'controls-rebound.png' });
console.log({ attackKeys: saved });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
