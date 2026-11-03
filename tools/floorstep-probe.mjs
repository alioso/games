// Runs one expression in the Floor Step page and prints the result (for poking at the game).
// Usage: node tools/floorstep-probe.mjs "<js expression>" [screenshot delay ms]
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);
console.log(JSON.stringify(await page.evaluate(process.argv[2]), null, 1));
// Optional second argument: wait that many ms, then screenshot to tools/shots/floorstep/probe.png.
if (process.argv[3]) {
  await page.waitForTimeout(Number(process.argv[3]));
  await page.screenshot({ path: new URL('./shots/floorstep/probe.png', import.meta.url).pathname });
}
await browser.close();
