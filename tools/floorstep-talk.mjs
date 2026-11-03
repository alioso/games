// Talks to every resident on a floor with the keyboard: answers the quiz right, then asks about the
// key and the monster, and prints what they said. Screenshots: tools/shots/floorstep/talk-*.png
import { chromium } from 'playwright';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5174/');
await wait(2000);
await page.evaluate(() => { const fs = window.floorstep; fs.start('medium', 'knight', 9090); });
await wait(2500);
const n = await page.evaluate(() => { const f = window.floorstep.floor; f.debugRevealAll(); f.combat.monsters.forEach((m) => m.vanish()); f.ctx.run.pocket.push('tooth', 'spoon', 'sock'); return f.residents.list.length; });
const text = () => page.evaluate(() => [document.querySelector('.dialog-text')?.textContent ?? '', [...document.querySelectorAll('.dialog-opt')].map((b) => b.textContent)]);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => { const f = window.floorstep.floor, r = f.residents.list[i]; const yaw = r.body.root.rotation.y; f.debugTeleport(r.x + Math.sin(yaw) * 0.9, r.z + Math.cos(yaw) * 0.9); }, i);
  await wait(400);
  if (process.env.DEBUG) console.log(await page.evaluate(() => { const f = window.floorstep.floor; return { phase: f.phase, prompt: document.querySelector('.prompt')?.textContent, near: f.residents.near(f.hero.x, f.hero.z)?.def.id }; }));
  await page.keyboard.press('KeyE');
  await wait(2500);
  let [line, opts] = await text();
  const name = await page.evaluate(() => document.querySelector('.dialog-name')?.textContent);
  console.log(`\n== ${name}\n  "${line}"\n  options: ${opts.join(' | ')}`);
  await page.screenshot({ path: `${out}talk-${i}.png` });
  // Answer the quiz right (or hand over the present if there is one), question by question.
  for (let q = 0; q < 6; q++) {
    const pickIndex = await page.evaluate((i) => {
      const f = window.floorstep.floor, def = f.residents.list[i].def;
      const text = document.querySelector('.dialog-text')?.textContent ?? '';
      const labels = [...document.querySelectorAll('.dialog-opt')].map((b) => b.textContent);
      const gift = labels.findIndex((l) => l.startsWith('Here:'));
      if (gift >= 0) return gift;
      const row = def.quiz.find(([ask]) => text.includes(ask));
      return row ? labels.indexOf(row[1]) : -1;
    }, i);
    if (pickIndex < 0) break;
    for (let k = 0; k < pickIndex; k++) { await page.keyboard.press('ArrowDown'); await wait(80); }
    console.log('  picking:', await page.evaluate(() => document.querySelector('.dialog-opt.focus')?.textContent));
    await page.keyboard.press('Enter');
    await wait(2500);
    [line, opts] = await text();
    console.log(`  → "${line}"`);
  }
  console.log(`  options: ${opts.join(' | ')}`);
  // Ask about the key, then the monster.
  for (const q of ['key', 'monster']) {
    const idx = opts.findIndex((o) => o.toLowerCase().includes(q === 'key' ? 'key' : 'monster'));
    if (idx < 0) continue;
    for (let k = 0; k < idx; k++) { await page.keyboard.press('ArrowDown'); await wait(80); }
    await page.keyboard.press('Enter');
    await wait(3000);
    [line, opts] = await text();
    console.log(`  ${q}: "${line}"`);
  }
  // Say goodbye.
  const bye = opts.findIndex((o) => o.includes('Bye'));
  for (let k = 0; k < bye; k++) { await page.keyboard.press('ArrowDown'); await wait(80); }
  await page.keyboard.press('Enter');
  await wait(600);
  const state = await page.evaluate(() => window.floorstep.floor.phase);
  if (state === 'talk') { await page.evaluate(() => window.floorstep.floor.endTalk()); }
}
const key = await page.evaluate(() => { const f = window.floorstep.floor, k = f.keyPiece; return `${k.p.kind} in the ${f.plan.rooms[k.p.room].type}`; });
console.log('\n(the key really is:', key + ')');
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no page errors');
await browser.close();
