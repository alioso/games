// A Maze In: pictures of a themed maze — the way in, inside, every trap kind (timed ones caught going
// off), the ruby's chamber, a keeper, and the fight arena.
// Usage: node tools/maze-themes.mjs 1   (maze index; pictures in tools/shots/maze/theme<i>-*.png)
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const i = +(process.argv[2] ?? 1);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
await page.evaluate((i) => window.maze.play(i, 'knight-dog'), i);
await page.waitForTimeout(2500);
// (The monster goes away for the pictures.)
await page.evaluate(() => { window.maze.level.monster.vanish(window.maze.level.hero); });
const shot = (n) => page.screenshot({ path: `${out}theme${i}-${n}.png` });
await shot('start');
// Walk in a little.
await page.evaluate(() => { const l = window.maze.level; l.hero.set(l.world.start.x, 0, l.world.depth - 3); });
await page.waitForTimeout(1500);
await shot('inside');
const kinds = await page.evaluate(() => [...new Set(window.maze.level.world.traps.map((t) => t.trap.kind))]);
for (const kind of kinds) {
  await page.evaluate((kind) => {
    const l = window.maze.level, t = l.world.traps.find((t) => t.trap.kind === kind);
    // Stand in the open tile beside it (camera side first), looking at it.
    const [tx, ty] = t.trap.tile;
    const sides = [[0, 1], [1, 0], [-1, 0], [0, -1]].filter(([dx, dy]) => !l.world.isWallTile(tx + dx, ty + dy));
    const [dx, dy] = sides[0] ?? [0, 1];
    const step = tx % 2 && ty % 2 ? 2.0 : 1.6;
    l.hero.set(t.x + dx * step, 0, t.z + dy * step);
    l.safe = 999;
  }, kind);
  await page.waitForTimeout(1200);
  if (kind === 'spikes' || kind === 'fire' || kind === 'flowerpot') {
    // Catch it going off.
    for (let k = 0; k < 40; k++) {
      const on = await page.evaluate((kind) => { const t = window.maze.level.world.traps.find((t) => t.trap.kind === kind); return kind === 'flowerpot' ? t.phase === 'fall' || t.phase === 'shadow' && t.t > 0.6 : t.danger; }, kind);
      if (on) break;
      await page.waitForTimeout(100);
    }
  }
  await shot(`trap-${kind}`);
}
await page.evaluate(() => { const l = window.maze.level, r = l.world.rubyPos; l.hero.set(r.x, 0, r.z + 2.2); });
await page.waitForTimeout(1200);
await shot('chamber');
await page.evaluate(() => { const l = window.maze.level, k = l.keepers[0], p = k.root.position; const opts = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].filter(([dx, dz]) => !l.world.solidAt(p.x + dx, p.z + dz)); l.hero.set(p.x + opts[0][0], 0, p.z + opts[0][1]); });
await page.waitForTimeout(1200);
await shot('keeper');
await page.evaluate(() => window.maze.level.startFight(true));
await page.waitForTimeout(2500);
await shot('fight');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
