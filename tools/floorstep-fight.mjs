// The autopilot fights Gribbles with every hero, at each appearance, and reports who won.
// Usage: node tools/floorstep-fight.mjs [rounds=2] [classes=wizard,knight,barbarian,thief] [style=block|dodge|mash] [monsters=Gribbles,...]
import { chromium } from 'playwright';

const rounds = Number(process.argv[2] ?? 2);
const classes = (process.argv[3] ?? 'wizard,knight,barbarian,thief').split(',');
const style = process.argv[4] ?? 'block';
// Every monster: its only (easy) appearance, its 2nd medium appearance, its 3rd hard appearance.
const only = process.argv[5]?.split(',');
const NAMES = ['Gribbles', 'Claught', 'Zegron', 'Sieger', 'Slashner'];
const cases = NAMES.filter((n) => !only || only.includes(n)).flatMap((n, i) => {
  const k = NAMES.indexOf(n);
  return [
    ['easy', k + 1, `${n} easy`, n],
    ['medium', k * 2 + 2, `${n} medium 2nd`, n],
    ['hard', k * 3 + 3, `${n} hard 3rd`, n],
  ];
});
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);
const rows = [];
for (const cls of classes)
  for (const [d, floor, label, name] of cases)
    for (let r = 0; r < rounds; r++) {
      const res = await page.evaluate(async ({ d, floor, cls, r, style, name }) => {
        const fs = window.floorstep;
        fs.start(d, cls, 1000 + r * 31 + floor);
        const run = fs.run;
        run.floor = floor;
        // Earlier appearances already took their share of its health.
        const n = { easy: 1, medium: 2, hard: 3 }[d];
        const app = ((floor - 1) % n) + 1;
        const max = { Gribbles: 14, Claught: 24, Zegron: 18, Sieger: 20, Slashner: 22 }[name] * (d === 'easy' ? 0.55 : 1);
        if (app > 1) run.monsters[name] = { hp: max * (n - app + 1) / n, injuries: ['ear', 'bandage'] };
        fs.setLook({});
        await new Promise((res) => setTimeout(res, 300));
        const f = fs.floor;
        f.debugRevealAll();
        const m = f.combat.boss;
        f.debugTeleport(m.x + 3, m.z);
        m.hear(m.x, m.z);
        fs.autoplay(true, 6, style);
        const t0 = f.time;
        while (f.time - t0 < 200) {
          await new Promise((res) => setTimeout(res, 200));
          if (fs.floor !== f) break;
          if (f.phase === 'dead' || m.state === 'gone' || m.state === 'dead') break;
        }
        fs.autoplay(false, 1);
        return { result: f.phase === 'dead' ? 'LOST' : m.state === 'dead' ? 'killed' : m.state === 'gone' ? 'fled' : 'timeout', secs: Math.round(f.time - t0), heroHp: run.hp, monsterHp: +m.hp.toFixed(1) };
      }, { d, floor, cls, r, style, name });
      rows.push({ cls, case: label, ...res });
    }
console.table(rows);
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no page errors');
await browser.close();
