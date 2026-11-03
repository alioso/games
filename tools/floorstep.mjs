// Floor Step smoke test: menus, a floor, searching, the key, the exit; plus a floor-generator sweep.
// Usage: npm run dev:floor (in another terminal), then: node tools/floorstep.mjs [shots|gen|all]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const mode = process.argv[2] ?? 'all';
const url = 'http://localhost:5174/';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => { errors.push(`[pageerror] ${e.message}`); console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' / ')); });
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: out + name + '.png' });

await page.goto(url);
await wait(2500);

if (mode === 'gen' || mode === 'all') {
  const stats = await page.evaluate(() => {
    const fs = window.floorstep;
    const res = { floors: 0, failed: 0, pieces: 0, searchable: 0, rooms: 0, ms: 0 };
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      try {
        const p = fs.generateFloor(1000 + i * 17, 1 + (i % 15));
        res.floors++;
        res.pieces += p.pieces.length;
        res.rooms += p.rooms.length;
        res.searchable += p.pieces.filter((x) => x.find && x.kind !== 'lamp' && x.kind !== 'candles' && x.kind !== 'coatrack' && x.kind !== 'chair').length;
        if (p.keyPiece < 0) res.failed++;
      } catch (e) { res.failed++; }
    }
    res.ms = Math.round((performance.now() - t0) / 300);
    res.pieces = +(res.pieces / res.floors).toFixed(1);
    res.rooms = +(res.rooms / res.floors).toFixed(1);
    res.searchable = +(res.searchable / res.floors).toFixed(1);
    return res;
  });
  console.log('generator:', JSON.stringify(stats));
}

if (mode === 'shots' || mode === 'all') {
  await shot('1-title');
  await page.keyboard.press('Enter');
  await wait(400);
  await page.keyboard.press('Enter');
  await wait(600);
  await shot('2-classes');
  await page.evaluate(() => window.floorstep.start('medium', 'wizard', 4242));
  await wait(600);
  // Exploring only: send the monster away so it doesn't start a fight scene.
  await page.evaluate(() => window.floorstep.floor.combat.monsters.forEach((m) => m.vanish()));
  await shot('3-arrive');
  await wait(2500);
  await shot('4-start-room');

  // Walk to the nearest searchable thing and search it.
  const target = await page.evaluate(() => {
    const f = window.floorstep.floor;
    const h = f.hero;
    const room = f.plan.startRoom;
    const cand = f.pieces.filter((r) => r.p.room === room && !r.searched);
    cand.sort((a, b) => Math.hypot(a.p.x - h.x, a.p.z - h.z) - Math.hypot(b.p.x - h.x, b.p.z - h.z));
    return cand[0] ? { kind: cand[0].p.kind, x: cand[0].p.x, z: cand[0].p.z, box: cand[0].p.box } : null;
  });
  console.log('nearest searchable in start room:', target?.kind);
  if (target) {
    await page.evaluate((t) => {
      const f = window.floorstep.floor;
      // Stand just in front of it.
      const cx = (t.box.x0 + t.box.x1) / 2, cz = (t.box.z0 + t.box.z1) / 2;
      const dx = f.hero.x - cx, dz = f.hero.z - cz, l = Math.hypot(dx, dz) || 1;
      const hw = Math.max(t.box.x1 - t.box.x0, t.box.z1 - t.box.z0) / 2;
      f.debugTeleport(cx + (dx / l) * (hw + 0.5), cz + (dz / l) * (hw + 0.5));
    }, target);
    await wait(500);
    await shot('5-prompt');
    await page.keyboard.press('KeyE');
    await wait(500);
    await shot('6-searching');
    await wait(1500);
    await shot('7-searched');
  }

  // Go straight to the key.
  const key = await page.evaluate(() => {
    const f = window.floorstep.floor;
    f.debugRevealAll();
    const k = f.keyPiece;
    const b = k.p.box;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const fx = Math.sin(k.p.rot), fz = Math.cos(k.p.rot);
    const hd = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
    f.debugTeleport(cx + fx * (hd + 0.45), cz + fz * (hd + 0.45));
    f.hero.yaw = Math.atan2(-fx, -fz);
    return { kind: k.p.kind, room: f.plan.rooms[k.p.room].type };
  });
  console.log('key is in:', key);
  await wait(700);
  await shot('8-overview');
  await page.keyboard.press('KeyE');
  await wait(2500);
  await shot('9-key');
  const hasKey = await page.evaluate(() => window.floorstep.floor.hasKey);
  console.log('has key:', hasKey);

  // To the exit, unlock, climb.
  await page.evaluate(() => {
    const f = window.floorstep.floor;
    const e = f.plan.exit;
    f.debugTeleport(e.c, e.at + 0.8);
    f.hero.yaw = Math.PI;
  });
  await wait(600);
  await page.keyboard.press('KeyE');
  await wait(900);
  await shot('10-unlocked');
  await page.keyboard.down('KeyW');
  await wait(1500);
  await page.keyboard.up('KeyW');
  await wait(2500);
  const st = await page.evaluate(() => ({ floor: window.floorstep.run.floor, phase: window.floorstep.floor.phase }));
  console.log('after exit:', st);
  await shot('11-floor2');
  // Bigger floor look.
  await page.evaluate(() => { const r = window.floorstep.run; r.floor = 9; window.floorstep.setLook({ cls: 'knight', animal: 'dragon', name: 'MightyMac' }); });
  await wait(3500);
  await shot('12-knight');
}

