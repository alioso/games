// Renders close-up pictures of the bunny and some bloc/hat combos to tools/shots/. Needs `npm run dev`.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
const pics = await page.evaluate(() => {
  const { BunnyView, BlocView, Thumbnailer, TEAMS } = window.blocstrike.debug;
  const t = new Thumbnailer(512);
  const out = {};
  out.bunny = t.render('bunny', () => { const v = new BunnyView(TEAMS[0]); v.setHearts(3, 3); return v.root; }, { yaw: -0.6, pitch: 0.3 });
  out.bunnyRed = t.render('bunny2', () => new BunnyView(TEAMS[1]).root, { yaw: 0.5, pitch: 0.5 });
  const combos = [['gold', 'crown'], ['rainbow', 'party'], ['silver', 'viking'], ['bronze', 'sombrero'], ['noob', null], ['pro', 'tophat'], ['beginner', 'chef'], ['beginner', 'cowboy']];
  for (const [skin, hat] of combos) out[`${skin}-${hat}`] = t.render(`${skin}-${hat}`, () => new BlocView(TEAMS[0], null, { skin, hat }, 'spear').pose(), { yaw: -0.4 });
  return out;
});
for (const [k, url] of Object.entries(pics)) writeFileSync(`${out}c-${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(pics).length, 'close-ups');
await browser.close();
