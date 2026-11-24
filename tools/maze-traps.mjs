// A Maze In: traps, hearts and riddle keepers. Walks through thorns, hurries then creeps past wasps,
// wades into mud, answers one keeper right and one wrong, then runs out of hearts.
// Usage: node tools/maze-traps.mjs   (pictures in tools/shots/maze/trap-*.png)
import { chromium } from 'playwright';
const out = new URL('./shots/maze/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5177/');
await page.waitForTimeout(1500);
await page.evaluate(() => window.maze.play(0, 'knight-dog'));
await page.waitForTimeout(1500);
const log = (s) => console.log(s);
const state = () => page.evaluate(() => { const l = window.maze.level; return { hearts: l.hearts, phase: l.phase, mud: l.inMud }; });
// Walk straight across a trap's tile (from one side to the other), creeping or not.
async function cross(kind, creep, shot) {
  const ok = await page.evaluate(([kind]) => {
    const l = window.maze.level, t = l.world.traps.find((t) => t.trap.kind === kind);
    if (!t) return false;
    // Approach from an open side.
    const sides = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dz]) => !l.world.solidAt(t.x + dx, t.z + dz) && !l.world.solidAt(t.x - dx, t.z - dz));
    const [dx, dz] = sides[0] ?? [0, 2];
    l.hero.set(t.x + dx, 0, t.z + dz);
    l.autoTarget = l.hero.clone().set(t.x - dx, 0, t.z - dz);
    return true;
  }, [kind]);
  if (!ok) { log(`no ${kind}`); return; }
  if (creep) await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(creep ? 2600 : 900);
  if (shot) await page.screenshot({ path: `${out}${shot}.png` });
  await page.waitForTimeout(900);
  if (creep) await page.keyboard.up('ShiftLeft');
  log(`${kind}${creep ? ' (creeping)' : ''}: ${JSON.stringify(await state())}`);
  await page.waitForTimeout(2200);
}
await cross('thorns', false, 'trap-thorns');
await cross('wasps', true, 'trap-wasps-creep');
await cross('wasps', false, 'trap-wasps');
// Mud.
await page.evaluate(() => { const l = window.maze.level, t = l.world.traps.find((t) => t.trap.kind === 'mud'); l.hero.set(t.x, 0, t.z); });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}trap-mud.png` });
log(`mud: ${JSON.stringify(await state())}`);
// Keepers: the first one right, the second wrong.
for (const [i, right] of [[0, true], [1, false]]) {
  await page.evaluate((i) => { const l = window.maze.level, k = l.keepers[i], p = k.root.position; const opts = [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].filter(([dx, dz]) => !l.world.solidAt(p.x + dx, p.z + dz)); l.hero.set(p.x + opts[0][0], 0, p.z + opts[0][1]); }, i);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}keeper-${i}-near.png` });
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}keeper-${i}-riddle.png` });
  const riddle = await page.evaluate(() => window.maze.level.lastRiddle);
  const label = right ? riddle.right : riddle.wrong[0];
  await page.locator('.menu-btn', { hasText: label }).first().click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}keeper-${i}-after.png` });
  log(`keeper ${i} "${riddle.q}" answered ${right ? 'right' : 'wrong'}: blocking ${await page.evaluate((i) => window.maze.level.keepers[i].blocking, i)}`);
}
// Out of hearts: thorns until none are left.
for (let n = 0; n < 4 && (await state()).phase === 'explore'; n++) await cross('thorns', false);
log(`after more thorns: ${JSON.stringify(await state())}`);
await page.waitForTimeout(3500);
log(`restarted: ${JSON.stringify(await state())}`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
