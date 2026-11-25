// A Maze In: menus and saving — fresh start (only the hedge maze open), finishing mazes opens the next
// and is remembered after a reload, the third ruby leads to heaven, and the title then offers it again.
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
const buttons = () => page.$$eval('.menu-btn', (bs) => bs.map((b) => ({ text: b.textContent, off: b.classList.contains('disabled') })));
const click = async (text) => {
  for (const b of await page.$$('.menu-btn')) if ((await b.textContent()).includes(text)) { await b.click(); return true; }
  console.log(`(no button "${text}")`);
  return false;
};

await page.goto('http://localhost:5177/');
await page.evaluate(() => localStorage.removeItem('amazein-progress-v1'));
await page.reload();
await page.waitForTimeout(1500);
let b = await buttons();
check(b.length === 2 && b[0].text.includes('Play'), `fresh title: ${b.map((x) => x.text).join(' | ')}`);
await click('Play');
await page.waitForTimeout(300);
await click('Guzzard the duck');
await page.waitForTimeout(300);
b = await buttons();
check(b.filter((x) => x.off).length === 2 && !b[0].off, `fresh maze list: ${b.map((x) => `${x.text}${x.off ? ' [locked]' : ''}`).join(' | ')}`);
await page.screenshot({ path: `${out}menus-mazes-fresh.png` });

/** Get out of maze i with the ruby (2:03, two hearts left) and wait for the done screen. */
async function win(i) {
  await page.evaluate((i) => { window.maze.play(i, 'wizard-duck'); }, i);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const l = window.maze.level; l.elapsed = 123.4; l.hearts = 2; l.phase = 'done'; });
  await page.waitForSelector('.menu-btn', { timeout: 8000 });
  await page.waitForTimeout(300);
}
await win(0);
const sub = await page.$eval('.menu-sub', (e) => e.textContent);
check(sub.includes('2:03') && sub.includes('is open now'), `done screen: ${sub}`);
await page.screenshot({ path: `${out}menus-done.png` });

await page.reload();
await page.waitForTimeout(1500);
b = await buttons();
check(b[0].text.includes('1 of 3'), `title after a reload: ${b.map((x) => x.text).join(' | ')}`);
await click('Play');
await page.waitForTimeout(300);
const focused = await page.$eval('.menu-btn.focus', (e) => e.textContent);
check(focused.includes('Guzzard'), `last hero remembered: ${focused}`);
// (Mouse out of the way: a button that appears under the pointer takes the focus.)
await page.mouse.move(2, 2);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
b = await buttons();
check(b.filter((x) => x.off).length === 1 && b[0].text.includes('Best 2:03'), `maze list: ${b.map((x) => `${x.text}${x.off ? ' [locked]' : ''}`).join(' | ')}`);
const f2 = await page.$eval('.menu-btn.focus', (e) => e.textContent);
check(f2.includes('City'), `focus on the next maze: ${f2}`);
await page.screenshot({ path: `${out}menus-mazes.png` });

await win(1);
await win(2);
b = await buttons();
check(b[0].text.includes('Up to heaven'), `after the castle: ${b.map((x) => x.text).join(' | ')}`);
await click('Up to heaven');
await page.waitForTimeout(3000);
check(await page.evaluate(() => !!window.maze.heavenScene), 'heaven is on');
await page.keyboard.press('Space');
await page.waitForFunction(() => window.maze.heavenScene?.menuReady, null, { timeout: 15000 });
await page.waitForTimeout(500);
b = await buttons();
check(b.some((x) => x.text.includes('Stay a while')), `the end menu: ${b.map((x) => x.text).join(' | ')}`);
await click('Stay a while');
await page.waitForTimeout(1500);
check(await page.evaluate(() => !document.querySelector('.menu-btn')), 'staying: menu gone, still eating');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await click('Main menu');
await page.waitForTimeout(800);
b = await buttons();
check(b.some((x) => x.text.includes('Up to heaven')) && b.some((x) => x.text.includes('Start over')), `title after heaven: ${b.map((x) => x.text).join(' | ')}`);
await page.screenshot({ path: `${out}menus-title-after.png` });
const p = await page.evaluate(() => JSON.parse(localStorage.getItem('amazein-progress-v1')));
check(p.done.every(Boolean) && p.heaven, `saved: ${JSON.stringify(p)}`);
await click('Start over');
await page.waitForTimeout(200);
await click('Yes, start over');
await page.waitForTimeout(500);
b = await buttons();
check(b.length === 2, `after starting over: ${b.map((x) => x.text).join(' | ')}`);
console.log(errors.length ? errors.join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
