// Stages each weapon, the bunny and the shop, and screenshots them to tools/shots/. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: out + name + '.png' });
await page.goto('http://localhost:5173/');
await wait(1500);

/** Start a 1-player game with a weapon, freeze everyone else, put P1 at (x, z) aiming right with two reds ahead. */
async function stage(weapon, x = -9, z = -4) {
  await page.evaluate((weapon) => {
    const { settings, startGame } = window.blocstrike;
    Object.assign(settings, {
      players: 1, coins: 999, enemyWeapon: 'spear',
      ownedSkins: ['beginner', 'noob', 'bronze', 'silver', 'pro', 'gold', 'rainbow'],
      ownedHats: ['cap', 'wizard', 'tophat', 'sombrero', 'cowboy', 'crown', 'party', 'viking', 'chef', 'beanie'],
      ownedWeapons: ['spear', 'bazooka', 'grenade', 'flamethrower'],
    });
    settings.looks[0] = { skin: 'gold', hat: 'wizard' };
    settings.weapons[0] = weapon;
    startGame();
  }, weapon);
  await wait(4200);
  await page.evaluate(([x, z]) => {
    const m = window.blocstrike.match;
    const p1 = m.human(0);
    for (const b of m.blocs) if (b !== p1) m.brains.delete(b);
    p1.x = x; p1.z = z; p1.aimX = 1; p1.aimZ = 0;
    const reds = m.blocs.filter((b) => b.team.id === 1 && !b.isBunny);
    reds[0].x = x + 5.5; reds[0].z = z;
    reds[1].x = x + 6.3; reds[1].z = z + 0.9;
  }, [x, z]);
  await wait(200);
}
const deadReds = () => page.evaluate(() => window.blocstrike.match.blocs.filter((b) => b.team.id === 1 && !b.isBunny && b.state !== 'alive').length);

await stage('bazooka');
await page.keyboard.press('Space');
await wait(250);
await shot('w1-bazooka-flying');
await wait(150);
await shot('w2-bazooka-boom');
console.log('bazooka: red blocs down =', await deadReds());

await stage('grenade', -12, -5);
await page.keyboard.down('Space');
await wait(300);
await page.keyboard.up('Space');
await wait(700);
await shot('w4-grenade-landed');
await wait(700);
await shot('w5-grenade-boom');
console.log('grenade: red blocs down =', await deadReds());

await stage('flamethrower', -6, -4);
await page.evaluate(() => { const m = window.blocstrike.match; const r = m.blocs.filter((b) => b.team.id === 1 && !b.isBunny); r[0].x = -3.2; r[1].x = -2.6; });
await page.keyboard.down('Space');
await wait(250);
await shot('w6-flames');
await wait(500);
await page.keyboard.up('Space');
console.log('flamethrower: red blocs down =', await deadReds());

await page.evaluate(() => {
  const m = window.blocstrike.match;
  const bun = m.blocs.find((b) => b.isBunny && b.team.id === 0);
  bun.x = -2; bun.z = 6; bun.yaw = 0.4;
});
await wait(600);
await shot('b1-bunny');
const hp = await page.evaluate(() => {
  const m = window.blocstrike.match;
  const bun = m.blocs.find((b) => b.isBunny && b.team.id === 1);
  m.damageBunny(bun, null, 1, 0);
  return bun.hp;
});
await wait(300);
await shot('b2-bunny-hit');
console.log('red bunny hp after one hit:', hp);

await page.evaluate(() => { window.blocstrike.goMenu(); window.blocstrike.shop.open(); });
await wait(1200);
await shot('s1-shop-blocs');
await page.evaluate(() => [...document.querySelectorAll('.row button')][1].click());
await wait(800);
await shot('s2-shop-hats');
await page.evaluate(() => [...document.querySelectorAll('.row button')][2].click());
await wait(800);
await shot('s3-shop-weapons');

// Buying with a fresh wallet: the cap takes two clicks; the gold bloc is too expensive.
await page.evaluate(() => {
  const { settings, shop } = window.blocstrike;
  Object.assign(settings, { coins: 25, ownedHats: [], ownedSkins: ['beginner'] });
  settings.looks[0] = { skin: 'beginner', hat: null };
  shop.open();
  [...document.querySelectorAll('.row button')][1].click();
});
await wait(500);
const card = (name) => `[...document.querySelectorAll('.card')].find((c) => c.querySelector('.title').textContent === '${name}')`;
const tag = (name) => page.evaluate(`${card(name)}.querySelector('.tag').textContent`);
await page.evaluate(`${card('Cap')}.click()`);
console.log('cap after 1 click:', await tag('Cap'));
await page.evaluate(`${card('Cap')}.click()`);
await wait(200);
const s = await page.evaluate(() => ({ coins: window.blocstrike.settings.coins, hat: window.blocstrike.settings.looks[0].hat }));
console.log('cap after 2 clicks:', await tag('Cap'), '| coins:', s.coins, '| wearing:', s.hat);
await shot('s4-bought-cap');
await page.evaluate(() => [...document.querySelectorAll('.row button')][0].click());
await wait(300);
await page.evaluate(`${card('Gold Bloc')}.click()`);
console.log('gold bloc with 5 coins:', await tag('Gold Bloc'), '| coins:', await page.evaluate(() => window.blocstrike.settings.coins));

console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
