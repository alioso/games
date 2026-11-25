// A Maze In: the town and castle traps behave. Each check starts with 3 hearts and no safety time.
// Usage: node tools/maze-traps2.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
const results = [];
const check = (name, got, want) => { const ok = got === want; results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: lost ${got} heart(s), expected ${want}`); };
async function start(i) {
  await page.evaluate((i) => window.maze.play(i, 'knight-dog'), i);
  await page.waitForTimeout(1500);
}
// Put the hero beside a trap (on an open side), fresh: 3 hearts, no safety, monster away.
async function beside(kind, which = 0) {
  return page.evaluate(([kind, which]) => {
    const l = window.maze.level;
    l.monster.vanish(l.hero);
    const t = l.world.traps.filter((t) => t.trap.kind === kind)[which];
    const [tx, ty] = t.trap.tile;
    // In from one open side, out through another (straight across if it can).
    const open = [[0, 1], [1, 0], [-1, 0], [0, -1]].filter(([dx, dy]) => !l.world.isWallTile(tx + dx, ty + dy));
    const [dx, dy] = open.find(([a, b]) => open.some(([c, d]) => c === -a && d === -b)) ?? open[0];
    const [ex, ey] = open.find(([c, d]) => c === -dx && d === -dy) ?? open.find(([c, d]) => c !== dx || d !== dy);
    const step = tx % 2 && ty % 2 ? 2.4 : 1.9;
    l.hero.set(t.x + dx * step, 0, t.z + dy * step);
    l.hearts = 3; l.safe = 0;
    window.__t = t; window.__far = { x: t.x + ex * step, z: t.z + ey * step };
    return { dx, dy };
  }, [kind, which]);
}
const hearts = () => page.evaluate(() => 3 - window.maze.level.hearts);
// Walk through the middle of it and out the other side.
async function goAcross() {
  await page.evaluate(() => { const l = window.maze.level; l.autoTarget = l.hero.clone().set(window.__t.x, 0, window.__t.z); });
  await page.waitForFunction(() => !window.maze.level.autoTarget, null, { timeout: 8000, polling: 16 }).catch(() => {});
  await page.evaluate(() => { const l = window.maze.level; l.autoTarget = l.hero.clone().set(window.__far.x, 0, window.__far.z); });
}
const waitFor = (fn, ms = 8000) => page.waitForFunction(fn, null, { timeout: ms, polling: 16 });

// ----- the town -----
await start(1);
await beside('manhole'); await goAcross(); await page.waitForTimeout(2000);
check('manhole: walk straight across', await hearts(), 1);
await beside('honey');
await page.evaluate(() => { const l = window.maze.level; l.hero.set(window.__t.x, 0, window.__t.z); });
await page.waitForTimeout(400);
const honey = await page.evaluate(() => ({ slow: window.maze.level.inMud, kind: window.maze.level.slowKind }));
console.log(`${honey.slow && honey.kind === 'honey' ? 'ok  ' : 'FAIL'} honey: stuck ${honey.slow}, ${honey.kind}`); results.push(honey.slow && honey.kind === 'honey');
check('honey: costs nothing', await hearts(), 0);
// Flowerpot: stand still in its room → it lands on you. Then: step aside when the shadow shows.
await beside('flowerpot');
await page.evaluate(() => { const l = window.maze.level; l.hero.set(window.__t.x, 0, window.__t.z); });
await page.waitForTimeout(3500);
check('flowerpot: stand still under it', await hearts(), 1);
await page.evaluate(() => { const l = window.maze.level; l.hearts = 3; l.safe = 0; window.__t.phase = 'wait'; window.__t.t = 0; });
await waitFor(() => window.__t.phase === 'shadow');
await page.evaluate(() => { const l = window.maze.level, t = window.__t; const a = t.aim; l.autoTarget = l.hero.clone().set(t.x - Math.sign(a.x || 1) * 0.9, 0, t.z - Math.sign(a.y || 1) * 0.9); });
await page.waitForTimeout(2500);
check('flowerpot: step away from the shadow', await hearts(), 0);

// ----- the castle -----
await start(2);
// Spikes: walk in while they're up → hurt; dash across just as they've gone down → fine.
await beside('spikes');
await waitFor(() => window.__t.danger);
await page.evaluate(() => { const l = window.maze.level; l.hero.set(window.__t.x, 0, window.__t.z); });
await page.waitForTimeout(300);
check('spikes: step in while they\'re up', await hearts(), 1);
await beside('spikes');
await waitFor(() => !window.__t.danger && window.__t.t > 3.1);
await goAcross(); await page.waitForTimeout(1600);
check('spikes: dash across once they sink', await hearts(), 0);
// Fire: stand in its path while it breathes → hurt; cross while it's quiet → fine.
await beside('fire');
await waitFor(() => window.__t.t > 0.2 && window.__t.t < 0.4);
await goAcross(); await page.waitForTimeout(1300);
check('fire: cross while it\'s quiet', await hearts(), 0);
await beside('fire');
await page.evaluate(() => { const l = window.maze.level, [x0, z0, x1, z1] = window.__t.lane; l.hero.set((x0 + x1) / 2, 0, (z0 + z1) / 2); });
// (3 s: one breath of fire, whenever it comes, but not two.)
await page.waitForTimeout(3000);
check('fire: stand in its path', await hearts(), 1);
// Trapdoor: creep over → fine; run over → it gives way.
await beside('trapdoor');
await page.keyboard.down('ShiftLeft');
await goAcross(); await page.waitForTimeout(4500);
await page.keyboard.up('ShiftLeft');
check('trapdoor: creep across', await hearts(), 0);
await beside('trapdoor');
await goAcross(); await page.waitForTimeout(1800);
check('trapdoor: run across', await hearts(), 1);
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
