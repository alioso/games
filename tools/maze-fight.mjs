// A Maze In: fights. A test player who fights like a decent kid (blocks swipes, ducks high rings, jumps
// low rings and orbs, steps out of the slam's shadow, hits when close, uses magic once the wand's awake)
// takes on the monster a few times with the stick and a few times with the wand. Pictures of the first.
// Usage: node tools/maze-fight.mjs [fights each=3]
import { chromium } from 'playwright';
const n = Number(process.argv[2] ?? 3);
const out = new URL('./shots/maze/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
let shot = 0;
for (const powered of [false, true]) {
  for (let k = 0; k < n; k++) {
    await page.evaluate(() => window.maze.play(0, 'barbarian-pig'));
    await page.waitForTimeout(1200);
    await page.evaluate((powered) => {
      const l = window.maze.level, m = l.monster;
      if (powered) l.walker.power();
      l.hearts = 3;
      m.state = 'wander'; m.path = [];
      m.pos.set(l.hero.x, 0, l.hero.z - 1.5);
      l.startFight(true);
      const f = l.fight;
      const btn = (down, pressed = false, released = false) => ({ down, pressed, released, held: 0 });
      let last = 0, hold = 0, holding = false;
      f.bot = (f) => {
        const h = f.hero, mo = f.mon, d = mo.x - h.x, t = performance.now() / 1000;
        let moveX = 0, moveZ = 0, block = false, act = false, magDown = false, magUp = false;
        const shots = f.shots.filter((s) => !s.mine && Math.sign(s.vx) === -Math.sign(d) && Math.abs(s.x - h.x) < 1.6);
        if (shots.length) {
          const s = shots[0];
          if (s.kind === 'ring' && s.y > 0.8) moveZ = 1; else moveZ = -1;
        } else if (mo.state === 'tell' && mo.attack === 'swipe' && Math.abs(d) < 2.4) block = true;
        else if (mo.state === 'tell' && mo.attack === 'slam') moveX = Math.sign(h.x - mo.slamX || 1);
        else if (mo.state === 'attack' && mo.attack === 'slam') moveX = Math.sign(h.x - mo.x || 1);
        else {
          if (Math.abs(d) > 1.0) moveX = Math.sign(d);
          if (Math.abs(d) < 1.3 && t - last > 0.42) { act = true; last = t; }
          if (f.walker.powered && Math.abs(d) >= 1.3) {
            // Bolts from range; a blast when it's stunned.
            if (!holding && t - last > 0.5) { holding = true; hold = t; }
            if (holding) {
              magDown = true;
              const want = mo.state === 'stun' ? 0.9 : 0.1;
              if (t - hold > want) { magDown = false; magUp = true; holding = false; last = t; }
            }
          }
        }
        return { moveX, moveZ, b: { action: btn(act, act), sneak: btn(block), map: btn(false), magic: btn(magDown, false, magUp), pause: btn(false) } };
      };
    }, powered);
    const t0 = Date.now();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(500);
      if (shot < 4 && (i === 2 || i === 5)) await page.screenshot({ path: `${out}fight-${shot++}.png` });
      const done = await page.evaluate(() => { const l = window.maze.level; return !l.fight ? 'over' : l.fight.phase === 'won' || l.fight.phase === 'lost' ? l.fight.phase : ''; });
      if (done) break;
    }
    const r = await page.evaluate(() => { const f = window.maze.level.fight; return f ? `${f.phase}: you ${Math.round(f.hero.hp)} hp, it ${Math.round(f.mon.hp)} hp` : 'over'; });
    console.log(`${powered ? 'wand ' : 'stick'} fight ${k + 1}: ${r} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    await page.waitForTimeout(3500);
  }
}
console.log(await page.evaluate(() => `back in the maze: phase ${window.maze.level.phase}, hearts ${window.maze.level.hearts}`));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
