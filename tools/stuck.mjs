// Hunts for rounds that never end: plays many computer-only rounds per arena and difficulty,
// and dumps who is where when a round runs past the time limit. Needs `npm run dev`.
// node tools/stuck.mjs [runsPerCase] [limitSeconds]
import { chromium } from 'playwright';
const runs = Number(process.argv[2] ?? 15), limit = Number(process.argv[3] ?? 180);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
for (const arena of ['grassy-pond', 'volcano', 'jungle', 'beach', 'ruins', 'clouds']) {
  for (const diff of ['easy', 'normal', 'hard']) {
    const r = await page.evaluate(([arena, diff, runs, limit]) => {
      const { Match, particles, glow } = window.blocstrike.debug;
      window.blocstrike.useArena(arena);
      const a = window.blocstrike.arena;
      const W = ['spear', 'sword', 'lightsaber', 'hammer', 'crossbow', 'bazooka', 'grenade', 'flamethrower', 'machinegun'];
      const pick = () => W[Math.floor(Math.random() * W.length)];
      const quiet = { banner() {}, shake() {}, slowmo() {}, countdown() {}, over() {} };
      const stuck = [];
      let total = 0;
      for (let i = 0; i < runs; i++) {
        a.reset();
        a.muted = true;
        const lo = [[pick(), pick(), pick()], [pick(), pick(), pick()]];
        const m = new Match(a, { humans: [], looks: [], loadouts: lo, teamCount: 2, difficulty: diff, demo: true }, particles, glow, quiet);
        while (m.phase !== 'over' && m.time < limit) m.update(1 / 60, []);
        total += m.time;
        if (m.phase !== 'over') {
          // Watch for 3 more seconds: who moves?
          const before = m.blocs.map((b) => [b.x, b.z]);
          for (let k = 0; k < 180; k++) m.update(1 / 60, []);
          stuck.push(m.blocs.map((b, j) => {
            const moved = Math.hypot(b.x - before[j][0], b.z - before[j][1]).toFixed(1);
            const br = m.brains.get(b);
            return `${b.team.name[0]}${b.isBunny ? 'bun' : ':' + b.weapon.slice(0, 5)} ${b.state} @(${b.x.toFixed(1)},${b.z.toFixed(1)}) moved ${moved}` +
              (br ? ` tgt=${br.target ? (br.target.isBunny ? 'bun' : br.target.team.name[0]) + '@' + br.target.x.toFixed(1) + ',' + br.target.z.toFixed(1) : '-'} path=${br.path.length}${br.path[0] ? '→' + br.path[0].x.toFixed(1) + ',' + br.path[0].z.toFixed(1) : ''} navBlocked=${a.nav.isBlocked(b.x, b.z)}` : '') +
              (b.isBunny ? ` hp${b.hp}` : ` ammo${b.ammo} fuel${b.fuel.toFixed(0)}`);
          }).join('\n      '));
        }
        m.dispose();
      }
      a.reset();
      return { avg: (total / runs).toFixed(1), stuck };
    }, [arena, diff, runs, limit]);
    console.log(`${arena.padEnd(12)} ${diff.padEnd(7)} avg ${r.avg}s  stuck ${r.stuck.length}/${runs}`);
    r.stuck.slice(0, 2).forEach((s) => console.log('      ' + s));
  }
}
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no errors');
await browser.close();
