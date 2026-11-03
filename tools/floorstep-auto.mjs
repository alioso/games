// Lets the autopilot play whole floors at high speed and reports how long each took.
// Usage: node tools/floorstep-auto.mjs [floors=6] [difficulty=hard]
import { chromium } from 'playwright';

const floors = Number(process.argv[2] ?? 6);
const difficulty = process.argv[3] ?? 'hard';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);
await page.evaluate((d) => { window.floorstep.start(d, 'thief', 777); window.floorstep.autoplay(true, 8); }, difficulty);

let last = { floor: 1, t: 0 };
const t0 = Date.now();
const results = [];
while (Date.now() - t0 < 60000 * floors) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const f = window.floorstep.floor, r = window.floorstep.run;
    return { floor: r ? r.floor : -1, time: f.time, phase: f.phase, key: f.hasKey, searched: f.pieces.filter((p) => p.searched && p.p.find).length, skipped: window.floorstep.autopilot?.skipped.size ?? 0, x: f.hero.x.toFixed(1), z: f.hero.z.toFixed(1) };
  });
  if (s.floor !== last.floor) {
    results.push({ floor: last.floor, gameSeconds: +last.t.toFixed(0), searched: last.searched, skipped: last.skipped });
    if (results.length >= floors || s.floor < 0) break;
  }
  if (s.time > 400) {
    results.push({ floor: s.floor, STUCK: true, ...s });
    // What was it trying to do?
    console.log(JSON.stringify(await page.evaluate(() => {
      const f = window.floorstep.floor, a = window.floorstep.autopilot;
      const t = f.interactTarget();
      const g = typeof a.goal === 'number' ? f.pieces[a.goal].p : null;
      const e = f.plan.exit;
      return {
        goal: a.goal, goalPiece: g && { kind: g.kind, box: g.box, room: g.room }, path: a.path, stuck: a.stuck,
        target: t === 'exit' ? 'exit' : t ? t.p.kind : null, exit: { c: e.c, at: e.at, room: e.hi }, exitOpen: f.exitOpen,
        heroRoom: f.plan.rooms.findIndex((r) => r.rect.x0 <= f.hero.x && f.hero.x <= r.rect.x1 && r.rect.z0 <= f.hero.z && f.hero.z <= r.rect.z1),
        key: (() => { const k = f.keyPiece; return { id: k.p.id, kind: k.p.kind, box: k.p.box, rot: k.p.rot, room: k.p.room, roomRect: f.plan.rooms[k.p.room].rect, skipped: a.skipped.has(f.pieces.indexOf(k)), near: f.pieces.filter((q) => q !== k && !q.gone && Math.abs((q.p.box.x0 + q.p.box.x1) / 2 - (k.p.box.x0 + k.p.box.x1) / 2) < 2 && Math.abs((q.p.box.z0 + q.p.box.z1) / 2 - (k.p.box.z0 + k.p.box.z1) / 2) < 2).map((q) => ({ kind: q.p.kind, box: q.p.box, moved: !!q.slide })) }; })(),
        doors: f.house.doors.map((d) => ({ id: d.door.id, kind: d.door.kind, opened: d.opened, lo: d.door.lo, hi: d.door.hi })).filter((d) => d.lo === e.hi || d.hi === e.hi),
      };
    })));
    break;
  }
  last = { floor: s.floor, t: s.time, searched: s.searched, skipped: s.skipped };
}
console.table(results);
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no page errors');
await browser.close();
