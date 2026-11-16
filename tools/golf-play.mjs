// Plays holes by itself: each putt is the best one the aiming prediction can find (so it tests that
// every hole can be finished, and how the real ball compares). Frames of the first hole's finish are
// saved (tools/shots/golf/play-*.png). Usage: node tools/golf-play.mjs [from=1] [to=from] [character ids...]
// (e.g. node tools/golf-play.mjs 1 1 wizard-duck youser knight-bear: three players).
import { chromium } from 'playwright';
const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? from);
const ids = process.argv.slice(4);
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
for (let n = from; n <= to; n++) {
  await page.evaluate(([i, ids]) => window.golf.play(i, ...ids), [n - 1, ids]);
  await page.keyboard.press('Space');
  const shots = [];
  for (let k = 0; k < 60; k++) {
    await page.waitForFunction(() => { const h = window.golf.hole; return h.phase === 'aim' && !h.player.golfer.walking || h.phase === 'done'; }, null, { timeout: 60000 });
    const ph = await page.evaluate(() => window.golf.hole.phase);
    if (ph !== 'aim') break;
    if (k > 0 && n === from && ids.length > 1) await page.screenshot({ path: `${out}play-turn-${k}.png` });
    await page.waitForTimeout(300);
    const b = await page.evaluate(() => window.golf.auto());
    shots.push(b ? `${b.power.toFixed(2)}${b.holed ? '*' : ''}` : '?');
    if (n === from && k === 0) for (let i = 0; i < 3; i++) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}play-roll-${i}.png` }); }
    await page.waitForTimeout(400);
  }
  if (n === from) for (let i = 0; i < 4; i++) { await page.waitForTimeout(600); await page.screenshot({ path: `${out}play-end-${i}.png` }); }
  await page.waitForFunction(() => ['done', 'next'].includes(window.golf.hole.phase), null, { timeout: 20000 }).catch(() => {});
  const r = await page.evaluate(() => { const h = window.golf.hole; return `${h.number} ${h.def.name} (par ${h.def.par}): ${h.players.map((p, i) => `${p.name} ${h.strokes[i]}`).join(', ')}`; });
  await page.waitForTimeout(800);
  if (n === to) await page.screenshot({ path: `${out}play-card.png` });
  console.log(`${r}   putts (power, * = predicted to drop): ${shots.join(' ')}`);
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
