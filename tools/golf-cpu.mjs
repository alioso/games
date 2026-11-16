// BB Golf: computer players play holes by themselves (checks they finish, and how long they take).
// Usage: node tools/golf-cpu.mjs [from=1] [to=from] [players...] (e.g. wizard-duck:good youser:easy)
import { chromium } from 'playwright';
const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? from);
const ids = process.argv.slice(4).length ? process.argv.slice(4) : ['wizard-duck:good', 'youser:easy'];
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
for (let n = from; n <= to; n++) {
  const t0 = Date.now();
  await page.evaluate(([i, ids]) => window.golf.play(i, ...ids), [n - 1, ids]);
  if (n === from) { await page.waitForTimeout(6000); await page.screenshot({ path: `${out}cpu-aim.png` }); }
  await page.waitForFunction(() => window.golf.hole.phase === 'done', null, { timeout: 240000, polling: 500 });
  const r = await page.evaluate(() => { const h = window.golf.hole; return `${h.number} ${h.def.name} (par ${h.def.par}): ${h.players.map((p, i) => `${p.name} ${h.strokes[i]}`).join(', ')}`; });
  console.log(`${r}   ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
