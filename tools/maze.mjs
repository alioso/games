// A Maze In smoke test: starts the hedge maze, takes pictures (the start, walking in, the big map),
// then jumps next to the ruby to film the ruby moment, then to the way out.
// Usage: node tools/maze.mjs [maze index] [character id]   (pictures in tools/shots/maze/)
import { chromium } from 'playwright';
const idx = Number(process.argv[2] ?? 0), id = process.argv[3] ?? 'wizard-duck';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}title.png` });
await page.evaluate(([i, id]) => window.maze.play(i, id), [idx, id]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}start.png` });
// Walk in a few metres.
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1600);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}walk.png` });
await page.keyboard.press('KeyM');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}bigmap.png` });
await page.keyboard.press('KeyM');
// Next to the ruby.
await page.evaluate(() => { const l = window.maze.level, r = l.world.rubyPos; l.hero.set(r.x, 0, r.z + 2.2); });
await page.waitForTimeout(800);
await page.evaluate(() => { const l = window.maze.level, r = l.world.rubyPos; l.autoTarget = r.clone(); });
for (const [i, ms] of [[0, 900], [1, 900], [2, 700], [3, 900], [4, 1200]]) { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}ruby-${i}.png` }); }
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}after-ruby.png` });
// The maze shifts: then the map (which has forgotten the parts that changed).
await page.waitForFunction(() => window.maze.level.phase === 'explore', null, { timeout: 15000 });
await page.keyboard.press('KeyM');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}shift-map.png` });
await page.keyboard.press('KeyM');
console.log('shift:', JSON.stringify(await page.evaluate(() => window.maze.shiftOf(0))));
// To the way out.
await page.evaluate(() => { const l = window.maze.level; l.hero.copy(l.world.start).setZ(l.world.depth - 1); l.autoTarget = l.world.start.clone(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}out.png` });
console.log(await page.evaluate(() => `phase ${window.maze.level?.phase}`));
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}done.png` });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
