// Films a fight scene: the robot walks up to a monster, the fight starts, frames are tiled into
// tools/shots/floorstep/duel-<name>.png. Usage: node tools/floorstep-duel.mjs [class] [names] [difficulty]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const cls = process.argv[2] ?? 'knight';
const NAMES = ['Gribbles', 'Claught', 'Zegron', 'Sieger', 'Slashner'];
const names = process.argv[3]?.split(',') ?? ['Gribbles'];
const diff = process.argv[4] ?? 'hard';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const tmp = out + 'frames/';
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);
for (const name of names) {
  const k = NAMES.indexOf(name);
  const n = { easy: 1, medium: 2, hard: 3 }[diff];
  await page.evaluate(({ cls, floor, name, diff }) => {
    const fs = window.floorstep;
    fs.start(diff, cls, 70 + floor);
    fs.run.floor = floor;
    fs.run.monsters[name] = undefined;
    fs.setLook({});
  }, { cls, floor: k * n + n, name, diff });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const fs = window.floorstep, f = fs.floor;
    f.debugRevealAll();
    const m = f.combat.boss;
    f.debugTeleport(m.x + 2.5, m.z);
    fs.autoplay(true, 1);
  });
  const files = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    const file = `${tmp}duel-${name}-${i}.png`;
    await page.screenshot({ path: file });
    files.push(file);
  }
  const state = await page.evaluate(() => { const d = window.floorstep.floor.duel; return d ? { phase: d.phase, m: d.m.state, hp: window.floorstep.run.hp } : { none: true, phase: window.floorstep.floor.phase }; });
  console.log(name, JSON.stringify(state));
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]
ims = [Image.open(f).resize((480, 270)) for f in fs]
cols = 4; rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (480 * cols, 270 * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * 480, (i // cols) * 270))
sheet.save(sys.argv[1])
`, `${out}duel-${name}.png`, ...files]);
}
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no page errors');
await browser.close();
