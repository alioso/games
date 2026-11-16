// The cup, quickly: starts one, plays each of your ties for a moment, then forces a draw at full time
// (so it goes to penalties, the computer taking your kicks), and follows the menus to the end.
// Saves the bracket screens (tools/shots/soccer/cup-*.png). Usage: node tools/soccer-cup.mjs
import { chromium } from 'playwright';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
const click = async (label) => {
  const b = page.locator('button', { hasText: label }).first();
  await b.waitFor({ timeout: 60000 });
  await b.click();
};
await page.evaluate(() => window.soccer.startCup('duck', 5, 'medium'));
for (let round = 0; round < 3; round++) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}cup-${round}-draw.png` });
  await click('Play!');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.soccer.match.autopilot = true; });
  await page.waitForFunction(() => window.soccer.match?.phase === 'play', null, { timeout: 30000 });
  // Skip to the last seconds of a draw, the computer playing for you.
  await page.evaluate(() => {
    const m = window.soccer.match;
    m.autopilot = true;
    m.half = 2;
    m.clock = m.halfLength - 0.5;
    m.sides[0].score = m.sides[1].score = 1;
  });
  await page.waitForFunction(() => window.soccer.match.shootout, null, { timeout: 20000 });
  await page.evaluate(() => window.soccer.speed(3));
  if (round === 0) { await page.waitForTimeout(5000); await page.screenshot({ path: `${out}cup-pens.png` }); }
  await page.waitForFunction(() => window.soccer.match.phase === 'fulltime', null, { timeout: 180000 });
  await page.evaluate(() => window.soccer.speed(1));
  await page.waitForSelector('.menu h1, .menu .title', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4500);
  const title = await page.evaluate(() => document.querySelector('.menu')?.innerText.split('\n')[0] ?? '?');
  await page.screenshot({ path: `${out}cup-${round}-result.png` });
  console.log(`round ${round}: ${title}`);
  if (/THROUGH/.test(title)) { await click('Next round'); continue; }
  break;
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