if (mode === 'fight') {
  // The autopilot fights Gribbles to the death on easy; snapshots along the way.
  await page.evaluate(() => {
    const fs = window.floorstep;
    fs.start('easy', process?.cls ?? 'knight', 321);
  }).catch(() => page.evaluate(() => window.floorstep.start('easy', 'knight', 321)));
  await wait(2500);
  await page.evaluate(() => {
    const fs = window.floorstep, f = fs.floor;
    f.debugRevealAll();
    const m = f.combat.boss;
    f.debugTeleport(m.x + 2.6, m.z + 0.3);
    m.hear(m.x, m.z);
    fs.autoplay(true, 1);
  });
  for (let i = 0; i < 14; i++) {
    await wait(900);
    await shot(`fight-${String(i).padStart(2, '0')}`);
    const st = await page.evaluate(() => { const m = window.floorstep.floor.combat.boss; return m.state; });
    if (st === 'dead') { await wait(1200); await shot('fight-dead'); break; }
  }
}

if (mode === 'showcase') {
  // Search one of each kind of furniture and photograph it mid-search and after.
  await page.evaluate(() => window.floorstep.start('hard', 'barbarian', 99));
  await wait(3000);
  const kinds = (process.argv[3] ?? 'wardrobe,crate,bookcase,bed,fireplace,painting').split(',');
  for (let floorN = 1, left = [...kinds]; left.length && floorN < 8; floorN++) {
    if (floorN > 1) {
      await page.evaluate((n) => { window.floorstep.run.floor = n; window.floorstep.setLook({}); }, floorN);
      await wait(2500);
    }
    for (const kind of [...left]) {
      const ok = await page.evaluate((kind) => {
        const f = window.floorstep.floor;
        f.debugRevealAll();
        const r = f.pieces.find((q) => q.p.kind === kind && !q.searched);
        if (!r) return false;
        const b = r.p.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const fx = Math.sin(r.p.rot), fz = Math.cos(r.p.rot);
        const hd = Math.abs(fx) > 0.5 ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2;
        f.debugTeleport(cx + fx * (hd + 0.5), cz + fz * (hd + 0.5));
        f.hero.yaw = Math.atan2(-fx, -fz);
        return true;
      }, kind);
      if (!ok) continue;
      left.splice(left.indexOf(kind), 1);
      await wait(400);
      await page.keyboard.press('KeyE');
      await wait(450);
      await shot(`show-${kind}-a`);
      await wait(1500);
      await shot(`show-${kind}-b`);
    }
  }
}

console.log(errors.length ? errors.slice(0, 15).join('\n') : 'no console errors');
await browser.close();
