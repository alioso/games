// Shooting practice for the numbers: your striker shoots from various spots against the keeper,
// at each difficulty, and we count goals, saves and misses.
// With "them", the computer's striker shoots (the way its brain does) at your keeper instead.
// Usage: node tools/soccer-shots.mjs [shots per level=24] [them]
import { chromium } from 'playwright';
const n = Number(process.argv[2] ?? 24);
const them = process.argv[3] === 'them';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
const rows = [];
for (const level of ['easy', 'medium', 'hard']) {
  const tally = { level, goal: 0, saved: 0, wide: 0, other: 0, noshot: 0 };
  await page.evaluate((lv) => { window.soccer.start('duck', 'pig', 20, lv); window.soccer.speed(3); }, level);
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(async ([i, them]) => {
      const m = window.soccer.match;
      m.restart = null; m.phase = 'play'; m.phaseT = 0;
      m.autopilot = them;
      const att = m.sides[them ? 1 : 0], def = m.sides[them ? 0 : 1];
      const gx = 22 * att.dir;
      const h = att.players[6];
      if (!them) m.setHuman(h);
      // Spots around the box, distances 7-16 m.
      const d = 7 + (i % 4) * 3, ang = ((i % 5) - 2) * 0.28;
      const x = gx - Math.cos(ang) * d * att.dir, z = Math.sin(ang) * d;
      h.teleport(x, z, Math.atan2(gx - x, -z));
      m.ball.place(x + Math.sin(h.yaw) * 0.4, z + Math.cos(h.yaw) * 0.4);
      m.ball.owner = h;
      def.players.forEach((p) => { if (p.role !== 'gk') p.teleport(-15 * att.dir, p.z, 0); });
      att.players.forEach((p) => { if (p !== h && p.role !== 'gk') p.teleport(-12 * att.dir, p.z, 0); });
      const k = def.players[0]; k.teleport(gx - att.dir * 0.7, z * 0.15, -att.dir * Math.PI / 2);
      await new Promise((res) => setTimeout(res, 250));
      if (them) {
        // The way the computer's brain shoots (and keep its brain from changing its mind).
        att.brain.next.set(h, m.time + 5);
        const toGoal = Math.hypot(gx - h.x, h.z), GW = 2.3;
        const gz = (Math.random() < 0.5 ? -1 : 1) * (GW - 0.4 - Math.random() * 0.6);
        const power = Math.min(0.88, 0.45 + toGoal / 35 + Math.random() * 0.2);
        m.orders.set(h, { kind: 'shot', power, aimX: att.dir, aimZ: 0, goalZ: gz, goalY: 0.2 + Math.random() * 0.9, curl: -Math.sign(gz) * att.dir * (Math.random() < 0.75 ? 1 : -0.4) * (0.2 + Math.random() * 0.5), until: m.time + 1 });
      } else {
        // Aim at a corner (stick up or down), medium-ish power.
        const aimZ = i % 2 ? 1 : -1;
        m.orders.set(h, { kind: 'shot', power: 0.45 + (i % 3) * 0.15, aimX: 1, aimZ, until: m.time + 1 });
      }
      // The shot's over at a goal, the ball going out, or anyone else touching it.
      const start = m.time;
      let first = null;
      while (m.time - start < 3) {
        await new Promise((res) => setTimeout(res, 20));
        if (m.phase === 'goal') return first ? 'other' : 'goal';
        if (m.phase === 'out' || m.phase === 'restart') return first?.role === 'gk' ? 'saved' : first ? 'other' : 'wide';
        const lt = m.ball.lastTouch;
        if (lt && lt !== h && m.time - start > 0.2) first = first ?? lt;
        if (first?.role === 'gk') return 'saved';
        if (first) return 'other';
      }
      return m.ball.owner === h ? 'noshot' : 'other';
    }, [i, them]);
    tally[r]++;
    if (r === 'goal') await page.evaluate(() => new Promise((res) => setTimeout(res, 2000)));
  }
  const shots = n - tally.noshot;
  tally['goal%'] = Math.round((tally.goal / shots) * 100);
  rows.push(tally);
}
console.table(rows);
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no page errors');
await browser.close();
