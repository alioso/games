// BB Golf: the golfer's putting stance and swing, seen face-on and down the line, at the top of the
// backswing, at the ball and in the follow-through; then the game's own aim and power views.
// Usage: node tools/golf-pose.mjs [character id] [hole]
import { chromium } from 'playwright';
const id = process.argv[2] ?? 'wizard-duck', holeNo = Number(process.argv[3] ?? 1);
const out = new URL('./shots/golf/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1200);
await page.evaluate(([n, id]) => window.golf.play(n - 1, id), [holeNo, id]);
await page.keyboard.press('Space');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}pose-aim.png` });
await page.keyboard.down('Space');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}pose-charge.png` });
await page.keyboard.up('Space');
await page.waitForTimeout(160);
await page.screenshot({ path: `${out}pose-hit.png` });
await page.waitForFunction(() => window.golf.hole.phase === 'aim' && !window.golf.hole.physics.moving && !window.golf.hole.player.golfer.walking, null, { timeout: 30000 });
for (const [name, side, fwd] of [['face', 1, 0], ['line', 0.25, -1]]) {
  for (const sw of [-1, -0.4, 0, 0.8]) {
    await page.evaluate(([sw, side, fwd]) => {
      const h = window.golf.hole, g = h.player.golfer.root, V = g.position.constructor;
      const yaw = h.player.golfer.yaw, f = [Math.sin(yaw), Math.cos(yaw)];
      const [dx, dz] = h.dir;
      h.freezeSwing = sw;
      h.camOverride = {
        pos: new V(g.position.x + f[0] * 2.2 * side + dx * 2.6 * fwd, g.position.y + 0.7, g.position.z + f[1] * 2.2 * side + dz * 2.6 * fwd),
        look: new V(g.position.x + f[0] * 0.2, g.position.y + 0.45, g.position.z + f[1] * 0.2),
      };
    }, [sw, side, fwd]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}pose-${name}-${sw}.png` });
  }
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
