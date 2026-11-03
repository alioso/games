// Films short clips around the hero (walking, turning, attacks, a fight) as frame strips,
// so animation can be judged without watching. Writes tools/shots/floorstep/anim-*.png.
// Usage: node tools/floorstep-anim.mjs [class=knight]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const cls = process.argv[2] ?? 'knight';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const tmp = out + 'frames/';
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5174/');
await wait(2000);
await page.evaluate((c) => window.floorstep.start('easy', c, 777), cls);
await wait(3000);
await page.evaluate(() => { const f = window.floorstep.floor; f.debugRevealAll(); f.combat.monsters.forEach((m) => { m.state = 'gone'; }); });

async function film(name, n, every, action) {
  const files = [];
  const start = action?.();
  for (let i = 0; i < n; i++) {
    const [x, y] = await page.evaluate(() => { const h = window.floorstep.floor.hero; return window.floorstep.screenOf(h.x, h.y + 0.7, h.z); });
    const f = `${tmp}${name}-${i}.png`;
    await page.screenshot({ path: f, clip: { x: Math.max(0, x - 110), y: Math.max(0, y - 130), width: 220, height: 220 } });
    files.push(f);
    await wait(every);
  }
  await start;
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]
ims = [Image.open(f) for f in fs]
cols = min(8, len(ims)); rows = (len(ims) + cols - 1) // cols
W, H = ims[0].size
sheet = Image.new('RGB', (W * cols, H * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * W, (i // cols) * H))
sheet.save(sys.argv[1])
`, `${out}anim-${name}.png`, ...files]);
}

const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); for (const k of keys) await page.keyboard.up(k); };
await film('walk', 16, 45, () => hold(['KeyD'], 1400));
await wait(500);
await film('turn', 16, 60, async () => { await hold(['KeyW'], 450); await hold(['KeyA'], 600); });
await wait(600);
await film('combo', 16, 55, async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await wait(300); } });
await wait(600);
await film('heavy', 16, 55, () => page.keyboard.press('KeyK'));
await wait(600);
await film('idle', 8, 400);
// A real fight with Gribbles, filmed around the hero.
await page.evaluate(() => {
  const fs = window.floorstep;
  fs.setLook({});
});
await wait(2500);
await page.evaluate(() => {
  const fs = window.floorstep, f = fs.floor;
  f.debugRevealAll();
  const m = f.combat.boss;
  f.debugTeleport(m.x + 2.2, m.z);
  m.hear(m.x, m.z);
  fs.autoplay(true, 1);
});
await wait(1500);
await film('fight', 24, 70);
await film('fight2', 24, 70);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
