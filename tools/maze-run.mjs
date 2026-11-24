// A Maze In: a test player who knows the way walks straight to the ruby at full speed (never creeping)
// (round the traps) and the monster does what it does. Reports when it noticed and whether it caught you.
// Usage: node tools/maze-run.mjs [tries=2] [maze index=0]
import { chromium } from 'playwright';
const tries = Number(process.argv[2] ?? 2), idx = Number(process.argv[3] ?? 0);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1200);
for (let n = 0; n < tries; n++) {
  await page.evaluate((i) => window.maze.play(i, 'thief-bird'), idx);
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async () => {
    const l = window.maze.level, L = l.layout, tw = L.tw, th = L.th;
    const mid = (i) => Math.floor(i / 2) * 3.1 + (i % 2 ? 0.8 : 0) + (i % 2 ? 1.15 : 0.4);
    // The way in (through open gates only: keepers count as shut; round thorns and wasps).
    const avoid = new Set(L.traps.filter((t) => t.kind !== 'mud').map((t) => t.tile[1] * tw + t.tile[0]));
    const from = L.entrance.gap[1] * tw + L.entrance.gap[0], to = (L.ruby[1] * 2 + 1) * tw + L.ruby[0] * 2 + 1;
    const prev = new Int32Array(tw * th).fill(-2); prev[from] = -1; const q = [from];
    for (let h = 0; h < q.length; h++) { const k = q[h], x = k % tw, y = (k - x) / tw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, m = ny * tw + nx;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th || prev[m] !== -2 || L.wall[m] || l.world.blockers.has(m) || avoid.has(m)) continue; prev[m] = k; q.push(m); } }
    const way = []; for (let k = to; k !== -1; k = prev[k]) way.unshift([mid(k % tw), mid(Math.floor(k / tw))]);
    const events = []; let last = '', t0 = performance.now();
    for (const [x, z] of way) {
      l.autoTarget = l.hero.clone().set(x, 0, z);
      for (let i = 0; i < 200 && l.autoTarget && l.phase === 'explore'; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (l.monster.state !== last) { events.push(`${((performance.now() - t0) / 1000).toFixed(0)}s ${l.monster.state}`); last = l.monster.state; }
      }
      if (l.phase !== 'explore') break;
    }
    return `reached ruby: ${l.hasRuby}, hearts ${l.hearts}, monster: ${events.join(' → ')}`;
  });
  console.log(`try ${n + 1}: ${res}`);
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
