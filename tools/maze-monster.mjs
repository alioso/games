// A Maze In: the monster. A close look at it; then in a clearing: creeping past behind it (it shouldn't
// notice), walking past behind it (it hears you), standing in front of it (it sees you, rolls its ring,
// chases), and getting caught. Usage: node tools/maze-monster.mjs   (pictures: tools/shots/maze/monster-*.png)
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
await page.evaluate(() => window.maze.play(0, 'wizard-cat'));
await page.waitForTimeout(3500);
const log = (s) => console.log(s);
const st = () => page.evaluate(() => { const l = window.maze.level; return `monster ${l.monster.state}, hearts ${l.hearts}`; });
// Set the scene in the first clearing: the monster in the middle facing +x, the hero `dx, dz` from it.
const setup = (dx, dz, yaw) => page.evaluate(([dx, dz, yaw]) => {
  const l = window.maze.level, m = l.monster, [cx, cy] = l.layout.clearings[0];
  const mid = (i) => Math.floor(i / 2) * 3.1 + (i % 2 ? 0.8 : 0);
  const x = mid(cx * 2 + 1) + 2.7, z = mid(cy * 2 + 1) + 2.7;
  m.state = 'search'; m.stateT = 6.9; m.path = [];
  m.pos.set(x, 0, z); m.yaw = yaw;
  l.autoTarget = null;
  l.hero.set(x + dx, 0, z + dz);
}, [dx, dz, yaw]);
// Close look: monster calm, hero in front of it, a little camera override via the hero's position.
await setup(0, 2.6, Math.PI);
await page.evaluate(() => { const m = window.maze.level.monster; m.state = 'gone'; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}monster-look.png`, clip: { x: 300, y: 120, width: 400, height: 380 } });
// Creep past behind it (it faces +x; we go along -x side, 3.5 m away).
await setup(-3.2, -2, Math.PI / 2);
await page.evaluate(() => { const l = window.maze.level; l.monster.state = 'wander'; l.autoTarget = l.hero.clone().setZ(l.hero.z + 4); });
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(3200);
await page.keyboard.up('ShiftLeft');
log(`creeping past behind it: ${await st()}`);
// Walk past behind it.
await setup(-3.2, -2, Math.PI / 2);
await page.evaluate(() => { const l = window.maze.level; l.monster.state = 'wander'; l.autoTarget = l.hero.clone().setZ(l.hero.z + 4); });
await page.waitForTimeout(1500);
log(`walking past behind it: ${await st()}`);
// In front of it, standing still.
await setup(4, 0.3, Math.PI / 2);
await page.evaluate(() => { window.maze.level.monster.state = 'wander'; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}monster-alert.png` });
log(`standing in front of it: ${await st()}`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}monster-chase.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}monster-caught.png` });
log(`after waiting: ${await st()}`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
