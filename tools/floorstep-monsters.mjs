// Films each monster at its third (strongest) appearance fighting the robot, as a strip of
// close-ups around the monster: tools/shots/floorstep/monster-<name>.png
// Usage: node tools/floorstep-monsters.mjs [class=knight] [names=Gribbles,...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const cls = process.argv[2] ?? 'knight';
const NAMES = ['Gribbles', 'Claught', 'Zegron', 'Sieger', 'Slashner'];
const names = process.argv[3]?.split(',') ?? NAMES;
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const tmp = out + 'frames/';
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);
for (const name of names) {
  const k = NAMES.indexOf(name);
  await page.evaluate(({ cls, floor, name }) => {
    const fs = window.floorstep;
    fs.start('hard', cls, 50 + floor);
    fs.run.floor = floor;
    fs.run.monsters[name] = { hp: 100, injuries: ['ear', 'bandage'] };
    fs.setLook({});
  }, { cls, floor: k * 3 + 3, name });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const fs = window.floorstep, f = fs.floor;
    f.debugRevealAll();
    const m = f.combat.boss;
    m.hp = 100;
    f.debugTeleport(m.x + 4, m.z);
    m.hear(m.x, m.z);
    fs.autoplay(true, 1);
  });
  const files = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(450);
    const at = await page.evaluate(() => { const f = window.floorstep.floor, m = f.combat.boss, h = f.hero; return window.floorstep.screenOf((m.x + h.x) / 2, 0.8, (m.z + h.z) / 2); });
    const file = `${tmp}${name}-${i}.png`;
    await page.screenshot({ path: file, clip: { x: Math.max(0, Math.min(1600 - 360, at[0] - 180)), y: Math.max(0, Math.min(900 - 300, at[1] - 150)), width: 360, height: 300 } });
    files.push(file);
  }
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]
ims = [Image.open(f) for f in fs]
cols = 6; rows = (len(ims) + cols - 1) // cols
W, H = ims[0].size
sheet = Image.new('RGB', (W * cols, H * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * W, (i // cols) * H))
sheet.save(sys.argv[1])
`, `${out}monster-${name}.png`, ...files]);
}
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no page errors');
await browser.close();
