// Penalty shootouts, the computer taking every kick on both sides: prints each kick and the winner,
// and saves frames of the first few kicks (tools/shots/soccer/shootout-*.png).
// Usage: node tools/soccer-shootout.mjs [shootouts=3] [level=medium]
import { chromium } from 'playwright';
const runs = Number(process.argv[2] ?? 3), level = process.argv[3] ?? 'medium';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
let total = 0, scored = 0;
for (let r = 0; r < runs; r++) {
  await page.evaluate(([level, r]) => { window.soccer.shootout('cat', 'bear', level); window.soccer.auto(true); window.soccer.speed(r === 0 ? 1 : 3); }, [level, r]);
  if (r === 0) for (let i = 0; i < 6; i++) { await page.waitForTimeout(1300); await page.screenshot({ path: `${out}shootout-${i}.png` }); }
  await page.waitForFunction(() => window.soccer.match.phase === 'fulltime', null, { timeout: 180000 });
  const res = await page.evaluate(() => {
    const m = window.soccer.match, so = m.shootout;
    const row = (k) => k.map((x) => (x ? 'o' : 'x')).join('');
    return { a: row(so.kicks[0]), b: row(so.kicks[1]), winner: m.sides[m.winner()].team.short, n: so.kicks[0].length + so.kicks[1].length, in: so.kicks.flat().filter(Boolean).length };
  });
  total += res.n; scored += res.in;
  console.log(`CAT ${res.a.padEnd(7)}  BEAR ${res.b.padEnd(7)}  → ${res.winner} win`);
}
console.log(`kicks scored ${scored}/${total} (${Math.round((100 * scored) / total)}%)`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
