// Stages the arena features and new mechanics, checks them, and screenshots to tools/shots/f-*.png. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}f-${n}.png` });
const ev = (fn, arg) => page.evaluate(fn, arg);
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` (${detail})` : ''}`); };
await page.goto('http://localhost:5173/');
await wait(1500);

/** New 1-player round in an arena with a weapon; everyone else frozen; P1 placed at (x, z) facing +x. */
async function stage(arena, weapon, x, z) {
  await ev(([arena, weapon]) => {
    const { settings, startGame } = window.blocstrike;
    Object.assign(settings, { players: 1, ownedArenas: ['grassy-pond', 'volcano', 'jungle', 'beach'], arena });
    settings.ownedWeapons = ['spear', 'sword', 'bazooka', 'grenade', 'flamethrower', 'machinegun'];
    settings.weapons[0] = weapon;
    startGame();
  }, [arena, weapon]);
  await wait(4300);
  await ev(([x, z]) => {
    const m = window.blocstrike.match;
    const p1 = m.human(0);
    for (const b of m.blocs) if (b !== p1) { m.brains.delete(b); b.x = b.team.id ? 14 : -14; b.z = (b.id % 5) - 8; }
    p1.x = x; p1.z = z; p1.aimX = 1; p1.aimZ = 0;
  }, [x, z]);
  await wait(100);
}
const p1 = () => ev(() => { const b = window.blocstrike.match.human(0); return { x: b.x, z: b.z, state: b.state, air: b.air, crouch: b.crouch, reload: b.reload, mag: b.mag }; });
/** Put the first red (or blue teammate) bloc somewhere. */
const place = (team, x, z, i = 0) => ev(([team, x, z, i]) => {
  const b = window.blocstrike.match.blocs.filter((b) => b.team.id === team && !b.isBunny && b.human === null)[i];
  b.x = x; b.z = z; b.state = 'alive';
  return b.id;
}, [team, x, z, i]);
const stateOf = (id) => ev((id) => window.blocstrike.match.blocs.find((b) => b.id === id).state, id);

// A. Jump over the lava river on the volcano.
await stage('volcano', 'spear', -2.2, -3);
await page.keyboard.down('KeyD');
await page.keyboard.press('ShiftLeft');
await wait(500);
check('A1 crouches before jumping', (await p1()).crouch > 0);
await wait(780);
await shot('jump-midair');
check('A2 in the air over the lava', (await p1()).air > 0, `x=${(await p1()).x.toFixed(2)}`);
await wait(600);
await page.keyboard.up('KeyD');
let s = await p1();
check('A3 lands safely across the river', s.state === 'alive' && s.x > 1.4, `x=${s.x.toFixed(2)} ${s.state}`);
// Walking into the river instead: sizzle.
await stage('volcano', 'spear', -2.2, -3);
await page.keyboard.down('KeyD');
await wait(900);
await page.keyboard.up('KeyD');
await wait(300);
await shot('lava-sizzle');
check('A4 walking into lava is the end', (await p1()).state === 'eaten');

// B. Sliding bridge pulls apart under a bloc.
await stage('volcano', 'spear', -12, -4);
const onBridge = await place(1, 0.2, 0);
await ev(() => { const t = window.blocstrike.arena.terrain; t.time = 0.5 * 12; });
await wait(1600);
await shot('bridge-open');
check('B1 bloc on the sliding bridge falls in when it opens', (await stateOf(onBridge)) === 'eaten', await stateOf(onBridge));

// C. Jungle gate blocks walking and spears.
await stage('jungle', 'spear', -4.8, -6.4);
await ev(() => { window.blocstrike.arena.terrain.time = 7; });
await wait(300);
const h = await ev(() => window.blocstrike.arena.terrain.gates[0].h);
await page.keyboard.down('KeyD');
await wait(1200);
await page.keyboard.up('KeyD');
s = await p1();
check('C1 raised gate blocks the way', h > 0.9 && s.x < -2.2, `gate h=${h.toFixed(2)} x=${s.x.toFixed(2)}`);
await stage('jungle', 'spear', -4.8, -6.4);
await ev(() => { window.blocstrike.arena.terrain.time = 7; });
await wait(200);
await page.keyboard.press('Space');
await wait(500);
const spear = await ev(() => { const sp = window.blocstrike.match.human(0).spear; return { state: sp.state, x: sp.x }; });
check('C2 spear sticks in the gate', spear.state === 'stuck' && spear.x < -1.5, `${spear.state} x=${spear.x.toFixed(2)}`);
await shot('gate');

// D. Explosions break props: trees in one blast, rocks in two.
await stage('grassy-pond', 'bazooka', -12, -6.2);
const tree = () => ev(() => window.blocstrike.arena.terrain.props.find((p) => p.x === -7.8 && p.z === -6.2).alive);
await page.keyboard.press('Space');
await wait(700);
await shot('tree-blast');
check('D1 bazooka destroys a tree', (await tree()) === false);
await ev(() => { const p = window.blocstrike.match.human(0); p.x = -13; p.z = -2; p.aimX = 1; p.aimZ = 0; p.reload = 0; });
const rock = () => ev(() => { const r = window.blocstrike.arena.terrain.props.find((p) => p.x === -9.8 && p.z === -2); return `${r.alive}/${r.hp}`; });
await page.keyboard.press('Space');
await wait(500);
const afterOne = await rock();
await ev(() => { window.blocstrike.match.human(0).reload = 0; });
await page.keyboard.press('Space');
await wait(500);
check('D2 rock survives one blast, breaks on the second', afterOne === 'true/1' && (await rock()) === 'false/0', `${afterOne} → ${await rock()}`);

// E. Flamethrower burns a tree down.
await stage('grassy-pond', 'flamethrower', -9.5, -6.2);
await page.keyboard.down('Space');
await wait(2800);
await shot('tree-burning');
await page.keyboard.up('Space');
check('E1 flames burn a tree down', (await tree()) === false);

// F. Sword: hits an enemy in front, and a teammate too (friendly fire).
await stage('grassy-pond', 'sword', -10, -4);
const foe = await place(1, -8.7, -4);
const mate = await place(0, -9.1, -3.1);
await page.keyboard.press('Space');
await wait(120);
await shot('sword');
await wait(200);
check('F1 sword knocks out the enemy in front', (await stateOf(foe)) === 'dead');
check('F2 sword also hits a teammate in the arc', (await stateOf(mate)) === 'dead');

// G. Machine gun: fires for 2 s, then reloads for 2 s.
await stage('grassy-pond', 'machinegun', -10, -4);
const target = await place(1, -5, -4);
await page.keyboard.down('Space');
await wait(700);
await shot('machinegun');
await wait(1600);
s = await p1();
check('G1 knocks out a bloc in front', (await stateOf(target)) === 'dead');
check('G2 reloads after 2 s of firing', s.reload > 0, `reload=${s.reload.toFixed(2)}`);
await page.keyboard.up('Space');
await wait(2100);
s = await p1();
check('G3 ready again after reloading', s.reload <= 0 && s.mag > 1.9);

// H. Bunnies dodge-hop away from spears.
const hops = await ev(() => {
  const { Match, particles, glow } = window.blocstrike.debug;
  const arena = window.blocstrike.arena;
  const quiet = { banner() {}, shake() {}, slowmo() {}, countdown() {}, over() {} };
  let hopped = 0;
  for (let i = 0; i < 20; i++) {
    const m = new Match(arena, { humans: [], looks: [], loadouts: [['spear', 'spear', 'spear'], ['spear', 'spear', 'spear']], teamCount: 2, difficulty: 'normal', demo: true }, particles, glow, quiet);
    const bun = m.blocs.find((b) => b.isBunny && b.team.id === 1);
    const shooter = m.blocs.find((b) => b.team.id === 0 && !b.isBunny);
    for (const b of m.blocs) if (b !== bun) m.brains.delete(b);
    shooter.x = bun.x - 8; shooter.z = bun.z;
    m.weapons.get('spear').spears.find((s) => s.owner === shooter).launch(shooter.x + 0.5, shooter.z, 1, 0);
    shooter.armed = false;
    let did = false;
    for (let t = 0; t < 40; t++) { m.update(1 / 60, []); if (bun.hop > 0) did = true; }
    if (did) hopped++;
    m.dispose();
  }
  arena.reset();
  return hopped;
});
check('H1 bunnies hop out of the way of spears most of the time', hops >= 10, `${hops}/20`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no errors');
await browser.close();
